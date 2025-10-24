export type QuizItem = {
  question: string;
  options: string[];
  answer: string;
  difficulty: 'easy' | 'medium' | 'hard';
  explanation: string;
  evidence_span: string;
};

export type QuizPayload = {
  title: string;
  summary: string;
  key_entities: {
    people: string[];
    organizations: string[];
    locations: string[];
  };
  sections: string[];
  quiz: QuizItem[];
  related_topics: string[];
  notes?: string | null;
};

export type QuizResponse = {
  id: number;
  url: string;
  title: string;
  date_generated: string;
  full_quiz_data: QuizPayload;
};

export type HistoryResponse = {
  items: { id: number; url: string; title: string; date_generated: string }[];
  total: number;
};

export type GenerateQuizRequest = {
  url: string;
  force?: boolean;
  minQuestions?: number;
  maxQuestions?: number;
};

export type GradeRequest = { id: number; answers: number[] };

export type GradeItem = {
  index: number;
  chosen: number;
  correct: number;
  is_correct: boolean;
  explanation: string;
  evidence_span: string;
};
export type GradeResponse = {
  id: number;
  total: number;
  correct: number;
  score: number;
  results: GradeItem[];
};

const BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '') || 'http://127.0.0.1:8000';

type HttpMethod = "GET" | "POST";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function request<T>(
  path: string,
  method: HttpMethod,
  body?: any,
  opts?: { retries?: number; timeoutMs?: number }
): Promise<T> {
  const url = `${BASE}${path}`;
  const retries = opts?.retries ?? 3;
  const timeoutMs = opts?.timeoutMs ?? 30000;

  let attempt = 0;
  let backoff = 500;

  while (true) {
    attempt += 1;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        return (await res.json()) as T;
      }

      if ((res.status === 429 || res.status === 502) && attempt <= retries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff;
        await sleep(wait);
        backoff = Math.min(backoff * 2, 8000);
        continue;
      }

      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    } catch (err: any) {
      clearTimeout(timer);
      if (attempt <= retries) {
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 8000);
        continue;
      }
      throw err;
    }
  }
}


export async function checkGeminiKey() {
  return request<{ ok: boolean; model?: string; sample?: string; error?: string }>(
    '/check_gemini_key',
    'GET',
  );
}

export async function listHistory(page = 1, pageSize = 10) {
  const q = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  return request<HistoryResponse>(`/history?${q.toString()}`, 'GET');
}

export async function generateQuiz(req: GenerateQuizRequest) {
  const { url, force = false, minQuestions = 7, maxQuestions = 10 } = req;
  return request<QuizResponse>(
    '/generate_quiz',
    'POST',
    { url, force, min_questions: minQuestions, max_questions: maxQuestions },
    { retries: 4 },
  );
}

export async function getQuiz(id: number) {
  return request<QuizResponse>(`/quiz/${id}`, 'GET');
}

export async function gradeQuiz(body: GradeRequest) {
  return request<GradeResponse>('/grade', 'POST', body, { retries: 2 });
}
