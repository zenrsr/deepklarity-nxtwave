from __future__ import annotations

import datetime as dt
import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import crud
from app.db.session import get_session
from app.db.models import Quiz
from app.services.scraper import fetch_wikipedia 
from app.services.quiz_generator import generate_quiz_payload
from app.utils.hash import sha256_hex
import asyncio
from app.schemas import (
    GenerateQuizRequest,
    HistoryResponse,
    QuizMeta,
    QuizPayload,
    QuizResponse,
)

log = logging.getLogger(__name__)
router = APIRouter()

LLM_CONCURRENCY = int(1)
_llm_sem = asyncio.Semaphore(LLM_CONCURRENCY)



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


def _format_timestamp(value: Any) -> str:
    if isinstance(value, dt.datetime):
        return value.isoformat()
    if isinstance(value, str):
        return value
    return _now_str()


def _quiz_to_response(model: Quiz) -> QuizResponse:
    payload = QuizPayload.model_validate(model.full_quiz_data)
    return QuizResponse(
        id=model.id,
        url=model.url,
        title=model.title,
        date_generated=_format_timestamp(model.date_generated),
        full_quiz_data=payload,
    )


def _quiz_to_meta(model: Quiz) -> QuizMeta:
    return QuizMeta(
        id=model.id,
        url=model.url,
        title=model.title,
        date_generated=_format_timestamp(model.date_generated),
    )



@router.get("/health")
async def health() -> Dict[str, str]:
    return {"ok": "pong"}


@router.post("/generate_quiz", response_model=QuizResponse, status_code=201)
async def generate_quiz(
    req: GenerateQuizRequest,
    db: AsyncSession = Depends(get_session),
) -> QuizResponse:
    """
    Generate a quiz from a Wikipedia article URL, persist it, and return payload.
    """
    url = str(req.url)

    try:
        title, sections, text = await fetch_wikipedia(url)
    except Exception as e:
        log.exception("scrape failed")
        raise HTTPException(status_code=502, detail=f"Failed to fetch article: {e}")

    article_text = text or ""
    content_hash = sha256_hex(article_text)
    url_hash = sha256_hex(url)

    if not req.force:
        existing = await crud.get_quiz_by_urlhash_and_contenthash(db, url_hash, content_hash)
        if existing:
            log.info("Returning cached quiz for URL %s (id=%s)", url, existing.id)
            return _quiz_to_response(existing)

    min_questions = req.min_questions or 7
    max_questions = req.max_questions if req.max_questions is not None else max(min_questions, 10)

    try:
        async with _llm_sem:
            raw = generate_quiz_payload(
                title,
                sections,
                article_text,
                min_questions=min_questions,
                max_questions=max_questions,
            )
        payload = _normalize_payload(raw)
        QuizPayload.model_validate(payload)
    except Exception as e:
        log.exception("LLM generation failed")
        raise HTTPException(status_code=502, detail="Quiz generation failed")

    try:
        record = await crud.create_quiz(
            db,
            url=url,
            title=title,
            scraped_content=article_text,
            content_hash=content_hash,
            etag=None,
            last_modified=None,
            full_quiz_data=payload,
        )
    except Exception as e:
        log.exception("Failed to persist quiz")
        raise HTTPException(status_code=500, detail="Failed to store quiz") from e

    return _quiz_to_response(record)


@router.get("/quiz/{quiz_id}", response_model=QuizResponse)
async def get_quiz(quiz_id: int, db: AsyncSession = Depends(get_session)) -> QuizResponse:
    quiz = await crud.get_quiz_by_id(db, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found or expired")
    return _quiz_to_response(quiz)


@router.get("/history", response_model=HistoryResponse)
async def history(
    page: int = 1,
    page_size: int = 10,
    db: AsyncSession = Depends(get_session),
) -> HistoryResponse:
    page = max(page, 1)
    page_size = max(1, min(page_size, 50))
    skip = (page - 1) * page_size

    quizzes, total = await crud.list_quizzes(db, skip=skip, limit=page_size)
    items = [_quiz_to_meta(q) for q in quizzes]
    return HistoryResponse(items=items, total=int(total or 0))


@router.post("/grade", response_model=GradeResponse)
async def grade_quiz(req: GradeRequest, db: AsyncSession = Depends(get_session)) -> GradeResponse:
    """
    Grade a quiz by ID. Body: { "id": number, "answers": [int,int,...] }
    Each answer is an option index (0..3).
    """
    quiz = await crud.get_quiz_by_id(db, req.id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found or expired")

    payload = QuizPayload.model_validate(quiz.full_quiz_data)
    questions = payload.quiz

    if len(req.answers) != len(questions):
        raise HTTPException(status_code=400, detail="answer count mismatch")

    results: List[PerQuestionResult] = []
    correct_total = 0

    for idx, (user_idx, q_model) in enumerate(zip(req.answers, questions)):
        q = q_model.model_dump()
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
