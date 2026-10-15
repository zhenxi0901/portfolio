"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, ArrowCounterClockwise, Pause, Play } from "@phosphor-icons/react";
import { journeys, mapNodes, type MapNode, type NodeId, type Step } from "@/content/ai-platform";
import { products } from "@/content/products";
import { ProductTag, productTone } from "@/components/site/product-tag";
import { cn } from "@/lib/utils";

const H = 44;
const STEP_MS = 2600;
const byId = Object.fromEntries(mapNodes.map((n) => [n.id, n])) as Record<NodeId, MapNode>;
const width = (n: MapNode) => n.w ?? 160;

/** Where the straight line from a's centre towards b leaves a's box. */
function exit(a: MapNode, b: MapNode) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.min(dx ? width(a) / 2 / Math.abs(dx) : Infinity, dy ? H / 2 / Math.abs(dy) : Infinity);
  return { x: a.x + dx * t, y: a.y + dy * t };
}

function segment([from, to]: [NodeId, NodeId]) {
  const p = exit(byId[from], byId[to]);
  const q = exit(byId[to], byId[from]);
  return { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
}

/** The hop a step travels, if any: from its explicit source, else from the previous step's node. */
function hopOf(steps: Step[], i: number): [NodeId, NodeId] | null {
  const s = steps[i];
  if (s.from === null) return null;
  const from = s.from ?? steps[i - 1]?.node;
  return from && from !== s.node ? [from, s.node] : null;
}

const edgeKey = ([a, b]: [NodeId, NodeId]) => [a, b].sort().join("|");

/** Every hop any journey uses, drawn faintly so the whole system is visible before you pick one. */
const allEdges = (() => {
  const seen = new Map<string, [NodeId, NodeId]>();
  for (const j of journeys) j.steps.forEach((_, i) => { const h = hopOf(j.steps, i); if (h) seen.set(edgeKey(h), h); });
  return [...seen.values()];
})();

const CAPTIONS = [
  { x: 190, y: 212, text: "Entry", anchor: "middle" },
  { x: 480, y: 112, text: "Services", anchor: "middle" },
  { x: 795, y: 24, text: "Models and data", anchor: "middle" },
  { x: 16, y: 556, text: "Delivery and network", anchor: "start" },
] as const;

/**
 * The AI products as a map: pick a journey and a packet walks it hop by hop, with what happens at each one.
 * "What I own" dims everything that is the platform rather than my work.
 */
export function SystemMap() {
  const reduce = useReducedMotion();
  const [jid, setJid] = useState(journeys[0].id);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [lens, setLens] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const journey = journeys.find((j) => j.id === jid)!;
  const steps = journey.steps;
  const last = steps.length - 1;
  const step = steps[i];

  // Start the first journey the first time the map is properly on screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || reduce) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          setPlaying(true);
          io.disconnect();
        }
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      setI((n) => Math.min(n + 1, last));
      if (i + 1 >= last) setPlaying(false);
    }, STEP_MS);
    return () => clearTimeout(t);
  }, [playing, i, last]);

  // On a phone the map is wider than the screen: keep the step being described in view.
  useEffect(() => {
    const el = panRef.current;
    if (!el || el.scrollWidth <= el.clientWidth + 4) return;
    const x = (byId[steps[i].node].x / 1000) * el.scrollWidth;
    el.scrollTo({ left: x - el.clientWidth / 2, behavior: reduce ? "auto" : "smooth" });
  }, [steps, i, reduce]);

  const choose = (id: string) => {
    started.current = true;
    setJid(id);
    setI(0);
    setPlaying(!reduce);
  };
  const go = (n: number) => {
    setPlaying(false);
    setI(Math.max(0, Math.min(last, n)));
  };

  const hop = hopOf(steps, i);
  const active = new Set<NodeId>([step.node, ...(step.also ?? [])]);
  const visited = new Set<NodeId>(steps.slice(0, i).flatMap((s) => [s.node, ...(s.also ?? [])]));
  const walked = new Set(steps.slice(0, i).map((_, k) => hopOf(steps, k)).filter((h) => h !== null).map(edgeKey));
  const owned = step.mine ?? (journey.mine ? "This part is my work." : undefined);

  return (
    <div ref={rootRef} className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* min-w-0: without it the scrolling tab row sets the column's width and widens the page on phones. */}
      <div className="flex min-w-0 flex-col gap-4">
        <div role="tablist" aria-label="Journeys through the AI products" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {journeys.map((j) => (
            <button
              key={j.id}
              role="tab"
              aria-selected={jid === j.id}
              onClick={() => choose(j.id)}
              className={cn(
                "flex shrink-0 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-colors",
                jid === j.id ? "border-accent-ink bg-surface text-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
              )}
            >
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className={cn("size-2.5 shrink-0 rounded-full", j.product ? productTone[j.product].bg : "bg-ink-3/50")}
                />
                {j.name}
              </span>
              {j.mine && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-on-accent">mine</span>}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={lens}
          onClick={() => setLens((v) => !v)}
          className="inline-flex w-fit items-center gap-2.5 rounded-full border border-line px-3.5 py-2 text-sm text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
        >
          <span className={cn("relative h-5 w-9 rounded-full transition-colors", lens ? "bg-accent" : "bg-surface-2 ring-1 ring-line-strong")}>
            <span className={cn("absolute top-0.5 size-4 rounded-full bg-ink transition-[left]", lens ? "left-[18px]" : "left-0.5")} />
          </span>
          Highlight what I own
        </button>
      </div>

      <div className="min-w-0 overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pt-5 sm:px-7 sm:pt-6">
          {journey.product ? (
            <ProductTag p={journey.product} />
          ) : (
            <span className="rounded-full border border-line-strong px-2.5 py-0.5 text-xs font-medium text-ink-2">Shared infrastructure</span>
          )}
          <p className="text-[15px] leading-relaxed text-ink">{journey.about}</p>
        </div>

        <div ref={panRef} className="overflow-x-auto px-2 pb-2 pt-3 sm:px-4">
          <svg
            viewBox="0 0 1000 640"
            className="block w-full min-w-[720px] font-sans"
            role="img"
            aria-label={`Map of the AI products. ${journey.name}, step ${i + 1} of ${steps.length}: ${step.title}.`}
          >
            {CAPTIONS.map((c) => (
              <text key={c.text} x={c.x} y={c.y} textAnchor={c.anchor} style={{ fill: "var(--ink-3)", fontSize: 11, letterSpacing: "0.14em" }}>
                {c.text.toUpperCase()}
              </text>
            ))}

            {allEdges.map((e) => {
              const s = segment(e);
              const done = walked.has(edgeKey(e));
              return (
                <line
                  key={edgeKey(e)}
                  {...s}
                  style={{
                    stroke: done ? "var(--accent-ink)" : "var(--line-strong)",
                    strokeWidth: done ? 1.6 : 1,
                    opacity: done ? 0.55 : lens ? 0.25 : 0.7,
                    transition: "stroke 0.4s, opacity 0.4s",
                  }}
                />
              );
            })}

            {hop && (
              <g key={`${jid}-${i}`}>
                <line {...segment(hop)} className="map-flow" style={{ stroke: "var(--accent-ink)", strokeWidth: 2.2 }} />
                {!reduce && (
                  <motion.circle
                    r={5}
                    style={{ fill: "var(--accent-ink)" }}
                    initial={{ cx: segment(hop).x1, cy: segment(hop).y1 }}
                    animate={{ cx: [segment(hop).x1, segment(hop).x2], cy: [segment(hop).y1, segment(hop).y2] }}
                    transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 0.5, ease: "easeInOut" }}
                  />
                )}
              </g>
            )}

            {mapNodes.map((n) => {
              const on = active.has(n.id);
              const seen = visited.has(n.id);
              const w = width(n);
              const stroke = on ? "var(--accent-ink)" : lens && n.mine ? "var(--accent-ink)" : seen ? "var(--ink-3)" : "var(--line-strong)";
              return (
                <g key={n.id} style={{ opacity: lens && !n.mine ? 0.28 : 1, transition: "opacity 0.35s" }}>
                  {on && !reduce && (
                    <motion.rect
                      x={n.x - w / 2}
                      y={n.y - H / 2}
                      width={w}
                      height={H}
                      rx={12}
                      style={{ fill: "none", stroke: "var(--accent-ink)", strokeWidth: 2, transformOrigin: `${n.x}px ${n.y}px` }}
                      initial={{ scale: 1, opacity: 0.6 }}
                      animate={{ scale: 1.12, opacity: 0 }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                    />
                  )}
                  <rect
                    x={n.x - w / 2}
                    y={n.y - H / 2}
                    width={w}
                    height={H}
                    rx={12}
                    style={{
                      fill: on ? "color-mix(in oklab, var(--accent) 24%, var(--surface))" : "var(--surface)",
                      stroke,
                      strokeWidth: on ? 2 : 1,
                      strokeDasharray: lens && n.mine && !on ? "4 3" : undefined,
                      transition: "fill 0.35s, stroke 0.35s",
                    }}
                  />
                  {n.product && (
                    <rect
                      x={n.x - w / 2 + 6}
                      y={n.y - H / 2 + 9}
                      width={4}
                      height={H - 18}
                      rx={2}
                      style={{ fill: `var(--p-${n.product})` }}
                    />
                  )}
                  <text x={n.x} y={n.y - 3} textAnchor="middle" style={{ fill: "var(--ink)", fontSize: 13.5, fontWeight: 600 }}>
                    {n.label}
                  </text>
                  <text x={n.x} y={n.y + 13} textAnchor="middle" style={{ fill: "var(--ink-3)", fontSize: 10.5 }}>
                    {n.sub}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 px-5 pb-4 text-xs text-ink-2 sm:px-7" aria-label="Colour key">
          {(["ai", "iot"] as const).map((p) => (
            <li key={p} className="flex items-center gap-1.5">
              <span aria-hidden className={cn("h-3 w-1 rounded-full", productTone[p].bg)} />
              {products[p].name}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-1 rounded-full border border-line-strong" />
            no stripe: shared infrastructure
          </li>
        </ul>

        <div className="border-t border-line px-5 py-5 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-xs text-ink-3">
              Step {i + 1} of {steps.length}
            </p>
            <div className="flex items-center gap-1">
              <IconButton label="Previous step" onClick={() => go(i - 1)} disabled={i === 0}>
                <ArrowLeft size={16} />
              </IconButton>
              {i === last && !playing ? (
                <IconButton label="Replay" onClick={() => { setI(0); setPlaying(!reduce); }}>
                  <ArrowCounterClockwise size={16} />
                </IconButton>
              ) : (
                <IconButton label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)}>
                  {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
                </IconButton>
              )}
              <IconButton label="Next step" onClick={() => go(i + 1)} disabled={i === last}>
                <ArrowRight size={16} />
              </IconButton>
            </div>
          </div>

          {/* A CSS fade on a fresh key: the text swaps at once even when the browser pauses animations. */}
          <div aria-live="polite" className="min-h-[7.5rem]">
            <div key={`${jid}-${i}`} className="step-in">
              <h4 className="mt-2 text-lg font-semibold">{step.title}</h4>
              <p className="mt-1.5 max-w-[70ch] text-[15px] leading-relaxed text-ink-2">{step.text}</p>
              {owned && (
                <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-accent-ink/40 px-3 py-1 text-sm text-ink">
                  <span aria-hidden className="size-1.5 rounded-full bg-accent-ink" />
                  {owned}
                </p>
              )}
            </div>
          </div>

          <ol className="mt-4 flex flex-wrap gap-1.5" aria-label="Steps">
            {steps.map((s, k) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => go(k)}
                  aria-current={k === i ? "step" : undefined}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    k === i ? "border-accent-ink bg-accent text-on-accent" : k < i ? "border-line-strong text-ink" : "border-line text-ink-3 hover:text-ink",
                  )}
                >
                  {k + 1}. {s.title}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-9 place-items-center rounded-full border border-line text-ink transition-colors hover:border-line-strong disabled:opacity-35"
    >
      {children}
    </button>
  );
}
