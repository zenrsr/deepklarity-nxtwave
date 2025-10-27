from __future__ import annotations

import random
import re
from itertools import islice
from typing import Dict, List, Sequence

TITLE_STOPWORDS = {
    "The",
    "A",
    "An",
    "In",
    "On",
    "And",
    "But",
    "For",
    "With",
    "As",
    "By",
    "Of",
    "To",
}

ENTITY_PATTERN = re.compile(r"\b([A-Z][\w]*(?:\s+[A-Z][\w]*)*)\b")

GENERIC_DISTRACTORS = [
    "A different historical event",
    "An unrelated scientific topic",
    "A fictional character",
    "A random geographic location",
    "A general cultural reference",
    "None of the above",
]


def _split_sentences(text: str) -> List[str]:
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", text)
    return [p.strip() for p in parts if len(p.strip()) > 40]


def _extract_entities(sentence: str) -> List[str]:
    matches = ENTITY_PATTERN.findall(sentence)
    cleaned: List[str] = []
    for m in matches:
        item = m.strip()
        head = item.split()[0]
        if head in TITLE_STOPWORDS:
            continue
        if item.upper() == item:
            continue
        if len(item) < 3:
            continue
        cleaned.append(item)
    return cleaned


def _collect_entities(sentences: List[str], limit: int = 40) -> List[str]:
    seen = set()
    items: List[str] = []
    for sent in sentences:
        for ent in _extract_entities(sent):
            norm = ent.lower()
            if norm in seen:
                continue
            seen.add(norm)
            items.append(ent)
            if len(items) >= limit:
                return items
    return items


def _build_question(
    sentence: str,
    answer: str,
    distractors: List[str],
    rng: random.Random,
) -> Dict[str, str | List[str]]:
    blanked = sentence.replace(answer, "____", 1)
    prompt = (
        f"In the context of this article, which option best completes the statement:\n"
        f"\"{blanked.strip()}\""
    )

    options = [answer] + distractors[:3]
    while len(options) < 4:
        options.append("None of the above")

    rng.shuffle(options)

    explanation = (
        f"The original sentence states \"{sentence.strip()}\" which identifies {answer}."
    )

    return {
        "question": prompt,
        "options": options,
        "answer": answer,
        "difficulty": "medium",
        "explanation": explanation,
        "evidence_span": sentence.strip(),
    }


def _generic_question(title: str, rng: random.Random) -> Dict[str, object]:
    answer = title
    pool = [opt for opt in GENERIC_DISTRACTORS if opt != answer]
    rng.shuffle(pool)
    options = [answer] + pool[:3]
    rng.shuffle(options)
    sentence = f"The article focuses on {title}."
    return {
        "question": f"What subject does the article \"{title}\" primarily discuss?",
        "options": options,
        "answer": answer,
        "difficulty": "easy",
        "explanation": f"The article overview centers on {title}.",
        "evidence_span": sentence,
    }


def _normalize_sections(sections: Sequence[str] | None) -> List[str]:
    if not sections:
        return []
    normalized = [s.strip() for s in sections if isinstance(s, str) and s.strip()]
    return normalized[:20]


def generate_rule_based_quiz(
    title: str,
    sections: Sequence[str] | None,
    article_text: str | None,
    min_questions: int = 5,
    max_questions: int = 10,
) -> Dict[str, object]:
    clean_title = title.strip() if title else "Untitled Article"
    clean_sections = _normalize_sections(sections)
    base_text = (article_text or "").strip()

    sentences = _split_sentences(base_text)
    if not sentences:
        if base_text:
            sentences = [base_text]
        else:
            sentences = [f"{clean_title} is the focus of this article."]

    entities = _collect_entities(sentences, limit=80)
    rng = random.Random(42)

    summary_sentences = list(islice(sentences, 0, 3))
    summary = " ".join(summary_sentences) if summary_sentences else f"Overview of {clean_title}"

    key_entities = entities[:5]
    groups: Dict[str, List[str]] = {"people": [], "organizations": [], "locations": []}
    for ent in key_entities:
        lower = ent.lower()
        if "university" in lower or "company" in lower or "association" in lower:
            groups["organizations"].append(ent)
        elif "city" in lower or "state" in lower or "country" in lower or "river" in lower:
            groups["locations"].append(ent)
        else:
            groups["people"].append(ent)

    quiz_items: List[Dict[str, object]] = []
    unused_entities = [e for e in entities if e not in key_entities]

    for sentence in sentences:
        if len(quiz_items) >= max_questions:
            break
        candidates = _extract_entities(sentence)
        if not candidates:
            continue
        answer = candidates[0]
        distractors = [ent for ent in entities if ent != answer]
        rng.shuffle(distractors)
        quiz_item = _build_question(sentence, answer, distractors, rng)
        quiz_items.append(quiz_item)

    if len(quiz_items) < min_questions and unused_entities:
        remaining = min(min_questions - len(quiz_items), len(unused_entities))
        for ent in unused_entities[:remaining]:
            sentence = summary_sentences[0] if summary_sentences else clean_title
            distractors = [e for e in entities if e != ent]
            rng.shuffle(distractors)
            quiz_items.append(_build_question(sentence, ent, distractors, rng))

    while len(quiz_items) < min_questions:
        quiz_items.append(_generic_question(clean_title, rng))

    quiz_items = quiz_items[:max_questions]

    if not quiz_items:
        quiz_items.append(_generic_question(clean_title, rng))

    related_topics = clean_sections[:6]

    payload: Dict[str, object] = {
        "title": clean_title,
        "summary": summary if summary else f"Overview of {clean_title}",
        "key_entities": groups,
        "sections": clean_sections[:10],
        "quiz": quiz_items,
        "related_topics": related_topics,
        "notes": "Generated using rule-based fallback due to primary model being unavailable.",
    }
    return payload
