"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle, HourglassMedium, X } from "@phosphor-icons/react";
import { costReview, type CostVisual } from "@/content/profile";
import { cn } from "@/lib/utils";

const n = (v: number) => v.toLocaleString("en-US");

/** The cost review as seven moves: pick one and its before and after plays out, with the trade-off. */
export function CostReview() {
  const [i, setI] = useState(0);
  const levers = costReview.levers;
  const l = levers[i];
  const measured = l.guardrail.startsWith("sort_desc");

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <p className="text-[clamp(2.5rem,5vw,3.5rem)] font-semibold leading-none tracking-[-0.05em]">
          ~15<span className="text-accent-ink">%</span>
        </p>
        <p className="max-w-[52ch] pb-1 text-sm leading-relaxed text-ink-2">
          lower cloud spend from six moves, with a seventh in review: measure first, cut second, and write every trade-off down. Pick a move.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ol role="tablist" aria-label="Cost moves" className="flex min-w-0 gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {levers.map((x, k) => (
            // presentation: a tablist must own its tabs directly.
            <li key={x.title} role="presentation" className="shrink-0">
              <button
                type="button"
                role="tab"
                id={`cost-tab-${k}`}
                aria-controls="cost-panel"
                aria-selected={k === i}
                onClick={() => setI(k)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left text-sm transition-colors",
                  k === i ? "border-accent-ink bg-surface text-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px]",
                    k === i
                      ? "bg-accent text-on-accent"
                      : x.status === "done"
                        ? "bg-surface-2 text-ink-2"
                        : "border border-dashed border-line-strong text-ink-3",
                  )}
                >
                  {k + 1}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{x.title}</span>
                  <span className="block font-mono text-[11px] text-ink-3">
                    {x.area}
                    {x.status === "in review" ? ", in review" : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>

        {/* Only the move's content is keyed (to replay its entrance); the Previous/Next buttons stay
            mounted so they keep focus, and the live region stays put so the change is announced. */}
        <article id="cost-panel" role="tabpanel" aria-labelledby={`cost-tab-${i}`} className="min-w-0 rounded-3xl border border-line bg-surface p-5 sm:p-7">
          <div aria-live="polite">
            <div key={i} className="step-in">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-surface-2 px-2.5 py-0.5 font-mono text-[11px] text-ink-2">{l.area}</span>
                <span className="inline-flex items-center gap-1 text-xs text-ink-2">
                  {l.status === "done" ? (
                    <CheckCircle size={14} weight="fill" className="text-good" />
                  ) : (
                    <HourglassMedium size={14} weight="fill" className="text-ink-3" />
                  )}
                  {l.status}
                </span>
              </div>
              <h4 className="mt-2 text-xl font-semibold tracking-[-0.02em]">{l.title}</h4>

              <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="text-[clamp(2.25rem,4.5vw,3.25rem)] font-semibold leading-none tracking-[-0.045em]">{l.headline}</p>
                <p className="max-w-[46ch] text-sm leading-snug text-ink-2">{l.headlineNote}</p>
              </div>

              <div className="mt-6">
                <Visual v={l.visual} />
              </div>

              <p className="mt-6 text-[15px] leading-relaxed text-ink-2">{l.detail}</p>
              <div className="mt-4 rounded-2xl bg-surface-2 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{measured ? "How I measured it" : "The trade-off, on record"}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink">
                  {measured ? <code className="font-mono text-[12px]">{l.guardrail}</code> : l.guardrail}
                </p>
              </div>

            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setI(i - 1)}
              disabled={i === 0}
              className="inline-flex items-center gap-1.5 text-sm text-ink-2 transition-colors hover:text-ink disabled:opacity-30"
            >
              <ArrowLeft size={14} /> Previous
            </button>
            <span className="font-mono text-xs text-ink-3">
              {i + 1} / {levers.length}
            </span>
            <button
              type="button"
              onClick={() => setI(i + 1)}
              disabled={i === levers.length - 1}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink transition-colors disabled:opacity-30"
            >
              Next move <ArrowRight size={14} />
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}

