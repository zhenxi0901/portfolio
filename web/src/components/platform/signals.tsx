"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, Lightning, Siren, Wrench } from "@phosphor-icons/react";
import { monitoringFacts, signals, type SignalSim } from "@/content/profile";
import { cn } from "@/lib/utils";

const POINTS = 48;
const TICK_MS = 450;
const W = 600;
const H = 190;
const PAD = 10;

/** Deterministic jitter in [-0.5, 0.5): the same tick always wiggles the same way. */
function jitter(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

const sample = (level: number, noise: number, t: number) => Math.max(0, level * (1 + 2 * noise * jitter(t)));

type Run = { level: number; ctx: number; values: number[]; ctxValues: number[]; pending: number; brokenFor: number; t: number };

function fresh(sim: SignalSim): Run {
  return {
    level: sim.normal,
    ctx: sim.context?.normal ?? 0,
    values: Array.from({ length: POINTS }, (_, k) => sample(sim.normal, sim.noise, k)),
    ctxValues: sim.context ? Array.from({ length: POINTS }, (_, k) => sample(sim.context!.normal, 0.04, k + 997)) : [],
    pending: 0,
    brokenFor: 0,
    t: POINTS,
  };
}

/** One simulated minute: drift towards normal or broken, add noise, and run the alert's "for" clock. */
function tick(sim: SignalSim, r: Run, broken: boolean): Run {
  const ease = (from: number, to: number, span: number) => {
    const next = from + (to - from) * 0.35;
    return Math.abs(to - next) < span * 0.004 ? to : next;
  };
  const level = ease(r.level, broken ? sim.broken : sim.normal, sim.max);
  const v = sample(level, sim.noise, r.t);
  const breached = sim.above ? v > sim.threshold : v < sim.threshold;
  const ctx = sim.context ? ease(r.ctx, broken ? sim.context.broken : sim.context.normal, sim.context.max) : 0;
  return {
    level,
    ctx,
    values: [...r.values.slice(1), v],
    ctxValues: sim.context ? [...r.ctxValues.slice(1), sample(ctx, 0.04, r.t + 997)] : [],
    pending: breached ? r.pending + 1 : 0,
    brokenFor: broken ? r.brokenFor + 1 : 0,
    t: r.t + 1,
  };
}

/**
 * "What I monitor", as a playground: pick a failure, break it, and watch the signal and its alert
 * react. The rules and the reasoning are the real ones; the levels and timings are a toy model.
 */
export function Signals() {
  const [idx, setIdx] = useState(0);
  const [broken, setBroken] = useState(false);
  const [run, setRun] = useState<Run>(() => fresh(signals[0].sim));
  const [live, setLive] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const signal = signals[idx];
  const sim = signal.sim;

  // Only tick while the panel is on screen and the tab is visible.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let inView = false;
    const update = () => setLive(inView && document.visibilityState === "visible");
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      update();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", update);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setRun((r) => tick(sim, r, broken)), TICK_MS);
    return () => clearInterval(id);
  }, [live, sim, broken]);

  const choose = (k: number) => {
    setIdx(k);
    setBroken(false);
    setRun(fresh(signals[k].sim));
  };

  const firing = run.pending >= sim.forTicks;
  const pendingNow = run.pending > 0 && !firing;
  const settled = broken && (firing || run.brokenFor >= sim.forTicks + 8);

  const y = (v: number, max: number) => H - PAD - (Math.min(v, max * 1.04) / max) * (H - PAD * 2);
  const x = (k: number) => (k / (POINTS - 1)) * W;
  const path = (vals: number[], max: number) => vals.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v, max).toFixed(1)}`).join(" ");
  const ty = y(sim.threshold, sim.max);

  return (
    <div ref={ref}>
      <ul className="mb-6 grid gap-3 sm:grid-cols-3">
        {monitoringFacts.map((f) => (
          <li key={f} className="rounded-2xl bg-surface-2 px-4 py-3 text-sm leading-snug text-ink-2">
            {f}
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="mb-3 text-sm text-ink-3">Pick a way the platform fails:</p>
          <div role="tablist" aria-label="Failure modes" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {signals.map((s, k) => (
              <button
                key={s.question}
                role="tab"
                aria-selected={k === idx}
                onClick={() => choose(k)}
                className={cn(
                  "shrink-0 rounded-2xl border px-4 py-2.5 text-left text-sm font-medium transition-colors",
                  k === idx ? "border-accent-ink bg-surface text-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
                )}
              >
                {s.question}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-lg font-semibold">{signal.question}</h4>
              <p className="mt-0.5 text-sm text-ink-2">{sim.metric}</p>
            </div>
            <span
              role="status"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
                firing ? "bg-critical/15 text-critical" : pendingNow ? "bg-amber-500/15 text-ink" : "bg-good/12 text-good",
              )}
            >
              {firing ? (
                <>
                  <Siren size={15} weight="fill" /> Firing: page sent
                </>
              ) : pendingNow ? (
                <>
                  <span className="size-2 animate-pulse rounded-full bg-amber-500" /> Pending {run.pending} of {sim.forTicks} min
                </>
              ) : (
                <>
                  <CheckCircle size={15} weight="fill" /> OK
                </>
              )}
            </span>
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-5 h-48 w-full" role="img" aria-label={`${sim.metric}, live simulation`}>
            <rect x={0} y={sim.above ? 0 : ty} width={W} height={sim.above ? Math.max(ty, 0) : H - ty} style={{ fill: "var(--critical)", opacity: 0.06 }} />
            <line x1={0} x2={W} y1={ty} y2={ty} strokeDasharray="5 5" vectorEffect="non-scaling-stroke" style={{ stroke: "var(--critical)", opacity: 0.7 }} />
            {sim.context && (
              <path
                d={path(run.ctxValues, sim.context.max)}
                fill="none"
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
                style={{ stroke: "var(--ink-3)", strokeWidth: 1.5 }}
              />
            )}
            <path
              d={path(run.values, sim.max)}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              style={{ stroke: firing ? "var(--critical)" : "var(--accent-ink)", strokeWidth: 2.2, transition: "stroke 0.3s" }}
            />
          </svg>

          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
            <li className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-accent-ink" /> {sim.metric}
            </li>
            {sim.context && (
              <li className="flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-ink-3" /> {sim.context.metric}
              </li>
            )}
            <li className="flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-critical/70" /> alert: {sim.thresholdLabel}
            </li>
          </ul>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {broken ? (
              <button
                type="button"
                onClick={() => setBroken(false)}
                className="inline-flex items-center gap-2 rounded-full border border-line-strong px-4 py-2 text-sm font-medium transition-colors hover:border-ink-3"
              >
                <Wrench size={15} /> Fix it
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setBroken(true)}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-transform active:scale-[0.97]"
              >
                <Lightning size={15} weight="fill" /> {sim.action}
              </button>
            )}
            <span className="text-xs text-ink-3">Simulated: each tick is a minute. The rules below are the real ones.</span>
          </div>

          <p aria-live="polite" className={cn("mt-4 min-h-[3rem] text-[15px] leading-relaxed", settled ? "text-ink" : "text-ink-3")}>
            {settled ? sim.outcome : broken ? "Watching the signal..." : "Break it to see what the alert does."}
          </p>

          <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">The rule</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {signal.metrics.map((m) => (
                  <li key={m}>
                    <code className="block rounded-lg border border-line bg-surface-2/70 px-2 py-1 font-mono text-[12px] leading-snug text-ink">{m}</code>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">Why this signal</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{signal.why}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
