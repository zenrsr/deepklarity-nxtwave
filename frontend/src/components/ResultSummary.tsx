import type { GradeResponse, QuizItem } from '../api/types';

export default function ResultSummary({
  result,
  questions,
}: {
  result: GradeResponse;
  questions: QuizItem[];
}) {
  const pct = Math.round(result.score);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-lg ring-1 ring-slate-900/5 sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-2xl font-semibold text-slate-900">Results</h3>
        <span className="text-sm font-medium text-slate-600">
          {result.correct}/{result.total} correct • {pct}%
        </span>
      </div>

      <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-600 transition-[width]"
          style={{ width: `${pct}%` }}
          aria-label="score"
        />
      </div>

      <ul className="mt-6 grid gap-4">
        {result.results.map((entry) => {
          const question = questions[entry.index];
          const chosen =
            entry.chosen >= 0 ? String.fromCharCode(65 + entry.chosen) : 'Skipped';
          const correct =
            entry.correct >= 0 ? String.fromCharCode(65 + entry.correct) : 'Unavailable';
          const status = entry.is_correct
            ? 'Correct'
            : entry.chosen === -1
            ? 'Skipped'
            : 'Check again';
          return (
            <li
              key={entry.index}
              className={[
                'rounded-2xl border p-4 text-sm shadow-sm transition',
                entry.is_correct
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : entry.chosen === -1
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
              ].join(' ')}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <span className="text-base font-semibold text-slate-900">
                  Q{entry.index + 1} — {status}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-600">
                  Your answer: {chosen} • Correct: {correct}
                </span>
              </div>

              {question && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-semibold text-slate-800">{question.question}</p>
                  <ul className="grid gap-2">
                    {question.options.map((opt, idx) => {
                      const letter = String.fromCharCode(65 + idx);
                      const isChosen = entry.chosen === idx;
                      const isCorrect = entry.correct === idx;
                      const classes = [
                        'rounded-xl border px-3 py-2 text-sm transition',
                        isCorrect
                          ? 'border-green-400 bg-green-50 text-green-900'
                          : isChosen
                          ? 'border-rose-300 bg-rose-50 text-rose-900'
                          : 'border-slate-200 bg-white text-slate-700',
                      ].join(' ');
                      return (
                        <li key={idx} className={classes}>
                          <div className="flex items-start gap-3">
                            <span
                              className={[
                                'mt-0.5 inline-flex size-6 items-center justify-center rounded-full border text-xs font-semibold',
                                isCorrect
                                  ? 'border-green-500 bg-green-100 text-green-800'
                                  : isChosen
                                  ? 'border-rose-400 bg-rose-100 text-rose-800'
                                  : 'border-slate-200 bg-slate-50 text-slate-600',
                              ].join(' ')}
                            >
                              {letter}
                            </span>
                            <div className="flex-1">
                              <p className="text-sm leading-5 text-slate-800">{opt}</p>
                              {isCorrect && (
                                <p className="mt-1 text-xs font-medium text-green-700">
                                  {isChosen ? 'You selected the correct answer.' : 'Correct answer.'}
                                </p>
                              )}
                              {!isCorrect && isChosen && (
                                <p className="mt-1 text-xs font-medium text-rose-700">
                                  You picked this option.
                                </p>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div className="mt-4 space-y-3 text-xs text-slate-700">
                <div>
                  <p className="font-medium text-slate-600">Explanation</p>
                  <p className="rounded-xl bg-white/70 p-3 text-slate-700">{entry.explanation}</p>
                </div>
                <div>
                  <p className="font-medium text-slate-600">Evidence</p>
                  <p className="rounded-xl bg-white/70 p-3 text-slate-700">"{entry.evidence_span}"</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