function Visual({ v }: { v: CostVisual }) {
  switch (v.kind) {
    case "share": {
      const pct = Math.round((v.part / v.total) * 100);
      return (
        <figure role="img" aria-label={`${v.partLabel}: ${n(v.part)} of ${n(v.total)} ${v.unit}, ${pct}%`}>
          <figcaption className="mb-2 text-xs text-ink-3">{n(v.total)} {v.unit}, by source</figcaption>
          <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-lg">
            <div className="bar-in h-full rounded-l-lg bg-accent-ink" style={{ width: `${pct}%` }} />
            <div className="bar-in h-full flex-1 rounded-r-lg bg-line-strong" style={{ animationDelay: "0.25s" }} />
          </div>
          <div className="mt-2 flex justify-between gap-4 text-sm">
            <span>
              <span className="font-semibold">{v.partLabel}</span> <span className="text-ink-2">{n(v.part)} ({pct}%)</span>
            </span>
            <span className="text-right text-ink-2">
              {v.restLabel} {n(v.total - v.part)}
            </span>
          </div>
        </figure>
      );
    }
    case "reap": {
      const left = v.total - v.removed;
      return (
        <figure role="img" aria-label={`${n(v.total)} ${v.unit}, ${n(v.removed)} reaped, ${n(left)} left`}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(7px,1fr))] gap-[3px]">
            {Array.from({ length: v.total }, (_, k) => {
              // A fixed permutation, so the reaped topics are scattered rather than one block.
              const reaped = (k * 7919) % v.total < v.removed;
              return (
                <span
                  key={k}
                  className={cn("aspect-square rounded-[2px]", reaped ? "reap-dot bg-ink-3" : "bg-accent-ink")}
                  style={reaped ? { animationDelay: `${0.2 + ((k * 7919) % v.total) * 0.0012}s` } : undefined}
                />
              );
            })}
          </div>
          <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-accent-ink" /> {n(left)} in use
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-ink-3 opacity-30" /> {n(v.removed)} reaped
            </span>
          </figcaption>
        </figure>
      );
    }
    case "bars":
      return (
        <div className="grid gap-5">
          {v.rows.map((r) => {
            const after = (r.after / r.before) * 100;
            const cut = Math.round((1 - r.after / r.before) * 100);
            return (
              <figure key={r.label} role="img" aria-label={`${r.label}: ${n(r.before)} before, ${n(r.after)} after, ${cut}% less`}>
                <figcaption className="flex justify-between gap-3 text-sm">
                  <span className="font-medium">{r.label}</span>
                  <span className="font-mono text-xs text-ink-2">
                    {n(r.before)} → <span className="text-ink">{n(r.after)}</span>, -{cut}%
                  </span>
                </figcaption>
                <div className="mt-2 grid gap-[3px]">
                  <div className="bar-in h-4 rounded-r-[4px] bg-line-strong" />
                  <div
                    className="shrink-to h-4 rounded-r-[4px] bg-accent-ink"
                    style={{ "--from": "100%", "--to": `${after}%`, width: `${after}%` } as React.CSSProperties}
                  />
                </div>
              </figure>
            );
          })}
          <p className="flex gap-4 text-xs text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-line-strong" /> before
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-accent-ink" /> after
            </span>
          </p>
        </div>
      );
    case "removed":
      return (
        <ul className="grid gap-2 sm:grid-cols-2">
          {v.items.map((item, k) => (
            <li key={`${item}-${k}`} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-sm text-ink-2">
              <X size={14} className="shrink-0 text-critical" />
              <span className="strike-in" style={{ "--d": `${0.25 + k * 0.22}s` } as React.CSSProperties}>
                {item}
              </span>
            </li>
          ))}
        </ul>
      );
    case "planned":
      return (
        <ul className="grid gap-2">
          {v.items.map((item) => (
            <li key={item} className="flex items-center gap-2.5 rounded-xl border border-dashed border-line-strong px-3 py-2 text-sm text-ink-2">
              <HourglassMedium size={14} className="shrink-0 text-ink-3" />
              {item}
            </li>
          ))}
        </ul>
      );
  }
}
