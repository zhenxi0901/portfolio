"use client";

import { useState } from "react";
import { sampleTrace, type TraceSpan } from "@/content/ai-platform";
import { cn } from "@/lib/utils";

const KIND: Record<TraceSpan["kind"], { label: string; color: string }> = {
  request: { label: "request", color: "var(--line-strong)" },
  agent: { label: "agent", color: "var(--ink-3)" },
  llm: { label: "model call", color: "var(--accent-ink)" },
  tool: { label: "tool", color: "var(--p-iot)" },
  store: { label: "store", color: "var(--ink-3)" },
};

const s = (n: number) => `${n < 1 ? n.toFixed(2) : n.toFixed(1)} s`;
const k = (n: number) => n.toLocaleString("en-US");

/** One operations-agent request as a trace: where the time and the tokens go. */
export function RequestTrace() {
  const spans = sampleTrace.spans;
  const total = spans[0].dur;
  const [sel, setSel] = useState(1);
  const picked = spans[sel];

  const llm = spans.filter((x) => x.kind === "llm");
  const tools = spans.filter((x) => x.kind === "tool");
  const modelTime = llm.reduce((a, x) => a + x.dur, 0);
  const toolTime = tools.reduce((a, x) => a + x.dur, 0);
  const tokensIn = llm.reduce((a, x) => a + (x.tokensIn ?? 0), 0);
  const tokensOut = llm.reduce((a, x) => a + (x.tokensOut ?? 0), 0);

  return (
    <div className="rounded-3xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div>
          <p className="font-mono text-xs text-ink-3">trace · operations agent</p>
          <p className="mt-1 font-semibold">&ldquo;{sampleTrace.question}&rdquo;</p>
        </div>
        <span className="rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-xs text-ink-2">
          Sample: illustrative numbers, real structure
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-4">
        {[
          { l: "Total", v: s(total) },
          { l: `${llm.length} model calls`, v: `${s(modelTime)}, ${Math.round((modelTime / total) * 100)}%` },
          { l: `${tools.length} tool calls`, v: `${s(toolTime)}, ${Math.round((toolTime / total) * 100)}%` },
          { l: "Tokens in / out", v: `${k(tokensIn)} / ${k(tokensOut)}` },
        ].map((x) => (
          <div key={x.l} className="bg-surface px-5 py-3 sm:px-6">
            <dt className="text-xs text-ink-3">{x.l}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{x.v}</dd>
          </div>
        ))}
      </dl>

      <ol className="px-2 py-3 sm:px-4" aria-label="Spans, in order">
        {spans.map((x, i) => (
          <li key={x.name}>
            <button
              type="button"
              onClick={() => setSel(i)}
              aria-pressed={i === sel}
              className={cn(
                "grid w-full grid-cols-[minmax(0,11rem)_1fr] items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors sm:grid-cols-[16rem_1fr]",
                i === sel ? "bg-surface-2" : "hover:bg-surface-2/60",
              )}
            >
              <span className="flex min-w-0 items-center gap-2 text-sm" style={{ paddingLeft: `${x.depth * 0.9}rem` }}>
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: KIND[x.kind].color }} />
                <span className="truncate">{x.name}</span>
              </span>
              <span className="relative h-5">
                <span
                  className="bar-in absolute top-1 h-3 rounded-[3px]"
                  style={{
                    left: `${(x.start / total) * 100}%`,
                    width: `max(3px, ${(x.dur / total) * 100}%)`,
                    background: KIND[x.kind].color,
                    animationDelay: `${0.1 + x.start * 0.12}s`,
                  }}
                />
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div aria-live="polite" className="border-t border-line px-5 py-4 sm:px-6">
        <div key={sel} className="step-in">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold">{picked.name}</span>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-ink-2">{KIND[picked.kind].label}</span>
            <span className="font-mono text-xs text-ink-2">{s(picked.dur)}</span>
            {picked.tokensIn !== undefined && (
              <span className="font-mono text-xs text-ink-2">
                {k(picked.tokensIn)} tokens in, {k(picked.tokensOut ?? 0)} out
              </span>
            )}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{picked.note}</p>
        </div>
      </div>

      <div className="border-t border-line bg-surface-2/50 px-5 py-4 text-sm leading-relaxed text-ink-2 sm:rounded-b-3xl sm:px-6">
        <span className="font-semibold text-ink">How I read a trace like this:</span> model calls hold most of the time and the tools
        are quick, so a faster or smaller model moves latency more than tool tuning would. Input tokens grow with every hop because
        each agent re-sends the conversation, which is what a prefix cache saves: in my research, 96% of agent input tokens came
        from it.
      </div>
    </div>
  );
}
