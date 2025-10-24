from __future__ import annotations

import threading
import time
from typing import Any, Dict, Optional


class _InMemoryStore:
    """
    Tiny production-ish in-memory store with:
      - atomic id generation
      - optional TTL per item
      - thread safety
    NOTE: This is a stand-in until Postgres/Redis is hooked up.
    """

    def __init__(self) -> None:
        self._data: Dict[int, Dict[str, Any]] = {}
        self._expiry: Dict[int, Optional[float]] = {}
        self._lock = threading.RLock()
        self._next_id = 1

    # ---------- core ops ----------
    def create(self, value: Dict[str, Any], ttl_seconds: Optional[int] = None) -> int:
        with self._lock:
            _id = self._next_id
            self._next_id += 1
            self._data[_id] = value
            self._expiry[_id] = (time.time() + ttl_seconds) if ttl_seconds else None
            return _id

    def get(self, _id: int) -> Optional[Dict[str, Any]]:
        with self._lock:
            if _id not in self._data:
                return None
            exp = self._expiry.get(_id)
            if exp is not None and exp < time.time():
                # expired; purge
                self._data.pop(_id, None)
                self._expiry.pop(_id, None)
                return None
            return self._data[_id]

    def put(self, _id: int, value: Dict[str, Any], ttl_seconds: Optional[int] = None) -> bool:
        with self._lock:
            if _id not in self._data:
                return False
            self._data[_id] = value
            self._expiry[_id] = (time.time() + ttl_seconds) if ttl_seconds else self._expiry.get(_id)
            return True

    def delete(self, _id: int) -> bool:
        with self._lock:
            existed = _id in self._data
            self._data.pop(_id, None)
            self._expiry.pop(_id, None)
            return existed

    def list_ids(self) -> list[int]:
        with self._lock:
            # drop any expired before listing
            now = time.time()
            dead = [i for i, exp in self._expiry.items() if exp is not None and exp < now]
            for i in dead:
                self._data.pop(i, None)
                self._expiry.pop(i, None)
            return sorted(self._data.keys(), reverse=True)


# Global store used by the API (kept small via TTL/eviction by frontend behavior)
QUIZ_STORE = _InMemoryStore()
