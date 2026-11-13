import { measures } from "@/content/ai-platform";

/** How I benchmark and watch an LLM service: the question, what answers it, and why. */
export function Measures() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {measures.map((m) => (
        <article key={m.question} className="flex flex-col rounded-3xl border border-line bg-surface p-5">
          <h4 className="font-semibold">{m.question}</h4>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {m.metrics.map((x) => (
              <li key={x}>
                <code className="block rounded-lg border border-line bg-surface-2/70 px-2 py-1 font-mono text-[12px] leading-snug text-ink">{x}</code>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">{m.why}</p>
        </article>
      ))}
    </div>
  );
}
