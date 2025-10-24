import httpx
from app.core.config import settings

_client: httpx.AsyncClient | None = None

async def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            http2=True,
            timeout=settings.REQUEST_TIMEOUT_SECONDS,
            headers={
                "User-Agent": f"AIQuizBot/1.0 (+https://example.com; contact: admin@example.com)"
            }
        )
    return _client

async def close_client():
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
