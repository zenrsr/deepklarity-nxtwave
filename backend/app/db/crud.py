from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models import Quiz
from app.utils.hash import sha256_hex
from typing import Optional

async def get_quiz_by_id(db: AsyncSession, quiz_id: int) -> Optional[Quiz]:
    res = await db.execute(select(Quiz).where(Quiz.id == quiz_id))
    return res.scalar_one_or_none()

async def get_quiz_by_urlhash_and_contenthash(db: AsyncSession, url_hash: str, content_hash: str) -> Optional[Quiz]:
    res = await db.execute(select(Quiz).where(Quiz.url_hash == url_hash, Quiz.content_hash == content_hash))
    return res.scalar_one_or_none()

async def list_quizzes(db: AsyncSession, skip: int = 0, limit: int = 50):
    res = await db.execute(select(Quiz).order_by(Quiz.id.desc()).offset(skip).limit(limit))
    items = res.scalars().all()
    total = (await db.execute(select(Quiz))).scalars().all()
    return items, len(total)

async def create_quiz(db: AsyncSession, *, url: str, title: str, scraped_content: str | None, content_hash: str, etag: str | None, last_modified: str | None, full_quiz_data: dict) -> Quiz:
    q = Quiz(
        url=url,
        url_hash=sha256_hex(url),
        title=title,
        scraped_content=scraped_content,
        content_hash=content_hash,
        etag=etag,
        last_modified=last_modified,
        full_quiz_data=full_quiz_data,
    )
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return q
