import { useCallback, useEffect, useMemo, useState } from 'react';
import { generateQuiz, getQuiz, listHistory } from '../api/api';
import type { QuizMeta, QuizResponse } from '../api/types';
import Spinner from '../components/Spinner';
import { Button } from '@/components/ui/button';
import QuizDisplay from '../components/QuizDisplay';

function deriveFallbackTitle(url: string): string {
  try {
    const parsed = new URL(url);
    const slug =
      parsed.pathname
        .split('/')
        .filter(Boolean)
        .pop() ?? parsed.hostname;
    return decodeURIComponent(slug.replace(/[-_]/g, ' ') || parsed.hostname);
  } catch {
    return url;
  }
}

function formatHistoryTitle(raw: string, url: string): string {
  const base = raw?.trim() ?? '';
  if (!base) {
    return deriveFallbackTitle(url);
  }
  if (base.toLowerCase().startsWith('<!doctype')) {
    return deriveFallbackTitle(url);
  }
  const withoutTags = base.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const normalized = withoutTags.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return deriveFallbackTitle(url);
  }
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function formatHistoryUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}
function canonicalKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function parseDate(date: string): number {
  const normalized = date.replace(' ', 'T');
  const ts = Date.parse(normalized);
  return Number.isNaN(ts) ? 0 : ts;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
  const [url, setUrl] = useState('https://en.wikipedia.org/wiki/World_Wide_Web');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<QuizMeta[]>([]);
  const [regenKey, setRegenKey] = useState<string | null>(null);
  const [currentQuiz, setCurrentQuiz] = useState<QuizResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalQuiz, setModalQuiz] = useState<QuizResponse | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const urlDisabled = useMemo(() => !url.trim() || busy, [url, busy]);
  const { sortedHistory, historyLookup } = useMemo(() => {
    const sorted = [...history].sort(
      (a, b) => parseDate(b.date_generated) - parseDate(a.date_generated),
    );
    const lookup = new Map<string, QuizMeta>();
    for (const item of sorted) {
      const key = canonicalKey(item.url);
      if (!lookup.has(key)) {
        lookup.set(key, item);
      }
    }
    return { sortedHistory: sorted, historyLookup: lookup };
  }, [history]);

  async function onGenerate(force = false, overrideUrl?: string) {
    const candidate = (overrideUrl ?? url).trim();
    try {
      new URL(candidate);
    } catch {
      setFormError('Enter a valid article URL before generating a quiz.');
      return;
    }

    const key = canonicalKey(candidate);
    if (!force) {
      const existing = historyLookup.get(key);
      if (existing) {
        setActiveTab('generate');
        setFormError(null);
        setFormNotice('Opening saved quiz from history...');
        await showQuiz(existing.id);
        return;
      }
    }

    setBusy(true);
    setFormError(null);
    setFormNotice(force ? 'Generating a fresh quiz...' : null);
    try {
      const res = await generateQuiz({ url: candidate, force });
      setCurrentQuiz(res);
      setActiveTab('generate');
      setPreviewError(null);
      setFormNotice('Quiz generated below.');
      setHistory((prev) => {
        const next = prev.filter((item) => item.id !== res.id);
        return [
          {
            id: res.id,
            url: res.url,
            title: res.title,
            date_generated: res.date_generated,
          },
          ...next,
        ];
      });
    } catch (e: any) {
      setFormError(e.message || 'Failed to generate quiz');
      setFormNotice(null);
    } finally {
      setBusy(false);
    }
  }

  async function onRegenerate(urlToRegenerate: string, key: string | number) {
    if (regenKey) return;
    const token = String(key);
    setRegenKey(token);
    setFormError(null);
    setFormNotice(null);
    try {
      await onGenerate(true, urlToRegenerate);
    } finally {
      setRegenKey(null);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const h = await listHistory(1, 10);
      setHistory(h.items);
    } catch (e: any) {
      setHistoryError(e.message || 'Unable to fetch history right now.');
    } finally {
      setHistoryLoading(false);
    }
  }

  async function showQuiz(id: number) {
    setActiveTab('generate');
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const res = await getQuiz(id);
      setCurrentQuiz(res);
      setFormNotice('Loaded quiz from history.');
    } catch (e: any) {
      setPreviewError(e.message || 'Unable to load quiz.');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function openDetails(id: number) {
    setModalOpen(true);
    setModalQuiz(null);
    setModalError(null);
    setModalLoading(true);
    try {
      const res = await getQuiz(id);
      setModalQuiz(res);
    } catch (e: any) {
      setModalError(e.message || 'Unable to load quiz details.');
    } finally {
      setModalLoading(false);
    }
  }

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setModalQuiz(null);
    setModalError(null);
    setModalLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const h = await listHistory(1, 10);
        if (!alive) return;
        setHistory(h.items);
      } catch (e: any) {
        if (!alive) return;
        setHistoryError(e.message || 'Unable to fetch history right now.');
      } finally {
        if (!alive) return;
        setHistoryLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [modalOpen, closeModal]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 pb-16 pt-12 sm:px-6 lg:px-8 lg:pt-16">
        <header className="flex flex-col gap-3 text-slate-900">
          <span className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-500">
            DeepKlarity
          </span>
          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Generate bite-sized quizzes from any article in seconds.
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Paste a Wikipedia link and we will craft a structured quiz, summary, and key facts you can use to study or share. Recent quizzes stay handy so you can revisit them later.
          </p>
        </header>

        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 p-1 text-sm font-semibold text-slate-600 shadow-sm">
          <button
            type="button"
            className={[
              'flex-1 rounded-full px-4 py-2 transition',
              activeTab === 'generate'
                ? 'bg-slate-900 text-white shadow'
                : 'hover:bg-slate-100'
            ].join(' ')}
            onClick={() => setActiveTab('generate')}
          >
            Generate quiz
          </button>
          <button
            type="button"
            className={[
              'flex-1 rounded-full px-4 py-2 transition',
              activeTab === 'history'
                ? 'bg-slate-900 text-white shadow'
                : 'hover:bg-slate-100'
            ].join(' ')}
            onClick={() => setActiveTab('history')}
          >
            Past quizzes
          </button>
        </div>

        {activeTab === 'generate' && (
          <section className="flex flex-col gap-6">
            <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-lg ring-1 ring-slate-900/5 backdrop-blur-sm sm:p-8">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="text-sm font-semibold tracking-wide text-slate-700">
                  Article URL
                </label>
                <span className="text-xs text-slate-500">
                  Supports public Wikipedia articles. Private or paywalled links are skipped.
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 shadow-inner transition focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                  placeholder="https://en.wikipedia.org/wiki/Alan_Turing"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setFormError(null);
                    setFormNotice(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onGenerate();
                    }
                  }}
                  disabled={busy}
                  aria-invalid={Boolean(formError)}
                />
                <Button
                  className="h-full min-w-[160px] rounded-2xl bg-blue-600 px-5 py-3 text-base font-semibold text-black shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
                  onClick={() => onGenerate()}
                  disabled={urlDisabled}
                >
                  {busy ? 'Generating...' : 'Generate quiz'}
                </Button>
              </div>

              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {formError && <div className="text-sm font-medium text-rose-600">{formError}</div>}
                {formNotice && !busy && <div className="text-sm font-medium text-blue-600">{formNotice}</div>}
                {(busy || previewLoading) && (
                  <div className="text-sm text-slate-500">
                    <Spinner label={busy ? 'Talking to backend...' : 'Loading quiz...'} />
                  </div>
                )}
              </div>
              {previewError && (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {previewError}
                </div>
              )}
            </div>

            {currentQuiz && (
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-lg ring-1 ring-slate-900/5 backdrop-blur-sm sm:p-8">
                <div className="mb-4 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span className="font-semibold uppercase tracking-wide text-slate-600">
                    Generated
                  </span>
                  <span className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-1 font-semibold text-slate-700">
                    {new Date(currentQuiz.date_generated).toLocaleString()}
                  </span>
                </div>
                <QuizDisplay payload={currentQuiz.full_quiz_data} />
              </div>
            )}
          </section>
        )}

        {activeTab === 'history' && (
          <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-lg ring-1 ring-slate-900/5 backdrop-blur-sm sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Recent quizzes</h2>
                <p className="text-sm text-slate-500">
                  View every quiz generated in this session. Details open the full structured quiz.
                </p>
              </div>
              <Button
                variant="outline"
                className="rounded-xl border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                onClick={loadHistory}
                disabled={historyLoading}
              >
                {historyLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>

            <div className="mt-6 space-y-4">
              {historyError && <div className="text-sm text-rose-600">{historyError}</div>}

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80">
                <table className="w-full border-collapse text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3">ID</th>
                      <th scope="col" className="px-4 py-3">Title</th>
                      <th scope="col" className="px-4 py-3">Article</th>
                      <th scope="col" className="px-4 py-3">Generated</th>
                      <th scope="col" className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHistory.map((item) => {
                      const rowRegenerating = regenKey === String(item.id);
                      return (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="px-4 py-3 text-xs font-semibold text-slate-500">{item.id}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                            {formatHistoryTitle(item.title, item.url)}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {formatHistoryUrl(item.url)}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {new Date(item.date_generated.replace(' ', 'T')).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                className="rounded-xl border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                                onClick={() => openDetails(item.id)}
                                disabled={modalLoading}
                              >
                                Details
                              </Button>
                              <Button
                                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-black shadow-sm hover:bg-slate-700"
                                onClick={() => showQuiz(item.id)}
                              >
                                Open
                              </Button>
                              <Button
                                variant="ghost"
                                className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-700"
                                disabled={Boolean(regenKey) || busy}
                                onClick={() => onRegenerate(item.url, item.id)}
                              >
                                {rowRegenerating ? 'Regenerating...' : 'New questions'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!sortedHistory.length && !historyLoading && !historyError && (
                  <div className="px-4 py-6 text-center text-sm text-slate-500">
                    No quizzes yet. Generate one to see it listed here.
                  </div>
                )}
              </div>

              {historyLoading && (
                <div className="flex items-center text-sm text-slate-500">
                  <Spinner label="Loading recent quizzes..." />
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900">Quiz details</h3>
              <Button
                variant="ghost"
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                onClick={closeModal}
              >
                Close
              </Button>
            </div>
            <div className="mt-4">
              {modalLoading && (
                <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-6">
                  <Spinner label="Fetching quiz..." />
                </div>
              )}
              {modalError && !modalLoading && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {modalError}
                </div>
              )}
              {modalQuiz && !modalLoading && !modalError && (
                <QuizDisplay payload={modalQuiz.full_quiz_data} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
