import { useCallback, useEffect, useMemo, useState } from 'react';
import { getQuiz, gradeQuiz, generateQuiz } from '../api/api';
import type { GradeResponse, QuizItem, QuizResponse } from '../api/types';
import { useNavigate, useParams } from 'react-router-dom';
import QuizCard from '../components/QuizCard';
import Spinner from '../components/Spinner';
import { Button } from '@/components/ui/button';

export default function Quiz() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [data, setData] = useState<QuizResponse | null>(null);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [skipPrompt, setSkipPrompt] = useState<number[] | null>(null);
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenNotice, setRegenNotice] = useState<string | null>(null);

  // Load quiz
  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const res = await getQuiz(Number(id));
        if (!ok) return;
        setData(res);
      } catch (e: any) {
        setErr(e.message || 'Failed to load quiz');
      }
    })();
    return () => { ok = false; };
  }, [id]);

  const list: QuizItem[] = useMemo(() => data?.full_quiz_data.quiz ?? [], [data]);
  const totalQuestions = list.length;
  const storageKey = useMemo(() => (data ? `quiz-selection-${data.id}` : null), [data]);

  useEffect(() => {
    if (!data) {
      setSelected({});
      return;
    }
    if (!storageKey || typeof window === 'undefined') {
      setSelected({});
      return;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setSelected({});
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const next: Record<number, number> = {};
        if (Array.isArray(parsed)) {
          parsed.forEach((val, idx) => {
            if (typeof val === 'number' && val >= 0) {
              next[idx] = val;
            }
          });
        } else {
          Object.entries(parsed).forEach(([k, v]) => {
            const idx = Number(k);
            if (Number.isInteger(idx) && typeof v === 'number' && v >= 0) {
              next[idx] = v;
            }
          });
        }
        setSelected(next);
      } else {
        setSelected({});
      }
    } catch (error) {
      console.warn('Unable to restore quiz selections', error);
      setSelected({});
    }
  }, [data, storageKey]);

  const persistSelection = useCallback(
    (next: Record<number, number>) => {
      if (!storageKey || typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch (error) {
        console.warn('Unable to persist quiz selections', error);
      }
    },
    [storageKey],
  );

  const answeredCount = useMemo(() => {
    return list.reduce((count, _, idx) => (typeof selected[idx] === 'number' ? count + 1 : count), 0);
  }, [list, selected]);

  const progressPct = totalQuestions ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const handleSelect = useCallback(
    (questionIdx: number, optionIdx: number | null) => {
      setSelected((prev) => {
        const next = { ...prev };
        if (optionIdx === null) {
          delete next[questionIdx];
        } else {
          next[questionIdx] = optionIdx;
        }
        persistSelection(next);
        return next;
      });
      setErr(null);
      setSkipPrompt(null);
    },
    [persistSelection],
  );

  function buildAnswers() {
    return list.map((_, idx) => {
      const value = selected[idx];
      return typeof value === 'number' ? value : -1;
    });
  }

  async function submit(force = false) {
    if (!data) return;
    const answers = buildAnswers();
    const skipped = answers
      .map((ans, idx) => ({ ans, idx }))
      .filter(({ ans }) => ans === -1)
      .map(({ idx }) => idx);

    if (skipped.length && !force) {
      setErr(`You have ${skipped.length} unanswered question${skipped.length > 1 ? 's' : ''}.`);
      setSkipPrompt(skipped);
      return;
    }
    setSkipPrompt(null);
    setBusy(true);
    setErr(null);
    try {
      const res: GradeResponse = await gradeQuiz({ id: data.id, answers });
      // stash result in navigation state so the Results page can render without refetch
      nav(`/quiz/${data.id}/results`, { state: { quiz: data, result: res } });
    } catch (e: any) {
      setErr(e.message || 'Failed to grade');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    await submit(false);
  }

  async function onConfirmSkip() {
    await submit(true);
  }

  async function onRegenerateQuiz() {
    if (!data || regenBusy || busy) return;
    setRegenBusy(true);
    setRegenNotice('Creating a fresh quiz from this article...');
    setErr(null);
    setSkipPrompt(null);
    try {
      const res = await generateQuiz({
        url: data.url,
        force: true,
        minQuestions: data.full_quiz_data.quiz.length || 7,
        maxQuestions: data.full_quiz_data.quiz.length || 10,
      });
      nav(`/quiz/${res.id}`);
    } catch (e: any) {
      setErr(e.message || 'Failed to regenerate quiz');
      setRegenNotice(null);
    } finally {
      setRegenBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        {err ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
            {err}
            <div className="mt-4">
              <Button
                variant="outline"
                className="rounded-xl border-rose-200 px-4 py-2 text-rose-800"
                onClick={() => nav('/')}
              >
                Go back home
              </Button>
            </div>
          </div>
        ) : (
          <Spinner label="Loading quiz..." />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-20 pt-12 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-lg ring-1 ring-slate-900/5 backdrop-blur-sm sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
                {data.full_quiz_data.title}
              </h1>
              <p className="max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
                {data.full_quiz_data.summary}
              </p>
            </div>
            <div className="flex w-full max-w-xs flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-500">Progress</span>
                <span className="font-semibold text-slate-900">
                  {answeredCount}/{totalQuestions}
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-blue-600 transition-[width]"
                  style={{ width: `${progressPct}%` }}
                  aria-hidden
                />
              </div>
              <span className="text-xs text-slate-500">
                Answer every question or confirm if you intend to skip.
              </span>
              {regenNotice && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
                  {regenNotice}
                </div>
              )}
              <Button
                variant="outline"
                className="mt-2 w-full rounded-xl border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
                onClick={onRegenerateQuiz}
                disabled={regenBusy || busy}
              >
                {regenBusy ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner label="Regenerating..." />
                  </span>
                ) : (
                  'New set of questions'
                )}
              </Button>
            </div>
          </div>
        </header>

        <main className="flex flex-col gap-6">
          {list.map((q, i) => (
            <QuizCard
              key={i}
              item={q}
              qIndex={i}
              selected={selected[i] ?? null}
              onSelect={(opt) => handleSelect(i, opt)}
            />
          ))}
        </main>

        <footer className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-lg ring-1 ring-slate-900/5 backdrop-blur-sm sm:flex sm:items-center sm:justify-between sm:p-8">
          <div className="space-y-3 text-sm text-slate-600">
            {err && <div className="text-rose-600">{err}</div>}
            {skipPrompt && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                You are about to skip question{skipPrompt.length > 1 ? 's' : ''}{' '}
                {skipPrompt.map((idx) => `#${idx + 1}`).join(', ')}. You can go back and answer, or
                submit anyway below.
              </div>
            )}
            {busy && (
              <div className="flex items-center text-slate-500">
                <Spinner label="Grading your answers..." />
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:mt-0 sm:flex-row sm:items-center sm:gap-4">
            {skipPrompt && (
              <Button
                variant="outline"
                className="rounded-xl border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700"
                onClick={() => setSkipPrompt(null)}
                disabled={busy}
              >
                Keep answering
              </Button>
            )}
            <Button
              className="rounded-2xl bg-blue-600 px-6 py-3 text-base font-semibold text-black shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
              onClick={skipPrompt ? onConfirmSkip : onSubmit}
              disabled={busy}
            >
              {busy ? 'Submitting...' : skipPrompt ? 'Submit with skips' : 'Submit answers'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
