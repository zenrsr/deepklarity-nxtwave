# app/services/quiz_generator.py
from typing import Any, Dict, List
from pydantic import BaseModel, Field, field_validator, ValidationError
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.runnables import RunnableSequence
from tenacity import retry, stop_after_attempt, wait_exponential_jitter
from app.core.config import settings

# ---------- Strict Pydantic models the LLM must satisfy ----------

class QuizItemModel(BaseModel):
    question: str
    options: List[str] = Field(min_length=4, max_length=4)
    answer: str
    difficulty: str
    explanation: str
    evidence_span: str

    @field_validator("difficulty", mode="before")
    @classmethod
    def coerce_difficulty_lower(cls, v: Any) -> str:
        s = str(v).strip().lower()
        if s not in {"easy", "medium", "hard"}:
            raise ValueError("difficulty must be one of: easy, medium, hard")
        return s

class KeyEntitiesModel(BaseModel):
    people: List[str] = []
    organizations: List[str] = []
    locations: List[str] = []

class QuizOutputModel(BaseModel):
    title: str
    summary: str
    key_entities: KeyEntitiesModel
    sections: List[str]
    quiz: List[QuizItemModel]
    related_topics: List[str]
    notes: str | None = None

# ---------- System prompt (explicit, JSON-only, strict shape) ----------
SYSTEM_PROMPT = """
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
"""

MODEL_CANDIDATES = [
    "models/gemini-2.5-flash",
    "models/gemini-2.5-pro",
    "models/gemini-flash-latest",
    "models/gemini-pro-latest",
]

def _get_model() -> ChatGoogleGenerativeAI:
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set")
    preferred = [settings.GEMINI_MODEL] if settings.GEMINI_MODEL else []
    tried, last_err = [], None
    for m in preferred + [c for c in MODEL_CANDIDATES if c not in preferred]:
        try:
            return ChatGoogleGenerativeAI(
                model=m,
                google_api_key=settings.GEMINI_API_KEY,
                temperature=0.3,
            )
        except Exception as e:
            tried.append(m); last_err = e
    raise RuntimeError(f"Unable to initialize any Gemini model. Tried: {tried}. Last error: {last_err}")

# def _normalize_result(obj: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     Belt-and-suspenders guard:
#     - Ensure key_entities has people|organizations|locations lists.
#     - Lowercase difficulty values if any slipped through.
#     """
#     ke = obj.get("key_entities")
#     if isinstance(ke, dict) and not {"people","organizations","locations"}.issubset(set(ke.keys())):
#         # If model returned a {name: description} dict, flatten names with empty categorization.
#         # We can't reliably classify, so put all names into 'people' (least harmful), but keep arrays.
#         # (Better: add a second LLM pass to categorize, but for now we prefer schema-compat.)
#         names = list(ke.keys())
#         obj["key_entities"] = {
#             "people": names,
#             "organizations": [],
#             "locations": []
#         }
#     elif ke is None:
#         obj["key_entities"] = {"people": [], "organizations": [], "locations": []}

#     if isinstance(obj.get("quiz"), list):
#         for q in obj["quiz"]:
#             if "difficulty" in q and isinstance(q["difficulty"], str):
#                 q["difficulty"] = q["difficulty"].strip().lower()

#     return obj

@retry(stop=stop_after_attempt(2), wait=wait_exponential_jitter(initial=1, max=4))
def build_chain() -> RunnableSequence:
    model = _get_model()
    # Strongest schema enforcement available in LangChain for Gemini:
    structured_model = model.with_structured_output(QuizOutputModel)

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", (
            "Title: {article_title}\n"
            "Sections: {article_sections}\n"
            "MinQuestions: {min_questions}\n"
            "MaxQuestions: {max_questions}\n"
            "Article Text:\n{article_text}\n"
            "Respond with JSON only."
        ))
    ])

    # The structured model itself validates into QuizOutputModel
    return prompt | structured_model

def _repair_with_error(model: ChatGoogleGenerativeAI, article_title: str, article_sections: list[str], article_text: str, error_text: str, min_questions: int, max_questions: int) -> Dict[str, Any]:
    """If first pass fails validation, ask the model to repair using the exact error."""
    repair_prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT + "\nIMPORTANT: Your previous JSON did not match the schema. You must correct it."),
        ("human",
         "VALIDATION_ERROR:\n{error}\n\n"
         "Re-output a SINGLE JSON object that exactly matches the schema.\n"
         "Title: {article_title}\n"
         "Sections: {article_sections}\n"
         "MinQuestions: {min_questions}\n"
         "MaxQuestions: {max_questions}\n"
         "Article Text:\n{article_text}\n")
    ])

    structured = model.with_structured_output(QuizOutputModel)
    chain = repair_prompt | structured
    repaired = chain.invoke({
        "error": error_text,
        "article_title": article_title,
        "article_sections": article_sections,
        "article_text": article_text,
        "min_questions": min_questions,
        "max_questions": max_questions
    })
    return repaired.model_dump()

def generate_quiz_payload(article_title: str, article_sections: list[str], article_text: str, min_questions: int = 5, max_questions: int = 10) -> Dict[str, Any]:
    chain = build_chain()
    try:
        result_model: QuizOutputModel = chain.invoke({
            "article_title": article_title,
            "article_sections": article_sections,
            "article_text": article_text,
            "min_questions": min_questions,
            "max_questions": max_questions
        })
        obj = result_model.model_dump()
    except ValidationError as ve:
        # Try a self-repair cycle with explicit error feedback
        # Reuse the same underlying model for repair
        model = _get_model()
        obj = _repair_with_error(model, article_title, article_sections, article_text, str(ve), min_questions, max_questions)

    # Final normalization guard before returning to API layer
    obj = _normalize_result(obj)
    # Final safety check: validate again into our schema
    QuizOutputModel.model_validate(obj)
    return obj

# app/services/quiz_generator.py

# ... imports stay as you have them ...

def _normalize_result(obj: Dict[str, Any]) -> Dict[str, Any]:
    """
    Guardrail:
    - If key_entities is a flat dict {name:desc}, convert to required arrays.
    - Force difficulty to lowercase.
    """
    ke = obj.get("key_entities")
    # If it's a flat dict without required keys, flatten its keys into people[]
    if isinstance(ke, dict) and not {"people","organizations","locations"}.issubset(ke.keys()):
        names = list(ke.keys())
        obj["key_entities"] = {
            "people": names,
            "organizations": [],
            "locations": []
        }
    elif ke is None:
        obj["key_entities"] = {"people": [], "organizations": [], "locations": []}

    if isinstance(obj.get("quiz"), list):
        for q in obj["quiz"]:
            if isinstance(q.get("difficulty"), str):
                q["difficulty"] = q["difficulty"].strip().lower()

    return obj
