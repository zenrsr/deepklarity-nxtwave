import type { QuizPayload } from '../api/types';

function SectionList({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-2 rounded-2xl border border-slate-100 bg-white/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <ul className="grid gap-1 text-sm text-slate-700">
        {items.map((item, idx) => (
          <li key={`${label}-${idx}`} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EntityGroup({ payload }: { payload: QuizPayload }) {
  const groups = [
    { label: 'People', items: payload.key_entities.people },
    { label: 'Organizations', items: payload.key_entities.organizations },
    { label: 'Locations', items: payload.key_entities.locations },
  ].filter((group) => group.items?.length);

  if (!groups.length) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Key entities</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {groups.map((group) => (
          <div key={group.label} className="space-y-2 rounded-xl border border-slate-100 bg-white/80 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {group.label}
            </p>
            <ul className="grid gap-1 text-sm text-slate-700">
              {group.items.map((item, idx) => (
                <li key={`${group.label}-${idx}`} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-1">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function QuizDisplay({ payload }: { payload: QuizPayload }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-3">
        <h3 className="text-2xl font-semibold text-slate-900">{payload.title}</h3>
        <p className="text-sm leading-relaxed text-slate-600">{payload.summary}</p>
        {payload.notes && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {payload.notes}
          </div>
        )}
      </header>

      <EntityGroup payload={payload} />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr] lg:items-start">
        <SectionList label="Sections" items={payload.sections} />
        <SectionList label="Related topics" items={payload.related_topics} />
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-semibold text-slate-900">Quiz questions</h4>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {payload.quiz.length} total
          </span>
        </div>
        <ol className="grid gap-3">
          {payload.quiz.map((item, idx) => (
            <li
              key={idx}
              className="space-y-3 rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-base font-semibold text-slate-900">
                  <span className="text-slate-500">Q{idx + 1}.</span> {item.question}
                </p>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {item.difficulty?.toUpperCase() ?? 'N/A'}
                </span>
              </div>

              <ul className="grid gap-2 text-sm text-slate-700">
                {item.options.map((opt, optIdx) => (
                  <li
                    key={optIdx}
                    className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                  >
                    <span className="mt-0.5 inline-flex size-7 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-600">
                      {String.fromCharCode(65 + optIdx)}
                    </span>
                    <span className="flex-1 text-slate-800">{opt}</span>
                  </li>
                ))}
              </ul>

              <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-green-800">
                  <p className="font-semibold text-green-700">Answer</p>
                  <p>{item.answer}</p>
                </div>
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800">
                  <p className="font-semibold text-blue-700">Explanation</p>
                  <p>{item.explanation}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 sm:col-span-2">
                  <p className="font-semibold text-slate-600">Evidence</p>
                  <p>“{item.evidence_span}”</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
