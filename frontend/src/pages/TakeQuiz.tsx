import { useEffect, useMemo, useState } from "react";
import { gradeQuiz, getQuiz } from "../lib/api";
import type { QuizResponse } from "../types/types";
import { useParams, Link } from "react-router-dom";

export default function TakeQuiz() {
  const { id } = useParams();
  const quizId = Number(id);
  const [data, setData] = useState<QuizResponse | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | { score: number; total: number }>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getQuiz(quizId).then(setData).catch((e) => setErr(e?.message || "Failed to load quiz"));
  }, [quizId]);

  const submitDisabled = useMemo(() => {
    if (!data) return true;
    const total = data.full_quiz_data.quiz.length;
    return Object.keys(answers).length !== total;
  }, [answers, data]);

  async function onSubmit() {
    if (!data) return;
    setSubmitting(true);
    setErr(null);
    try {
      const ordered = data.full_quiz_data.quiz.map((_, i) => answers[i] ?? "");
      const r = await gradeQuiz(quizId, ordered);
      setResult({ score: r.score, total: r.total });
    } catch (e: any) {
      setErr(e?.message || "Failed to grade");
    } finally {
      setSubmitting(false);
    }
  }

  if (err) return <div className="p-6 text-red-600">{err}</div>;
  if (!data) return <div className="p-6">Loading…</div>;

  const q = data.full_quiz_data;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <h1 className="text-xl font-semibold">{q.title} — Take Quiz</h1>

        <div className="space-y-4">
          {q.quiz.map((item, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">Q{idx + 1}. {item.question}</h3>
                <span className="text-xs uppercase tracking-wide bg-slate-200 px-2 py-0.5 rounded">
                  {item.difficulty}
                </span>
              </div>

              <div className="space-y-2">
                {item.options.map((opt, i) => {
                  const id = `q${idx}-${i}`;
                  return (
                    <label key={id} htmlFor={id} className="flex items-center gap-2">
                      <input
                        id={id}
                        type="radio"
                        name={`q_${idx}`}
                        value={opt}
                        checked={answers[idx] === opt}
                        onChange={() => setAnswers((s) => ({ ...s, [idx]: opt }))}
                      />
                      <span>{opt}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {!result ? (
          <button
            onClick={onSubmit}
            disabled={submitDisabled || submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Grading…" : "Submit Answers"}
          </button>
        ) : (
          <div className="bg-white rounded-xl shadow p-4">
            <div className="text-lg font-semibold">
              Score: {result.score} / {result.total}
            </div>
            <div className="mt-3 flex gap-3">
              <Link className="text-blue-700 underline" to={`/quiz/${quizId}`}>Back to quiz</Link>
              <Link className="text-blue-700 underline" to="/">Home</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
