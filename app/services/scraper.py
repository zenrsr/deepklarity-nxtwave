import asyncio
from typing import Tuple, Optional
import re
from selectolax.parser import HTMLParser
from app.utils.http import get_client
from app.core.config import settings
from loguru import logger

WIKI_ALLOWED = re.compile(r"^https://([a-z]+)\.wikipedia\.org/wiki/.+", re.IGNORECASE)

CLEAN_SELECTORS = [
    "sup.reference", ".mw-editsection", ".infobox", ".navbox", ".vertical-navbox",
    ".hatnote", ".toc", ".thumb", ".reflist", "table", ".metadata"
]

def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()

def extract_text(html: str) -> Tuple[str, str, list[str]]:
    tree = HTMLParser(html)
    title = tree.css_first("h1.firstHeading").text(strip=True) if tree.css_first("h1.firstHeading") else "Untitled"
    content_root = tree.css_first("#mw-content-text .mw-parser-output")
    if not content_root:
        return title, "", []

    # remove unwanted nodes
    for sel in CLEAN_SELECTORS:
        for node in content_root.css(sel):
            node.decompose()

    sections = []
    parts = []
    for node in content_root.css("h2, h3, p"):
        if node.tag in ("h2", "h3"):
            head_txt = node.text(strip=True).replace("[edit]", "").strip()
            if head_txt:
                sections.append(head_txt)
        elif node.tag == "p":
            txt = node.text(separator=" ", strip=True)
            if txt and not txt.startswith("Coordinates:"):
                parts.append(txt)

    text = normalize_whitespace(" ".join(parts))
    return title, text, sections

async def fetch_wikipedia(url: str, *, etag: Optional[str]=None, last_modified: Optional[str]=None) -> Tuple[str, Optional[str], Optional[str]]:
    if not WIKI_ALLOWED.match(url):
        raise ValueError("URL must be a valid Wikipedia article URL")

    client = await get_client()
    headers = {}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified

    resp = await client.get(url, headers=headers, follow_redirects=True)
    if resp.status_code == 304:
        return "", resp.headers.get("ETag"), resp.headers.get("Last-Modified")
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to fetch: {resp.status_code}")
    return resp.text, resp.headers.get("ETag"), resp.headers.get("Last-Modified")
