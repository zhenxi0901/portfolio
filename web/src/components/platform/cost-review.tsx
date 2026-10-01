import { CheckCircle, HourglassMedium } from "@phosphor-icons/react/dist/ssr";
import { costReview } from "@/content/profile";

/** Before/after bars for the measured monitoring cuts, then every lever with its guardrail. */
export function CostReview() {
  const max = Math.max(...costReview.bars.map((b) => b.before));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr]">
      <figure className="h-fit rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <figcaption>
          <p className="text-[clamp(2.5rem,5vw,3.5rem)] font-semibold leading-none tracking-[-0.05em]">
            ~15<span className="text-accent-ink">%</span>
          </p>
          <p className="mt-2 text-sm text-ink-2">lower cloud spend. The monitoring cuts, measured:</p>
        </figcaption>
        <div className="mt-5 flex items-center gap-5 text-xs text-ink-2">
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-[3px] bg-line-strong" /> before
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-[3px] bg-accent-ink" /> after
          </span>
        </div>
        <div className="mt-4 grid gap-6">
          {costReview.bars.map((b) => {
            const cut = Math.round((1 - b.after / b.before) * 100);
            return (
              <div key={b.label} role="img" aria-label={`${b.label}: ${b.before.toLocaleString("en-US")} before, ${b.after.toLocaleString("en-US")} after, ${cut}% less`}>
                <p className="flex justify-between gap-3 text-sm">
                  <span className="font-medium">{b.label}</span>
                  <span className="font-mono text-xs text-ink-2">-{cut}%</span>
                </p>
                <div className="mt-2 grid gap-[3px]">
                  <Bar value={b.before} max={max} tone="before" />
                  <Bar value={b.after} max={max} tone="after" />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-5 text-xs leading-relaxed text-ink-3">
          Managed Prometheus bills per sample ingested, so samples per scrape is the lever that moves the bill.
        </p>
      </figure>

      <ol className="grid gap-3">
        {costReview.levers.map((l) => (
          <li key={l.title} className="rounded-3xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 font-mono text-[11px] text-ink-2">{l.area}</span>
              <h4 className="font-semibold">{l.title}</h4>
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-ink-2">
                {l.status === "done" ? (
                  <CheckCircle size={14} weight="fill" className="text-good" />
                ) : (
                  <HourglassMedium size={14} weight="fill" className="text-ink-3" />
                )}
                {l.status}
              </span>
            </div>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{l.detail}</p>
            <p className="mt-2 border-l-2 border-accent-ink/60 pl-3 text-sm leading-relaxed text-ink">
              {l.guardrail.startsWith("sort_desc") ? <code className="font-mono text-[12px]">{l.guardrail}</code> : l.guardrail}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Bar({ value, max, tone }: { value: number; max: number; tone: "before" | "after" }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={"grow-x h-5 rounded-r-[4px] " + (tone === "before" ? "bg-line-strong" : "bg-accent-ink")}
        style={{ width: `${(value / max) * 78}%` }}
      />
      <span className="font-mono text-xs tabular-nums text-ink-2">{value.toLocaleString("en-US")}</span>
    </div>
  );
}
