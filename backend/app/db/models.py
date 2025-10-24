from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, Text, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON as JSONType

class Base(DeclarativeBase):
    pass

class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    url_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    date_generated: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    scraped_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    etag: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_modified: Mapped[str | None] = mapped_column(String(128), nullable=True)
    full_quiz_data: Mapped[dict] = mapped_column(JSONB().with_variant(JSONType(), "sqlite"), nullable=False)


