import { http } from "./http";
import type {
  QuizResponse,
  HistoryResponse,
  GradeResponse,
} from "../types/types";

export async function generateQuiz(url: string, force = false, minQ = 5, maxQ = 10) {
  return http<QuizResponse>("/generate_quiz", {
    method: "POST",
    body: JSON.stringify({ url, force, min_questions: minQ, max_questions: maxQ }),
  });
}

export async function getQuiz(id: number) {
  return http<QuizResponse>(`/quiz/${id}`, { method: "GET" });
}

export async function getHistory(page = 1, pageSize = 10) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  return http<HistoryResponse>(`/history?${params.toString()}`, { method: "GET" });
}

export async function gradeQuiz(id: number, answers: string[]) {
  return http<GradeResponse>("/grade", {
    method: "POST",
    body: JSON.stringify({ id, answers }),
  });
}

export async function cacheStatus() {
  return http<{ hits: number; misses: number; memory: any; disk: any }>("/cache/status", {
    method: "GET",
    timeoutMs: 8000,
  });
}
