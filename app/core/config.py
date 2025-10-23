# app/core/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List, Union

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_ignore_empty=True, extra="ignore")

    APP_NAME: str = "ai-quiz-backend"
    APP_ENV: str = "development"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    LOG_LEVEL: str = "INFO"

    ALLOWED_ORIGINS: Union[str, List[str]] = ["http://localhost:5173", "http://localhost:3000"]

    DATABASE_URL: str = "sqlite+aiosqlite:///./dev.db"
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-1.5-flash-8b" 

    SCRAPER_MAX_CONCURRENCY: int = 2
    REQUEST_TIMEOUT_SECONDS: int = 15

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_origins(cls, v):
        if v is None:
            return ["http://localhost:5173", "http://localhost:3000"]
        if isinstance(v, str):
            vs = v.strip()
            if not vs:
                return ["http://localhost:5173", "http://localhost:3000"]
            if vs.startswith("["):
                return vs
            return [s.strip() for s in vs.split(",") if s.strip()]
        return v

settings = Settings()
