"use client";

import { useEffect, useRef, useState } from "react";
import type { Attempt, Outcome, RequestResult } from "@/lib/resilience";

const LANE = 16;
const GUTTER = 34;

/** How each outcome is drawn, and what the legend calls it. */
export const looks: Record<Outcome, { label: string; className: string }> = {
  ok: { label: "answered", className: "fill-good" },
  slow: { label: "answered slowly", className: "fill-p-ai" },
  error: { label: "error (503 or failed)", className: "fill-critical" },
  timeout: { label: "timed out (1 s)", className: "fill-none stroke-critical" },
  busy: { label: "lab busy (429)", className: "fill-p-aries" },
  cancelled: { label: "lost the race, hung up on", className: "fill-ink-3 opacity-40" },
  rejected: { label: "not sent: breaker open", className: "stroke-ink-2" },
};

function bar(a: Attempt, x: (t: number) => number, y: number, key: string) {
  const look = looks[a.outcome];
  if (a.outcome === "rejected") {
    const cx = x(a.start);
    return (
      <g key={key} className={look.className} strokeWidth={2}>
        <line x1={cx - 4} y1={y + 2} x2={cx + 4} y2={y + 10} />
        <line x1={cx - 4} y1={y + 10} x2={cx + 4} y2={y + 2} />
      </g>
    );
  }
  const x1 = x(a.start);
  const w = Math.max(3, x(a.end) - x1);
  return (
    <rect
      key={key}
      x={x1}
      y={y + 2}
      width={w}
      height={LANE - 6}
      rx={2}
      className={look.className}
      strokeWidth={a.outcome === "timeout" ? 1.5 : 0}
      strokeDasharray={a.outcome === "timeout" ? "4 3" : undefined}
    />
  );
}

/** Every attempt of every request on one time axis: a lane per request, retries and hedges in it. */
export function Timeline({ results, lanes, label }: { results: RequestResult[]; lanes: number; label: string }) {
  // Drawn at the width it is shown at, so the labels are real 10 and 11 px text on a phone too.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setWidth(Math.max(280, Math.round(el.clientWidth)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // The axis fits the run (at least 300 ms), so a fast run is not a row of slivers on the left.
  const end = Math.max(300, ...results.map((r) => r.end)) * 1.04;
  const span = width - GUTTER - 8;
  const x = (t: number) => GUTTER + (t / end) * span;
  // A tick every 100 ms to 5 s, whichever leaves room for its label (about 56 px).
  const step = [100, 250, 500, 1000, 2000, 5000].find((s) => (s / end) * span >= 56) ?? 10_000;
  const ticks = Array.from({ length: Math.floor(end / step) + 1 }, (_, i) => i * step);
  // Seconds from 1 s up (1.25 s, not 1250 ms), milliseconds below.
  const tick = (t: number) => (t >= 1000 ? `${t / 1000} s` : `${t} ms`);
  const height = lanes * LANE + 22;
  return (
    <div ref={box}>
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={0} y2={lanes * LANE} className="stroke-line" strokeWidth={1} />
          <text x={x(t)} y={height - 6} textAnchor="middle" className="fill-ink-3 font-mono text-[11px]">
            {tick(t)}
          </text>
        </g>
      ))}
      {Array.from({ length: lanes }, (_, i) => {
        const r = results.find((q) => q.id === i);
        const y = i * LANE;
        const sorted = r ? [...r.attempts].sort((a, b) => a.start - b.start) : [];
        return (
          <g key={i}>
            <text x={GUTTER - 8} y={y + 11} textAnchor="end" className="fill-ink-3 font-mono text-[10px]">
              {i + 1}
            </text>
            {sorted.map((a, k) => {
              const prev = sorted[k - 1];
              // The wait between two attempts: the backoff, drawn as a thin dashed line.
              const gap =
                prev && a.start - prev.end > 4 && a.outcome !== "cancelled" ? (
                  <line
                    key={`w${k}`}
                    x1={x(prev.end)}
                    x2={x(a.start)}
                    y1={y + LANE / 2 - 1}
                    y2={y + LANE / 2 - 1}
                    className="stroke-ink-3"
                    strokeWidth={1}
                    strokeDasharray="2 3"
                  />
                ) : null;
              return [gap, bar(a, x, y, `a${k}`)];
            })}
          </g>
        );
      })}
    </svg>
    </div>
  );
}
