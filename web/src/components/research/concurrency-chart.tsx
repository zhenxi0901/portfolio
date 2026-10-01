"use client";

import { useState } from "react";
import { fyp } from "@/content/profile";
import { Segmented } from "@/components/work/segmented";

type Metric = "attempts" | "successes";

const W = 560;
const H = 300;
const M = { top: 20, right: 28, bottom: 42, left: 44 };
const IW = W - M.left - M.right;
const IH = H - M.top - M.bottom;
const Y_MAX = 60;
const LEVELS = [1, 2, 4];

// Levels are spaced by their value so the linear reference is a straight line.
const x = (level: number) => M.left + ((level - 1) / 3) * IW;
const y = (v: number) => M.top + IH - (v / Y_MAX) * IH;

export function ConcurrencyChart() {
  const [metric, setMetric] = useState<Metric>("attempts");
  const [hover, setHover] = useState<number | null>(null);
  const rows = fyp.concurrency;
  const base = rows[0][metric];
  const pts = rows.map((r) => ({ ...r, v: r[metric] }));
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p.level)},${y(p.v)}`).join(" ");
  const ideal = LEVELS.map((l, i) => `${i ? "L" : "M"}${x(l)},${y(base * l)}`).join(" ");

  return (
    <figure className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <figcaption>
          <p className="font-semibold">Runs per hour on one 8-vCPU VM</p>
          <p className="mt-0.5 text-sm text-ink-2">Mean of three blocks, bars show the range</p>
        </figcaption>
        <Segmented
          label="Metric"
          value={metric}
          onChange={setMetric}
          options={[
            { value: "attempts", label: "Attempts" },
            { value: "successes", label: "Passed" },
          ]}
        />
      </div>

      <div className="mt-3 flex items-center gap-5 text-xs text-ink-2">
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-5 rounded bg-accent-ink" /> measured
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-px w-5 bg-ink-3" /> if it scaled perfectly
        </span>
      </div>

      <div className="relative mt-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Runs per hour at 1, 2 and 4 concurrent tasks">
          {[0, 20, 40, 60].map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={M.left - 10} y={y(t) + 4} textAnchor="end" className="fill-ink-3 font-mono text-[11px] tabular-nums">
                {t}
              </text>
            </g>
          ))}
          {LEVELS.map((l) => (
            <text key={l} x={x(l)} y={H - 16} textAnchor="middle" className="fill-ink-3 font-mono text-[11px]">
              {l} at once
            </text>
          ))}

          <path d={ideal} fill="none" stroke="var(--ink-3)" strokeWidth={1} opacity={0.8} />
          <text x={x(4) - 6} y={y(base * 4) - 8} textAnchor="end" className="fill-ink-3 text-[11px]">
            linear
          </text>

          {metric === "attempts" &&
            pts.map((p) => (
              <line
                key={`r${p.level}`}
                x1={x(p.level)}
                x2={x(p.level)}
                y1={y(p.lo)}
                y2={y(p.hi)}
                stroke="var(--accent-ink)"
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.45}
              />
            ))}

          <path
            key={metric}
            d={path}
            pathLength={1}
            className="draw"
            fill="none"
            stroke="var(--accent-ink)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {pts.map((p, i) => (
            <g key={p.level}>
              <circle cx={x(p.level)} cy={y(p.v)} r={hover === i ? 6 : 4.5} fill="var(--accent-ink)" stroke="var(--surface)" strokeWidth={2} />
              <text x={x(p.level) + (i === 2 ? -12 : 10)} y={y(p.v) - 12} textAnchor={i === 2 ? "end" : "start"} className="fill-ink text-[12px] font-semibold">
                {(metric === "attempts" ? p.speedup : p.passSpeedup).toFixed(2)}x
              </text>
              {/* Hit target larger than the mark. */}
              <rect
                x={x(p.level) - 36}
                y={M.top}
                width={72}
                height={IH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${p.level} at once: ${p.v} runs per hour`}
              />
            </g>
          ))}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute z-10 w-52 -translate-x-1/2 rounded-2xl border border-line bg-surface p-3 text-xs shadow-soft"
            style={{ left: `${(x(pts[hover].level) / W) * 100}%`, top: `${(y(pts[hover].v) / H) * 100 + 6}%` }}
          >
            <p className="font-semibold text-ink">{pts[hover].level} task{pts[hover].level > 1 ? "s" : ""} at once</p>
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-ink-2">
              <dt>Attempts / hour</dt>
              <dd className="text-right font-mono text-ink tabular-nums">{pts[hover].attempts}</dd>
              <dt>Passed / hour</dt>
              <dd className="text-right font-mono text-ink tabular-nums">{pts[hover].successes}</dd>
              <dt>Host CPU, mean</dt>
              <dd className="text-right font-mono text-ink tabular-nums">{pts[hover].cpu}%</dd>
              <dt>Memory peak</dt>
              <dd className="text-right font-mono text-ink tabular-nums">{pts[hover].memGiB} GiB</dd>
            </dl>
          </div>
        )}
      </div>

      <details className="mt-3 text-sm text-ink-2">
        <summary className="cursor-pointer text-ink-3 hover:text-ink">View as table</summary>
        <table className="mt-3 w-full text-left font-mono text-xs tabular-nums">
          <thead className="text-ink-3">
            <tr>
              <th className="py-1 font-normal">At once</th>
              <th className="py-1 font-normal">Attempts / h (range)</th>
              <th className="py-1 font-normal">Passed / h</th>
              <th className="py-1 font-normal">CPU</th>
              <th className="py-1 font-normal">Memory</th>
            </tr>
          </thead>
          <tbody className="text-ink">
            {rows.map((r) => (
              <tr key={r.level} className="border-t border-line">
                <td className="py-1.5">{r.level}</td>
                <td className="py-1.5">
                  {r.attempts} ({r.lo}-{r.hi})
                </td>
                <td className="py-1.5">{r.successes}</td>
                <td className="py-1.5">{r.cpu}%</td>
                <td className="py-1.5">{r.memGiB} GiB</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
