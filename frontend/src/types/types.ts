export type Difficulty = "easy" | "medium" | "hard";

export interface QuizItem {
  question: string;
  options: string[];
  answer: string;
  difficulty: Difficulty;
  explanation: string;
  evidence_span: string;
}

export interface KeyEntities {
  people: string[];
  organizations: string[];
  locations: string[];
}

export interface QuizPayload {
  title: string;
  summary: string;
  key_entities: KeyEntities;
  sections: string[];
  quiz: QuizItem[];
  related_topics: string[];
  notes: string | null;
}

export interface QuizMeta {
  id: number;
  url: string;
  title: string;
  date_generated: string;
}

export interface QuizResponse extends QuizMeta {
  full_quiz_data: QuizPayload;
}

export interface HistoryResponse {
  items: QuizMeta[];
  total: number;
}

export interface GradeResponse {
  id: number;
  score: number;
  total: number;
  per_question: Array<{ correct: boolean; expected: string; got: string }>;
}
