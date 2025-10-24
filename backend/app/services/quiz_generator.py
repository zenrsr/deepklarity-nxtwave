from typing import Any, Dict, List
from pydantic import BaseModel, Field, ValidationError, field_validator
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.runnables import RunnableSequence
from langchain_google_genai import ChatGoogleGenerativeAI
from tenacity import retry, stop_after_attempt, wait_exponential_jitter
from app.core.config import settings

class RateLimitError(Exception):
    def __init__(self, retry_after: int | None = None, message: str = "Rate limited"):
        self.retry_after = retry_after
        super().__init__(message)


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
{{
  "title": "string",
  "summary": "string",
  "key_entities": {{
    "people": ["string"],
    "organizations": ["string"],
    "locations": ["string"]
  }},
  "sections": ["string"],
  "quiz": [
    {{
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "answer": "string",
      "difficulty": "easy|medium|hard",
      "explanation": "string",
      "evidence_span": "string"
    }}
  ],
  "related_topics": ["string"],
  "notes": "string|null"
}}
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
            tried.append(m)
            last_err = e
    raise RuntimeError(f"Unable to initialize any Gemini model. Tried: {tried}. Last error: {last_err}")

def _trim_article(text: str, hard_char_limit: int = 80_000) -> str:
    """
    Hard cut the article text to a safe character budget to lower input tokens.
    Try to cut at a section boundary if possible.
    """
    if len(text) <= hard_char_limit:
        return text
    cut = text[:hard_char_limit]
    nl = cut.rfind("\n")
    if nl > hard_char_limit * 0.8:
        cut = cut[:nl]
    return cut

def _normalize_result(obj: Dict[str, Any]) -> Dict[str, Any]:
    """
    Guardrail:
    - If key_entities is a flat dict {name:desc}, convert to required arrays.
    - Coerce difficulty to lowercase.
    - Ensure required arrays exist.
    """
    ke = obj.get("key_entities")
    if isinstance(ke, dict) and not {"people", "organizations", "locations"}.issubset(ke.keys()):
        names = list(ke.keys())
        obj["key_entities"] = {"people": names, "organizations": [], "locations": []}
    elif ke is None:
        obj["key_entities"] = {"people": [], "organizations": [], "locations": []}

    if isinstance(obj.get("quiz"), list):
        for q in obj["quiz"]:
            if isinstance(q.get("difficulty"), str):
                q["difficulty"] = q["difficulty"].strip().lower()

    obj.setdefault("sections", [])
    obj.setdefault("related_topics", [])
    return obj


@retry(stop=stop_after_attempt(2), wait=wait_exponential_jitter(initial=1, max=4))
def build_chain() -> RunnableSequence:
    model = _get_model()
    parser = JsonOutputParser(pydantic_object=QuizOutputModel)

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", (
            "Title: {article_title}\n"
            "Sections: {article_sections}\n"
            "MinQuestions: {min_questions}\n"
            "MaxQuestions: {max_questions}\n"
            "Article Text:\n{article_text}\n"
            "Schema Instructions: {format_instructions}\n"
            "Respond with JSON only."
        ))
    ]).partial(format_instructions=parser.get_format_instructions()) 

    return prompt | model | parser


def _repair_with_error(
    model: ChatGoogleGenerativeAI,
    article_title: str,
    article_sections: list[str],
    article_text: str,
    error_text: str,
    min_questions: int,
    max_questions: int
) -> Dict[str, Any]:
    repair_parser = JsonOutputParser(pydantic_object=QuizOutputModel)

    repair_prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT + "\nIMPORTANT: Your previous JSON did not match the schema. You must correct it."),
        ("human", (
            "VALIDATION_ERROR:\n{error}\n\n"
            "Re-output a SINGLE JSON object that exactly matches the schema.\n"
            "Title: {article_title}\n"
            "Sections: {article_sections}\n"
            "MinQuestions: {min_questions}\n"
            "MaxQuestions: {max_questions}\n"
            "Article Text:\n{article_text}\n"
            "Schema Instructions: {format_instructions}\n"
            "Respond with JSON only."
        ))
    ]).partial(format_instructions=repair_parser.get_format_instructions())

    chain = repair_prompt | model | repair_parser
    repaired = chain.invoke({
        "error": error_text,
        "article_title": article_title,
        "article_sections": article_sections,
        "article_text": article_text,
        "min_questions": min_questions,
        "max_questions": max_questions
    })

    if isinstance(repaired, BaseModel):
        return repaired.model_dump()
    if isinstance(repaired, dict):
        return repaired
    raise TypeError(f"Unexpected repair output type: {type(repaired)}")



def generate_quiz_payload(
    article_title: str,
    article_sections: list[str],
    article_text: str,
    min_questions: int = 5,
    max_questions: int = 10
) -> Dict[str, Any]:
    chain = build_chain()
    try:
        result = chain.invoke({
            "article_title": article_title,
            "article_sections": article_sections,
            "article_text": article_text,
            "min_questions": min_questions,
            "max_questions": max_questions
        })

        obj: Dict[str, Any] = result

    except ResourceExhausted as e:
        retry_after = None 
        m = re.search(r"retry_delay\s*{\s*seconds:\s*(\d+)", str(e))
        if m:
            retry_after = int(m.group(1))
        raise RateLimitError(retry_after=retry_after, message=str(e))

        # if isinstance(result, BaseModel):
        #     obj = result.model_dump()
        # elif isinstance(result, dict):
        #     obj = result
        # else:
        #     raise TypeError(f"Unexpected LLM parse output type: {type(result)}")

    # except ValidationError as ve:
    #     model = _get_model()
    #     obj = _repair_with_error(
    #         model, article_title, article_sections, article_text,
    #         str(ve), min_questions, max_questions
    #     )
    except ValidationError as ve:
        raise ve
    except Exception as e:
        raise e

    obj = _normalize_result(obj)
    QuizOutputModel.model_validate(obj)
    return obj
