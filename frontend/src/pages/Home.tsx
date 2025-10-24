import { useEffect, useMemo, useState } from 'react';
import { generateQuiz, listHistory } from '../api/api';
import type { QuizMeta } from '../api/types';
import { useNavigate } from 'react-router-dom';
import Spinner from '../components/Spinner';
import { Button } from '@/components/ui/button';

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

type HistoryGroup = {
  key: string;
  canonical: string;
  items: QuizMeta[];
  latest: QuizMeta;
};

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
  const [url, setUrl] = useState('https://en.wikipedia.org/wiki/World_Wide_Web');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<QuizMeta[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [regenKey, setRegenKey] = useState<string | null>(null);
  const nav = useNavigate();

  const urlDisabled = useMemo(() => !url.trim() || busy, [url, busy]);
  const { historyGroups, historyLookup } = useMemo(() => {
    const map = new Map<string, HistoryGroup>();

    for (const item of history) {
      const key = canonicalKey(item.url);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          canonical: key,
          items: [item],
          latest: item,
        });
      } else {
        existing.items.push(item);
        if (parseDate(item.date_generated) > parseDate(existing.latest.date_generated)) {
          existing.latest = item;
        }
      }
    }

    const groups: HistoryGroup[] = Array.from(map.values()).map((group) => {
      group.items.sort((a, b) => parseDate(b.date_generated) - parseDate(a.date_generated));
      group.latest = group.items[0];
      return group;
    });

    groups.sort(
      (a: HistoryGroup, b: HistoryGroup) =>
        parseDate(b.latest.date_generated) - parseDate(a.latest.date_generated),
    );
    const lookup = new Map(groups.map((g) => [g.key, g]));
    return { historyGroups: groups, historyLookup: lookup };
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
        setFormError(null);
        setFormNotice('Opening saved quiz from history...');
        nav(`/quiz/${existing.latest.id}`);
        return;
      }
    }

    setBusy(true);
    setFormError(null);
    setFormNotice(force ? 'Generating a fresh quiz...' : null);
    try {
      const res = await generateQuiz({ url: candidate, force });
      nav(`/quiz/${res.id}`);
    } catch (e: any) {
      setFormError(e.message || 'Failed to generate quiz');
      setFormNotice(null);
    } finally {
      setBusy(false);
    }
  }

  function toggleGroup(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function onRegenerate(urlToRegenerate: string, key: string) {
    if (regenKey) return;
    setRegenKey(key);
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

        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-lg ring-1 ring-slate-900/5 backdrop-blur-sm sm:p-8">
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
            {busy && (
              <div className="text-sm text-slate-500">
                <Spinner label="Talking to backend..." />
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-lg ring-1 ring-slate-900/5 backdrop-blur-sm sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Recent quizzes</h2>
              <p className="text-sm text-slate-500">
                Your last 10 generated quizzes stay cached for a few hours.
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

          <div className="mt-6">
            {historyError && <div className="text-sm text-rose-600">{historyError}</div>}
            <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              {historyGroups.map((group) => {
                const latest = group.latest;
                const versionCount = group.items.length;
                const isExpanded = Boolean(expanded[group.key]);
                return (
                  <li
                    key={group.key}
                    className="flex flex-col justify-between rounded-2xl border border-slate-100 bg-slate-50/80 p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                  >
                    <div className="space-y-2">
                      <div className="text-sm font-medium uppercase tracking-wide text-slate-500">
                        {latest.date_generated}
                      </div>
                      <div className="text-lg font-semibold text-slate-900">
                        {formatHistoryTitle(latest.title, latest.url)}
                      </div>
                      <div className="text-xs text-slate-500 break-words">
                        {formatHistoryUrl(latest.url)}
                      </div>
                      {versionCount > 1 && (
                        <div className="text-xs text-slate-500">
                          {versionCount - 1} earlier version{versionCount - 1 !== 1 ? 's' : ''}{' '}
                          <button
                            className="ml-1 font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900"
                            onClick={() => toggleGroup(group.key)}
                          >
                            {isExpanded ? 'Hide details' : 'View versions'}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-black shadow-sm hover:bg-slate-700"
                        onClick={() => nav(`/quiz/${latest.id}`)}
                      >
                        Open latest
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-xl border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                        disabled={regenKey === group.key || busy}
                        onClick={() => onRegenerate(latest.url, group.key)}
                      >
                        {regenKey === group.key ? 'Regenerating...' : 'New questions'}
                      </Button>
                    </div>
                    {isExpanded && versionCount > 1 && (
                      <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-white/80 p-4">
                        {group.items.slice(1).map((item: QuizMeta) => (
                          <div
                            key={item.id}
                            className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600"
                          >
                            <div className="font-medium text-slate-700">{item.date_generated}</div>
                            <Button
                              variant="ghost"
                              className="self-start rounded-lg px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                              onClick={() => nav(`/quiz/${item.id}`)}
                            >
                              Open version
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {!historyLoading && historyGroups.length === 0 && !historyError && (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No quizzes yet. Generate one to see it listed here.
              </div>
            )}
            {historyLoading && (
              <div className="mt-4 flex items-center text-sm text-slate-500">
                <Spinner label="Loading recent quizzes..." />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
