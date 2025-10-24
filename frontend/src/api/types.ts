export type Difficulty = 'easy' | 'medium' | 'hard';

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
  notes?: string | null;
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

export interface GenerateQuizRequest {
  url: string;
  force?: boolean;
}

export interface GradeRequest {
  id: number;
  answers: number[];
}

export interface GradeItem {
  index: number;
  chosen: number;
  correct: number; 
  is_correct: boolean;
  explanation: string;
  evidence_span: string;
}

export interface GradeResponse {
  id: number;
  total: number;
  correct: number;
  score: number;
  results: GradeItem[];
}
