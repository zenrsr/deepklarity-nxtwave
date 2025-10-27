from pydantic import BaseModel, AnyHttpUrl, Field, field_validator, model_validator
from typing import List, Literal

class QuizItem(BaseModel):
    question: str
    options: List[str] = Field(min_length=4, max_length=4)
    answer: str
    difficulty: Literal["easy", "medium", "hard"]
    explanation: str
    evidence_span: str

    @field_validator("difficulty", mode="before")
    @classmethod
    def coerce_difficulty_lower(cls, v):
        s = str(v).strip().lower()
        if s not in {"easy", "medium", "hard"}:
            raise ValueError("difficulty must be 'easy', 'medium' or 'hard'")
        return s

class KeyEntities(BaseModel):
    people: List[str] = Field(default_factory=list)
    organizations: List[str] = Field(default_factory=list)
    locations: List[str] = Field(default_factory=list)

class QuizPayload(BaseModel):
    title: str
    summary: str
    key_entities: KeyEntities
    sections: List[str]
    quiz: List[QuizItem] = Field(min_length=5, max_length=10)
    related_topics: List[str]
    notes: str | None = None

class QuizMeta(BaseModel):
    id: int
    url: AnyHttpUrl
    title: str
    date_generated: str

class QuizResponse(BaseModel):
    id: int
    url: AnyHttpUrl
    title: str
    date_generated: str
    full_quiz_data: QuizPayload

class GenerateQuizRequest(BaseModel):
    url: AnyHttpUrl
    force: bool = False
    min_questions: int | None = Field(default=None, ge=1, le=20)
    max_questions: int | None = Field(default=None, ge=1, le=20)

    @model_validator(mode="after")
    def check_question_bounds(cls, values: "GenerateQuizRequest"):
        min_q = values.min_questions
        max_q = values.max_questions
        if min_q is not None and max_q is not None and min_q > max_q:
            raise ValueError("min_questions cannot exceed max_questions")
        return values

class HistoryResponse(BaseModel):
    items: List[QuizMeta]
    total: int
