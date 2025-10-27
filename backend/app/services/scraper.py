from __future__ import annotations

import re
from typing import List, Optional, Tuple

import requests
from bs4 import BeautifulSoup

from app.core.config import settings

WIKI_ALLOWED = re.compile(r"^https://([a-z]+)\.wikipedia\.org/wiki/.+", re.IGNORECASE)

CLEAN_SELECTORS = [
    "sup.reference",
    ".mw-editsection",
    ".infobox",
    ".navbox",
    ".vertical-navbox",
    ".hatnote",
    ".toc",
    ".thumb",
    ".reflist",
    "table",
    ".metadata",
]

REQUEST_HEADERS = {
    "User-Agent": "AIQuizBot/1.0 (+https://deepklarity.example; contact: admin@example.com)",
    "Accept-Language": "en-US,en;q=0.9",
}

REQUEST_TIMEOUT = settings.REQUEST_TIMEOUT_SECONDS


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def extract_text(html: str) -> Tuple[str, str, List[str]]:
    soup = BeautifulSoup(html, "html.parser")
    title_tag = soup.select_one("h1.firstHeading")
    title = title_tag.get_text(strip=True) if title_tag else "Untitled"

    content_root = soup.select_one("#mw-content-text .mw-parser-output")
    if not content_root:
        return title, "", []

    for selector in CLEAN_SELECTORS:
        for node in content_root.select(selector):
            node.decompose()

    sections: List[str] = []
    paragraphs: List[str] = []

    for element in content_root.find_all(["h2", "h3", "p"], recursive=False):
        tag_name = element.name
        if tag_name in {"h2", "h3"}:
            raw = element.get_text(strip=True).replace("[edit]", "").strip()
            if raw:
                sections.append(raw)
        elif tag_name == "p":
            text = element.get_text(" ", strip=True)
            if text and not text.startswith("Coordinates:"):
                paragraphs.append(text)

    if not paragraphs:
        # fall back to scanning deeper for paragraphs if direct children are empty
        for element in content_root.find_all("p"):
            text = element.get_text(" ", strip=True)
            if text and not text.startswith("Coordinates:"):
                paragraphs.append(text)

    joined = normalize_whitespace(" ".join(paragraphs))
    return title, joined, sections


def _requests_fetch(url: str, *, etag: Optional[str] = None, last_modified: Optional[str] = None) -> Tuple[str, str, List[str]]:
    headers = {**REQUEST_HEADERS}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified

    with requests.Session() as session:
        session.headers.update(headers)
        resp = session.get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
    if resp.status_code == 304:
        raise RuntimeError("Content not modified; cached copy required for processing.")
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to fetch: {resp.status_code}")
    html = resp.text
    title, text, sections = extract_text(html)
    return title, text, sections


async def fetch_wikipedia(
    url: str,
    *,
    etag: Optional[str] = None,
    last_modified: Optional[str] = None,
) -> Tuple[str, List[str], str]:
    if not WIKI_ALLOWED.match(url):
        raise ValueError("URL must be a valid Wikipedia article URL")

    # Prefer requests + BeautifulSoup to satisfy assignment requirements.
    title, text, sections = _requests_fetch(url, etag=etag, last_modified=last_modified)
    return title, sections, text
