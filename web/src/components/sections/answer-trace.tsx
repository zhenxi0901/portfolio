"use client";

import { useState } from "react";
import { CaretRight } from "@phosphor-icons/react";
import type { AskTrace } from "@/lib/api";
import { cn } from "@/lib/utils";

const fmt = (ms: number) => (ms < 0.01 ? "<0.01 ms" : ms < 1 ? `${ms.toFixed(3)} ms` : `${ms.toFixed(2)} ms`);

/** The real OpenTelemetry spans of the request that produced this answer, as a waterfall. */
export function AnswerTrace({ trace }: { trace: AskTrace }) {
  const [open, setOpen] = useState(false);
  const ids = new Set(trace.spans.map((s) => s.id));
  const depth = (id: string): number => {
    const s = trace.spans.find((x) => x.id === id);
    return s?.parent && ids.has(s.parent) ? 1 + depth(s.parent) : 0;
  };
  const total = Math.max(trace.total_ms, ...trace.spans.map((s) => s.start_ms + s.duration_ms), 0.001);

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-2 hover:text-ink"
      >
        <CaretRight size={12} className={cn("transition-transform", open && "rotate-90")} />
        This answer&apos;s trace: {trace.spans.length} spans, {fmt(trace.total_ms)} in the server
      </button>
      {open && (
        <div className="mt-3 rounded-2xl border border-line bg-surface-2/50 p-4">
          <ol className="space-y-1.5" aria-label="Spans, in start order">
            {trace.spans.map((s) => (
              // Phones: name and duration on one line, the bar full width under them.
              <li
                key={s.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 font-mono text-[11px] sm:grid-cols-[minmax(8rem,13rem)_1fr_4.5rem]"
              >
                <span className="order-1 truncate text-ink" style={{ paddingLeft: `${depth(s.id) * 12}px` }} title={s.name}>
                  {s.name}
                </span>
                <span className="relative order-3 col-span-2 h-2.5 rounded-full bg-surface sm:order-2 sm:col-span-1" aria-hidden>
                  <span
                    className="absolute inset-y-0 rounded-full bg-accent-ink"
                    style={{ left: `${(s.start_ms / total) * 100}%`, width: `max(3px, ${(s.duration_ms / total) * 100}%)` }}
                  />
                </span>
                <span className="order-2 text-right text-ink-2 sm:order-3">{fmt(s.duration_ms)}</span>
                {s.attrs && (
                  <span className="order-4 col-span-2 -mt-0.5 truncate text-ink-3 sm:col-span-3" style={{ paddingLeft: `${depth(s.id) * 12}px` }}>
                    {Object.entries(s.attrs)
                      .map(([k, v]) => `${k}=${v}`)
                      .join("  ")}
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
            OpenTelemetry spans from the Go API, measured for your question
            {trace.exported ? ", also exported to Google Cloud Trace" : ""}. Trace {trace.trace_id.slice(0, 16)}. Retrieval used to
            tokenize every fact on every question; the first traces showed that was most of an answer, so the facts are indexed once
            at startup now (1.45 ms to 0.40 ms per uncached answer in a benchmark).
          </p>
        </div>
      )}
    </div>
  );
}
