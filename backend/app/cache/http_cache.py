import random
from typing import Optional, Tuple, Dict, Any
from cachetools import LRUCache
from app.cache import storage

_memory = LRUCache(maxsize=128)
_hits = 0
_misses = 0

def get(url: str) -> Optional[Dict[str, Any]]:
    global _hits, _misses
    if url in _memory:
        _hits += 1
        return _memory[url]
    disk = storage.read("http", url)
    if disk:
        _memory[url] = disk
        _hits += 1
        return disk
    _misses += 1
    return None

def set(url: str, doc: Dict[str, Any]) -> None:
    _memory[url] = doc
    storage.write("http", url, doc)

def conditional_headers(url: str) -> Dict[str, str]:
    h: Dict[str, str] = {
        "Accept-Encoding": "gzip, br",
        "User-Agent": random.choice([
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/129 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129 Safari/537.36",
        ])
    }
    cached = get(url)
    if cached and cached.get("etag"):
        h["If-None-Match"] = cached["etag"]
    if cached and cached.get("last_modified"):
        h["If-Modified-Since"] = cached["last_modified"]
    return h

def status() -> Dict[str, Any]:
    disk_entries, disk_bytes = storage.stats("http")
    return {
        "hits": _hits,
        "misses": _misses,
        "memory": {"size": len(_memory), "keys": list(_memory.keys())[:10]},
        "disk": {"entries": disk_entries, "bytes": disk_bytes},
    }

def clear_all() -> None:
    _memory.clear()
    storage.delete_all("http")
