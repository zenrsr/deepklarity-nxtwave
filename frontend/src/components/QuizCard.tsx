import { useMemo } from 'react';
import type { QuizItem } from '../api/types';

interface Props {
  item: QuizItem;
  qIndex: number;
  selected?: number | null;
  onSelect: (idx: number | null) => void;
}

export default function QuizCard({ item, qIndex, selected, onSelect }: Props) {
  const options = useMemo(() => item.options, [item.options]);
  const difficulty = useMemo(() => item.difficulty?.toUpperCase?.() ?? 'N/A', [item.difficulty]);

  return (
    <article className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-lg shadow-slate-200/60 ring-1 ring-slate-900/5 transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="text-lg font-semibold leading-7 text-slate-900">
          <span className="text-slate-500">Q{qIndex + 1}.</span> {item.question}
        </h3>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {difficulty}
        </span>
      </div>

      <div role="radiogroup" aria-label={`Question ${qIndex + 1}`} className="mt-5 grid gap-3">
        {options.map((opt, i) => {
          const letter = String.fromCharCode(65 + i);
          const isSelected = selected === i;
          return (
            <button
              type="button"
              key={i}
              onClick={() => onSelect(isSelected ? null : i)}
              role="radio"
              aria-checked={isSelected}
              className={[
                'w-full rounded-2xl border px-4 py-3 text-left text-base font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-green-100',
                isSelected
                  ? 'border-green-500 bg-green-50 text-green-900 shadow-sm shadow-green-100'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              ].join(' ')}
            >
              <span
                className={[
                  'mr-3 inline-flex size-8 items-center justify-center rounded-full border text-sm font-semibold',
                  isSelected
                    ? 'border-green-500 bg-green-100 text-green-800'
                    : 'border-slate-200 bg-white text-slate-600'
                ].join(' ')}
              >
                {letter}
              </span>
              <span className="align-middle text-slate-800">{opt}</span>
            </button>
          );
        })}
      </div>
    </article>
  );
}
