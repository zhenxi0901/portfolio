import { monitoringFacts, signals } from "@/content/profile";

/** The signals I alert on, grouped by the question each one answers, and why that signal. */
export function Signals() {
  return (
    <div>
      <ul className="mb-6 grid gap-3 sm:grid-cols-3">
        {monitoringFacts.map((f) => (
          <li key={f} className="rounded-2xl bg-surface-2 px-4 py-3 text-sm leading-snug text-ink-2">
            {f}
          </li>
        ))}
      </ul>
      <div className="grid gap-3 md:grid-cols-2">
        {signals.map((s) => (
          <article key={s.question} className="flex flex-col rounded-3xl border border-line bg-surface p-5">
            <h4 className="font-semibold">{s.question}</h4>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {s.metrics.map((m) => (
                <li key={m}>
                  <code className="block rounded-lg border border-line bg-surface-2/70 px-2 py-1 font-mono text-[12px] leading-snug text-ink">
                    {m}
                  </code>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">{s.why}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
