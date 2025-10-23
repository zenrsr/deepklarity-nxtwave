from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger
from typing import List
from app.db.session import get_session, engine
from app.db.models import Base
from app.db import crud
from app.schemas import GenerateQuizRequest, QuizResponse, HistoryResponse, QuizMeta, QuizPayload
from app.services.scraper import fetch_wikipedia, extract_text
from app.services.quiz_generator import generate_quiz_payload
from app.utils.hash import sha256_hex
from app.core.config import settings
from langchain_google_genai import ChatGoogleGenerativeAI
from app.schemas import QuizPayload





router = APIRouter()

@router.get("/healthz")
async def healthz():
    # quick DB check
    try:
        async with engine.begin() as conn:
            await conn.run_sync(lambda c: None)
        return {"status": "ok"}
    except Exception as e:
        logger.exception("Health check failed")
        return {"status": "degraded", "error": str(e)}

@router.post("/generate_quiz", response_model=QuizResponse, status_code=201)
async def generate_quiz(payload: GenerateQuizRequest, db: AsyncSession = Depends(get_session)):
    url = str(payload.url)
    # Fetch (no etag on first hit; caching handled post-clean)
    html, etag, last_modified = await fetch_wikipedia(url)

    if html == "":
        # Not-modified scenario shouldn't happen on first hit; treat as error
        raise HTTPException(status_code=304, detail="Not modified")

    # Extract title, text, sections
    title, text, sections = extract_text(html)
    if not text or len(text) < 200:
        raise HTTPException(status_code=502, detail="Article text too short or failed to extract")

    # Build content hash for caching
    content_hash = sha256_hex(text)
    url_hash = sha256_hex(url)

    # Cache check
    if not payload.force:
        existing = await crud.get_quiz_by_urlhash_and_contenthash(db, url_hash, content_hash)
        if existing:
            return QuizResponse(
                id=existing.id,
                url=existing.url,
                title=existing.title,
                date_generated=str(existing.date_generated),
                full_quiz_data=existing.full_quiz_data
            )

    # Generate quiz via LLM
    try:
        quiz_data = generate_quiz_payload(title, sections, text, min_questions=5, max_questions=10)
    except Exception as e:
        logger.exception("LLM generation failed")
        raise HTTPException(status_code=502, detail="Quiz generation failed")

    # Persist
    record = await crud.create_quiz(
        db,
        url=url,
        title=title,
        scraped_content=text,
        content_hash=content_hash,
        etag=etag,
        last_modified=last_modified,
        full_quiz_data=quiz_data,
    )

    return QuizResponse(
        id=record.id,
        url=record.url,
        title=record.title,
        date_generated=str(record.date_generated),
        full_quiz_data=record.full_quiz_data
    )

@router.get("/history", response_model=HistoryResponse)
async def history(page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100), db: AsyncSession = Depends(get_session)):
    skip = (page - 1) * page_size
    items, total_count = await crud.list_quizzes(db, skip=skip, limit=page_size)
    metas: List[QuizMeta] = [
        QuizMeta(id=i.id, url=i.url, title=i.title, date_generated=str(i.date_generated))
        for i in items
    ]
    return HistoryResponse(items=metas, total=total_count)

@router.get("/quiz/{quiz_id}", response_model=QuizResponse)
async def get_quiz(quiz_id: int, db: AsyncSession = Depends(get_session)):
    item = await crud.get_quiz_by_id(db, quiz_id)
    if not item:
        raise HTTPException(404, "Quiz not found")
    return QuizResponse(
        id=item.id,
        url=item.url,
        title=item.title,
        date_generated=str(item.date_generated),
        full_quiz_data=item.full_quiz_data
    )

@router.get("/check_gemini_key")
async def check_gemini_key() -> dict:
    if not settings.GEMINI_API_KEY:
        return {"ok": False, "error": "GEMINI_API_KEY missing in environment"}

    candidates = [settings.GEMINI_MODEL] if settings.GEMINI_MODEL else []
    candidates += [m for m in [
        "gemini-1.5-flash-8b",
        "gemini-1.5-flash-001",
        "gemini-1.5-flash-002",
        "gemini-1.5-flash",
        "gemini-1.0-pro",
        "gemini-pro",
    ] if m not in candidates]

    errors = {}
    for m in candidates:
        try:
            model = ChatGoogleGenerativeAI(model=m, google_api_key=settings.GEMINI_API_KEY, temperature=0.0)
            out = model.invoke("reply with 'pong' only")
            text = getattr(out, "content", None) or getattr(out, "text", None) or str(out)
            return {"ok": True, "model": m, "sample": text}
        except Exception as e:
            errors[m] = str(e)

    return {"ok": False, "tried": candidates, "errors": errors}

# --- DEBUG: scrape only ---
@router.get("/debug/scrape")
async def debug_scrape(url: str):
    html, etag, last_modified = await fetch_wikipedia(url)
    from app.services.scraper import extract_text
    title, text, sections = extract_text(html)
    return {
        "title": title,
        "text_chars": len(text),
        "sections": sections[:10],
        "etag": etag,
        "last_modified": last_modified
    }

# --- DEBUG: LLM only (uses the .env model) ---
@router.post("/debug/llm")
async def debug_llm(body: dict):
    from app.services.quiz_generator import generate_quiz_payload
    data = generate_quiz_payload(
        article_title=body["article_title"],
        article_sections=body.get("article_sections", []),
        article_text=body["article_text"],
        min_questions=5,
        max_questions=5
    )
    return data
