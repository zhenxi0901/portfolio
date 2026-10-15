"use client";

import { useEffect, useState } from "react";
import { ArrowCounterClockwise, Play, Siren } from "@phosphor-icons/react";
import { burnRules, slos } from "@/content/slo";
import { cn } from "@/lib/utils";

// The scenario: a four-hour view in 5-minute ticks. The ingress fails 2% of probes for two hours.
const TICKS = 48;
const PRE = 72; // quiet history before the view, so the 6-hour window has data from the start
const INC_FROM = 12;
const INC_TO = 36;
const BASE = 0.0002;
const INCIDENT = 0.02;
const avail = slos.find((s) => s.id === "availability")!;
const BUDGET = 1 - avail.target / 100; // 0.1% of probes may fail
const SPEND_PER_TICK = 5 / (30 * 24 * 60) / BUDGET; // budget fraction one tick at error ratio 1 uses
const START_LEFT = 1 - (1 - avail.sample / 100) / BUDGET;

function jitter(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

type Scenario = { burn1h: number[]; fast: boolean[]; slow: boolean[]; leak: boolean[]; left: number[] };

function build(incident: boolean): Scenario {
  const err = Array.from({ length: PRE + TICKS }, (_, i) => {
    const t = i - PRE;
    const level = incident && t >= INC_FROM && t < INC_TO ? INCIDENT : BASE;
    return level * (1 + 0.4 * jitter(i));
  });
  const burn = (i: number, w: number) => {
    let sum = 0;
    // Before the stored history the month was quiet.
    for (let k = i - w + 1; k <= i; k++) sum += k < 0 ? BASE : err[k];
    return sum / w / BUDGET;
  };
  const out: Scenario = { burn1h: [], fast: [], slow: [], leak: [], left: [] };
  let left = START_LEFT;
  for (let t = 0; t < TICKS; t++) {
    const i = t + PRE;
    left -= err[i] * SPEND_PER_TICK;
    out.burn1h.push(burn(i, 12));
    out.fast.push(burn(i, 12) > 14.4 && burn(i, 1) > 14.4);
    out.slow.push(burn(i, 72) > 6 && burn(i, 6) > 6);
    out.leak.push(burn(i, 864) > 1 && burn(i, 72) > 1); // 3 days and 6 h
    out.left.push(left);
  }
  return out;
}

const QUIET = build(false);
const INCIDENT_RUN = build(true);
const firstTrue = (xs: boolean[]) => xs.findIndex(Boolean);
const clock = (t: number) => (t < INC_FROM ? `T-${(INC_FROM - t) * 5} min` : `T+${Math.floor(((t - INC_FROM) * 5) / 60)}h${String(((t - INC_FROM) * 5) % 60).padStart(2, "0")}`);

const FAST_AT = firstTrue(INCIDENT_RUN.fast);
const SLOW_AT = firstTrue(INCIDENT_RUN.slow);
const SPENT = (INCIDENT_RUN.left[0] - INCIDENT_RUN.left[TICKS - 1]) * 100;

const EVENTS = [
  { at: INC_FROM, text: "The ingress starts failing 2% of probes. Every pod stays Ready." },
  { at: FAST_AT, text: `Fast-burn page. At 20x, this month's budget would be gone in a day and a half.` },
  { at: SLOW_AT, text: "Slow-burn page too: two windows agree this is not a blip." },
  { at: INC_TO, text: "Rolled back. The fast-burn page resolves at once; the slow-burn page follows when its 30-minute window clears." },
  { at: TICKS - 1, text: `Cost: ${SPENT.toFixed(1)}% of the month's budget. Plenty is left, so releases go on, and the incident gets a postmortem.` },
];

/** A sample SLO dashboard for the IoT platform, with a replayable incident. */
export function SloBoard() {
  const [cursor, setCursor] = useState(TICKS); // ticks revealed
  const [played, setPlayed] = useState(false);
  const run = played ? INCIDENT_RUN : QUIET;
  const running = played && cursor < TICKS;

  // One tick every 280 ms until the four hours have played out.
  useEffect(() => {
    if (!running) return;
    const id = setTimeout(() => setCursor((c) => Math.min(c + 1, TICKS)), 280);
    return () => clearTimeout(id);
  }, [running, cursor]);

  const start = () => {
    setPlayed(true);
    setCursor(1);
  };

  const now = Math.max(0, cursor - 1);
  const left = run.left[now];
  const sli = 100 - (1 - left) * BUDGET * 100;
  const event = played ? [...EVENTS].reverse().find((e) => e.at <= now) : undefined;

  const W = 600;
  const H = 180;
  const MAXB = 25;
  const x = (t: number) => (t / (TICKS - 1)) * W;
  const yb = (v: number) => H - (Math.min(v, MAXB) / MAXB) * H;
  const shown = run.burn1h.slice(0, cursor);
  const line = shown.map((v, t) => `${t ? "L" : "M"}${x(t).toFixed(1)},${yb(v).toFixed(1)}`).join(" ");
  const lefts = run.left.slice(0, cursor);
  const lo = Math.min(...INCIDENT_RUN.left) - 0.03;
  const hi = START_LEFT + 0.03;
  const yl = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const leftLine = lefts.map((v, t) => `${t ? "L" : "M"}${x(t).toFixed(1)},${yl(v).toFixed(1)}`).join(" ");

  const state = (xs: boolean[]) => {
    if (xs[now]) return "firing";
    return xs.slice(0, cursor).some(Boolean) ? "resolved" : "ok";
  };
  const rules = [
    { ...burnRules[0], state: state(run.fast) },
    { ...burnRules[1], state: state(run.slow) },
    { ...burnRules[2], state: state(run.leak) },
  ];

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface-2/60">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-5">
        <p className="font-mono text-xs text-ink-2">
          Dashboards <span className="text-ink-3">›</span> IoT platform <span className="text-ink-3">›</span> <span className="text-ink">SLO</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-xs text-ink-2">Sample data, proposed objectives</span>
          <span className="rounded-md border border-line px-2 py-0.5 font-mono text-xs text-ink-2">Last 30 days</span>
          <button
            type="button"
            onClick={start}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-on-accent disabled:opacity-60"
          >
            {played && !running ? <ArrowCounterClockwise size={13} weight="bold" /> : <Play size={13} weight="fill" />}
            {played && !running ? "Replay the incident" : running ? "Incident running" : "Simulate an incident"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {slos.map((s) => {
            const live = s.id === "availability";
            const value = live ? sli : s.sample;
            const budgetLeft = live ? left : 1 - (1 - s.sample / 100) / (1 - s.target / 100);
            const ok = value >= s.target;
            return (
              <article key={s.id} className="rounded-2xl border border-line bg-surface p-4">
                <p className="text-xs font-medium text-ink-2">{s.name}</p>
                <p className={cn("mt-1 text-3xl font-semibold tabular-nums tracking-[-0.03em]", ok ? "text-good" : "text-critical")}>
                  {value.toFixed(live ? 3 : 2)}%
                </p>
                <p className="mt-0.5 text-xs text-ink-3">objective {s.target}% · {s.sli}</p>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-ink-2">
                    <span>error budget left</span>
                    <span className="tabular-nums">{Math.round(budgetLeft * 100)}%</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-surface-2">
                    <div
                      className={cn("h-full rounded-full transition-[width] duration-300", budgetLeft > 0.25 ? "bg-good" : "bg-critical")}
                      style={{ width: `${Math.max(0, budgetLeft) * 100}%` }}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
          <figure className="rounded-2xl border border-line bg-surface p-4">
            <figcaption className="flex flex-wrap justify-between gap-2 text-xs">
              <span className="font-medium text-ink-2">Burn rate, reachable from outside (1 h window)</span>
              <span className="font-mono text-ink-3">{clock(now)}</span>
            </figcaption>
            <div className="relative mt-3">
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-44 w-full" role="img" aria-label="Error budget burn rate over the last four hours">
                {[
                  { v: 14.4, c: "var(--critical)" },
                  { v: 6, c: "#f59e0b" },
                  { v: 1, c: "var(--ink-3)" },
                ].map((g) => (
                  <line key={g.v} x1={0} x2={W} y1={yb(g.v)} y2={yb(g.v)} strokeDasharray="5 5" vectorEffect="non-scaling-stroke" style={{ stroke: g.c, opacity: 0.75 }} />
                ))}
                {played && (
                  <rect x={x(INC_FROM)} y={0} width={x(INC_TO) - x(INC_FROM)} height={H} style={{ fill: "var(--critical)", opacity: 0.05 }} />
                )}
                <path d={line} fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={{ stroke: "var(--accent-ink)", strokeWidth: 2.2 }} />
              </svg>
              {[
                { v: 14.4, t: "14.4x fast burn: page" },
                { v: 6, t: "6x slow burn: page" },
                { v: 1, t: "1x: ticket" },
              ].map((g) => (
                <span
                  key={g.v}
                  className="pointer-events-none absolute right-1 -translate-y-full font-mono text-[10px] text-ink-3"
                  style={{ top: `${(yb(g.v) / H) * 100}%` }}
                >
                  {g.t}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-3">Burn rate is the error ratio divided by the 0.1% the objective allows. 1x spends the budget exactly over 30 days.</p>
          </figure>

          <figure className="rounded-2xl border border-line bg-surface p-4">
            <figcaption className="text-xs font-medium text-ink-2">Error budget left, reachable from outside</figcaption>
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-[-0.03em]">{(left * 100).toFixed(1)}%</p>
            <p className="text-xs text-ink-3">of about 43 minutes this month</p>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-24 w-full" role="img" aria-label="Error budget remaining over the last four hours">
              <path d={leftLine} fill="none" vectorEffect="non-scaling-stroke" style={{ stroke: "var(--good)", strokeWidth: 2.2 }} />
            </svg>
          </figure>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[520px] text-sm">
            <caption className="px-4 pt-3 text-left text-xs font-medium text-ink-2">Alert rules on the error budget</caption>
            <thead>
              <tr className="text-left text-xs text-ink-3">
                <th className="px-4 py-2 font-medium">Rule</th>
                <th className="px-4 py-2 font-medium">Windows</th>
                <th className="px-4 py-2 font-medium">Burn rate</th>
                <th className="px-4 py-2 font-medium">Means</th>
                <th className="px-4 py-2 font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.name} className="border-t border-line">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-2">
                    {r.long} and {r.short}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">&gt; {r.rate}x</td>
                  <td className="px-4 py-2.5 text-xs text-ink-2">
                    {r.spends}: {r.action}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                        r.state === "firing" ? "bg-critical/15 text-critical" : r.state === "resolved" ? "bg-surface-2 text-ink-2" : "bg-good/12 text-good",
                      )}
                    >
                      {r.state === "firing" && <Siren size={12} weight="fill" />}
                      {r.state === "firing" ? "Firing" : r.state === "resolved" ? "Resolved" : "OK"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p aria-live="polite" className="min-h-[2.75rem] px-1 text-[15px] leading-relaxed text-ink">
          {event ? (
            <>
              <span className="mr-2 font-mono text-xs text-ink-3">{clock(event.at)}</span>
              {event.text}
            </>
          ) : (
            <span className="text-ink-3">A quiet month: burn rate well under 1x. Simulate an incident to see the budget and the pages react.</span>
          )}
        </p>
      </div>
    </div>
  );
}
