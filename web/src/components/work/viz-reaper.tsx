"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, ArrowRight, Broom } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { openPlatformTab } from "@/lib/utils";

// Measured: 914 of 1,066 topics named pods that no longer existed.
const TOTAL = 1066;
const ORPHANED = 914;

function seededOrder(n: number, seed = 42) {
  const idx = Array.from({ length: n }, (_, i) => i);
  let s = seed;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = s % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

const order = seededOrder(TOTAL);
const orphanSet = new Set(order.slice(0, ORPHANED));

/** Canvas of every topic in the cluster; the reaper removes the orphans in a sweep. */
export function ReaperViz() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const progress = useRef(0); // 0..1 share of orphans removed
  const raf = useRef<number | null>(null);
  const [removed, setRemoved] = useState(0);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");

  const draw = useCallback(() => {
    const c = canvas.current;
    const w = wrap.current;
    if (!c || !w) return;
    const css = getComputedStyle(document.documentElement);
    const active = css.getPropertyValue("--accent-ink").trim();
    const orphan = css.getPropertyValue("--line-strong").trim();
    const width = w.clientWidth;
    const cell = width < 480 ? 5 : 7;
    const gap = 2;
    const cols = Math.max(10, Math.floor((width + gap) / (cell + gap)));
    const rows = Math.ceil(TOTAL / cols);
    const height = rows * (cell + gap) - gap;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = width * dpr;
    c.height = height * dpr;
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const gone = Math.floor(progress.current * ORPHANED);
    const removedSet = new Set(order.slice(0, gone));
    for (let i = 0; i < TOTAL; i++) {
      if (removedSet.has(i)) continue;
      ctx.fillStyle = orphanSet.has(i) ? orphan : active;
      const x = (i % cols) * (cell + gap);
      const y = Math.floor(i / cols) * (cell + gap);
      ctx.beginPath();
      ctx.roundRect(x, y, cell, cell, 2);
      ctx.fill();
    }
  }, []);

  useEffect(() => {
    draw();
    const ro = new ResizeObserver(draw);
    if (wrap.current) ro.observe(wrap.current);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [draw]);

  const reap = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPhase("running");
    const t0 = performance.now();
    const dur = reduce ? 1 : 1800;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      progress.current = 1 - Math.pow(1 - p, 3);
      draw();
      setRemoved(Math.round(progress.current * ORPHANED));
      if (p < 1) raf.current = requestAnimationFrame(step);
      else setPhase("done");
    };
    raf.current = requestAnimationFrame(step);
  };

  const reset = () => {
    progress.current = 0;
    setRemoved(0);
    setPhase("idle");
    draw();
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-4 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-accent-ink" /> in use
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-line-strong" /> orphaned
        </span>
        <span className="ml-auto font-mono tabular-nums text-ink">
          {removed.toLocaleString("en-US")} / {ORPHANED} reaped
        </span>
      </div>
      <div ref={wrap} className="w-full" role="img" aria-label={`About ${TOTAL.toLocaleString("en-US")} Kafka topics, ${ORPHANED} of them orphaned`}>
        <canvas ref={canvas} className="block" />
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-3">
        {phase === "done" ? (
          <>
            <Button size="sm" variant="secondary" onClick={reset}>
              <ArrowCounterClockwise /> Reset
            </Button>
            <p className="text-sm font-medium">Kafka metrics: 10,386 to 2,891 samples per scrape.</p>
          </>
        ) : (
          <Button size="sm" onClick={reap} disabled={phase === "running"}>
            <Broom weight="fill" /> Run the reaper
          </Button>
        )}
      </div>
      <button
        type="button"
        onClick={() => openPlatformTab("cost")}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium underline decoration-accent-ink decoration-2 underline-offset-4"
      >
        The reaper was one of six levers. See the full cost review <ArrowRight size={14} />
      </button>
    </div>
  );
}
