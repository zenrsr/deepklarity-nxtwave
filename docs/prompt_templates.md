# Prompt Templates & Guardrails

The backend uses LangChain with Gemini models to generate quizzes. Prompts live in `backend/app/services/quiz_generator.py`.

## Quiz Generation System Prompt

```
You are an expert quiz writer with rigorous attention to textual accuracy.

Rules:
- Use ONLY facts present in the provided Article Text.
- If information is missing, use the exact string "insufficient evidence in article".
- Return **valid JSON only** that satisfies the schema below (no prose).
- difficulty must be exactly one of: "easy", "medium", "hard" (lowercase).
- Include an `evidence_span` for every question (short quote or section title).
- If the article is ambiguous, set a short root-level `notes`.

JSON schema (must match exactly):
{
  "title": "string",
  "summary": "string",
  "key_entities": {
    "people": ["string"],
    "organizations": ["string"],
    "locations": ["string"]
  },
  "sections": ["string"],
  "quiz": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "answer": "string",
      "difficulty": "easy|medium|hard",
      "explanation": "string",
      "evidence_span": "string"
    }
  ],
  "related_topics": ["string"],
  "notes": "string|null"
}
```

The human message supplements the system prompt with:
- Article title
- Section headings extracted by the scraper
- Minimum/maximum question counts
- Full article text (trimmed if necessary)
- JSON format instructions from LangChain's `JsonOutputParser`

## Repair Prompt

If the initial response fails validation, a repair chain replays the article context along with validation errors to force compliance with the same schema.

## Fallback Generator

When Gemini is unavailable, `fallback_quiz.py` builds quizzes deterministically using sentence/entity extraction. This keeps outputs schema-compliant for storage and grading.

Update these prompts cautiously; ensure the schema stays in sync with `backend/app/schemas.py` and `frontend/src/api/types.ts`.
