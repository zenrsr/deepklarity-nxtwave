from __future__ import annotations

import datetime as dt
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, AnyHttpUrl, Field

from app.cache.storage import QUIZ_STORE
from app.services.scraper import fetch_wikipedia 
from app.services.quiz_generator import generate_quiz_payload
import asyncio

log = logging.getLogger(__name__)
router = APIRouter()

LLM_CONCURRENCY = int(1)
_llm_sem = asyncio.Semaphore(LLM_CONCURRENCY)



class GenerateQuizRequest(BaseModel):
    url: AnyHttpUrl
    force: bool = False


class QuizMeta(BaseModel):
    id: int
    url: AnyHttpUrl
    title: str
    date_generated: str


class QuizItem(BaseModel):
    question: str
    options: List[str] = Field(min_length=4, max_length=4)
    answer: str
    difficulty: str
    explanation: str
    evidence_span: str


class KeyEntities(BaseModel):
    people: List[str]
    organizations: List[str]
    locations: List[str]


class QuizPayload(BaseModel):
    title: str
    summary: str
    key_entities: KeyEntities
    sections: List[str]
    quiz: List[QuizItem] = Field(min_length=1)
    related_topics: List[str]
    notes: Optional[str] = None


class QuizResponse(BaseModel):
    id: int
    url: AnyHttpUrl
    title: str
    date_generated: str
    full_quiz_data: QuizPayload


class GradeRequest(BaseModel):
    id: int
    answers: List[int] 


class PerQuestionResult(BaseModel):
    index: int
    chosen: int
    correct: int
    is_correct: bool
    explanation: str
    evidence_span: str


class GradeResponse(BaseModel):
    id: int
    total: int
    correct: int
    score: float
    results: List[PerQuestionResult]



def _now_str() -> str:
    return dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _derive_correct_index(q: Dict[str, Any]) -> int:
    """
    We store "answer" as the option text. Convert to index (0..3).
    Fallback: if not found, mark index -1 (treated as incorrect during grading).
    """
    opts: List[str] = q.get("options", [])
    ans: str = q.get("answer", "")
    try:
        return opts.index(ans)
    except ValueError:
        norm = ans.strip().lower()
        for i, o in enumerate(opts):
            if o.strip().lower() == norm:
                return i
        return -1


def _normalize_payload(obj: Dict[str, Any]) -> Dict[str, Any]:
    """
    Guardrails to keep shape consistent with QuizPayload schema.
    """
    ke = obj.get("key_entities") or {}
    if not isinstance(ke, dict) or not {"people", "organizations", "locations"} <= set(ke.keys()):
        # older LLM runs may return a flat dict {name: desc}; flatten its keys into people[]
        if isinstance(ke, dict):
            names = list(ke.keys())
        else:
            names = []
        obj["key_entities"] = {"people": names, "organizations": [], "locations": []}

    # force difficulty lower-case and trim strings
    for q in obj.get("quiz", []):
        if isinstance(q.get("difficulty"), str):
            q["difficulty"] = q["difficulty"].strip().lower()

    return obj



@router.get("/health")
async def health() -> Dict[str, str]:
    return {"ok": "pong"}


@router.post("/generate_quiz", response_model=QuizResponse, status_code=201)
async def generate_quiz(req: GenerateQuizRequest) -> QuizResponse:
    """
    Generate a quiz from a Wikipedia article URL, store in memory, and return payload.
    """
    try:
        title, sections, text = await fetch_wikipedia(str(req.url))
    except Exception as e:
        log.exception("scrape failed")
        raise HTTPException(status_code=502, detail=f"Failed to fetch article: {e}")

    try:
        raw = generate_quiz_payload(title, sections, text, min_questions=7, max_questions=10)
        payload = _normalize_payload(raw)
        QuizPayload.model_validate(payload)
    except Exception as e:
        log.exception("LLM generation failed")
        raise HTTPException(status_code=502, detail="Quiz generation failed")

    record = {
        "url": str(req.url),
        "title": title,
        "date_generated": _now_str(),
        "payload": payload,
    }
    quiz_id = QUIZ_STORE.create(record, ttl_seconds=60 * 60 * 6)

    return QuizResponse(
        id=quiz_id,
        url=str(req.url),
        title=title,
        date_generated=record["date_generated"],
        full_quiz_data=QuizPayload.model_validate(payload),
    )


@router.get("/quiz/{quiz_id}", response_model=QuizResponse)
async def get_quiz(quiz_id: int) -> QuizResponse:
    data = QUIZ_STORE.get(quiz_id)
    if not data:
        raise HTTPException(status_code=404, detail="Quiz not found or expired")
    return QuizResponse(
        id=quiz_id,
        url=data["url"],
        title=data["title"],
        date_generated=data["date_generated"],
        full_quiz_data=QuizPayload.model_validate(data["payload"]),
    )


@router.get("/history")
async def history(page: int = 1, page_size: int = 10) -> Dict[str, Any]:
    ids = QUIZ_STORE.list_ids()
    start = (page - 1) * page_size
    end = start + page_size
    items = []
    for i in ids[start:end]:
        d = QUIZ_STORE.get(i)
        if not d:
            continue
        items.append(QuizMeta(id=i, url=d["url"], title=d["title"], date_generated=d["date_generated"]).model_dump())
    return {"items": items, "total": len(ids)}


@router.post("/grade", response_model=GradeResponse)
async def grade_quiz(req: GradeRequest) -> GradeResponse:
    """
    Grade a quiz by ID. Body: { "id": number, "answers": [int,int,...] }
    Each answer is an option index (0..3).
    """
    quiz = QUIZ_STORE.get(req.id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found or expired")

    questions: List[Dict[str, Any]] = quiz["payload"]["quiz"]
    if len(req.answers) != len(questions):
        raise HTTPException(status_code=400, detail="answer count mismatch")

    results: List[PerQuestionResult] = []
    correct_total = 0

    for idx, (user_idx, q) in enumerate(zip(req.answers, questions)):
        correct_idx = _derive_correct_index(q)
        is_correct = (user_idx == correct_idx) and correct_idx != -1
        if is_correct:
            correct_total += 1
        results.append(
            PerQuestionResult(
                index=idx,
                chosen=user_idx,
                correct=correct_idx,
                is_correct=is_correct,
                explanation=q.get("explanation", ""),
                evidence_span=q.get("evidence_span", ""),
            )
        )

    total = len(questions)
    score = round((correct_total / total) * 100.0, 2) if total else 0.0

    return GradeResponse(
        id=req.id,
        total=total,
        correct=correct_total,
        score=score,
        results=results,
    )
