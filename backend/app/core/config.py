from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List, Union
from pathlib import Path
from dotenv import load_dotenv

# The root of the backend directory
BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent

# Load the .env file
load_dotenv(dotenv_path=BACKEND_ROOT / ".env")

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "ai-quiz-backend"
    APP_ENV: str = "development"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    LOG_LEVEL: str = "INFO"

    ALLOWED_ORIGINS: Union[str, List[str]] = ["http://localhost:5173", "http://localhost:3000"]

    DATABASE_URL: str
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
