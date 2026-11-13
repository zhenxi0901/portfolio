"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import { HUBS } from "@/components/hero/hubs";
import { scrollToId } from "@/lib/utils";

// three.js is ~150 KB gzipped and costs a phone seconds of script time, so the scene only loads on
// screens 768 px and wider, once the browser is idle. Phones get the static constellation below.
const ClusterScene = dynamic(() => import("./cluster-scene"), {
  ssr: false,
  loading: () => <ClusterPlaceholder />,
});

function ClusterPlaceholder() {
  return (
    <div className="grid aspect-square w-full place-items-center">
      <div className="dot-grid size-3/4 rounded-full opacity-60 [mask-image:radial-gradient(circle,black,transparent_70%)]" />
    </div>
  );
}

// Two rings around a centre, in percent of the box: eight outside, six inside. The inner ring starts
// at the top so none of its labels shares the horizontal axis with an outer one. Computed rather
// than measured, so it renders on the server.
const OUTER = 8;
const RINGS = { outer: [37, 42], inner: [27, 23] } as const;
function place(i: number) {
  const outer = i < OUTER;
  const step = outer ? 360 / OUTER : 360 / (HUBS.length - OUTER);
  const angle = ((outer ? -90 + i * step : -90 + (i - OUTER) * step) * Math.PI) / 180;
  const [rx, ry] = outer ? RINGS.outer : RINGS.inner;
  return { x: 50 + rx * Math.cos(angle), y: 50 + ry * Math.sin(angle) };
}
const SPOTS = HUBS.map((_, i) => place(i));

function Constellation() {
  return (
    <div className="relative aspect-square w-full sm:aspect-[4/3]">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
        {[RINGS.outer, RINGS.inner].map(([rx, ry]) => (
          <ellipse key={rx} cx="50" cy="50" rx={rx} ry={ry} fill="none" stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        {SPOTS.map((p, i) => (
          <line
            key={HUBS[i].label}
            x1="50"
            y1="50"
            x2={p.x}
            y2={p.y}
            stroke={i % 5 === 1 ? "var(--accent-ink)" : "var(--line-strong)"}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            className={i % 5 === 1 ? "map-flow" : undefined}
          />
        ))}
      </svg>
      <span className="absolute left-1/2 top-1/2 flex size-3 -translate-x-1/2 -translate-y-1/2" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-50 motion-reduce:hidden" />
        <span className="relative inline-flex size-3 rounded-full bg-accent" />
      </span>
      {HUBS.map((hub, i) => (
        <button
          key={hub.label}
          type="button"
          onClick={() => scrollToId(hub.target)}
          style={{ left: `${SPOTS[i].x}%`, top: `${SPOTS[i].y}%` }}
          className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-[11px] text-ink shadow-soft max-[359px]:px-2 max-[359px]:text-[10px] transition-colors hover:border-accent-ink focus-visible:border-accent-ink"
          aria-label={`${hub.label}: jump to related work`}
        >
          {hub.label}
        </button>
      ))}
    </div>
  );
}

let webgl: boolean | undefined;
function hasWebGL() {
  if (webgl === undefined) {
    try {
      const c = document.createElement("canvas");
      webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

const WIDE = "(min-width: 768px)";
function onWideChange(cb: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const noop = () => () => {};

/** True once the browser has had a quiet moment after hydration (or 2.5 s, whichever is first). */
function useIdle() {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const done = () => {
      performance.mark("hero-3d-start");
      setIdle(true);
    };
    // Safari has no requestIdleCallback.
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(done, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(done, 1200);
    return () => clearTimeout(t);
  }, []);
  return idle;
}

export function Cluster() {
  const wide = useSyncExternalStore(onWideChange, () => window.matchMedia(WIDE).matches, () => false);
  // Only probe WebGL where the scene could load; creating a context is not free on a phone.
  const supported = useSyncExternalStore(noop, () => !wide || hasWebGL(), () => true);
  const idle = useIdle();

  if (!supported) return <Constellation />;
  if (wide && idle) return <ClusterScene />;
  // Before the client knows the width, CSS picks: the constellation on phones, the placeholder
  // where the scene is about to load.
  return (
    <>
      <div className="md:hidden">
        <Constellation />
      </div>
      <div className="hidden md:block">
        <ClusterPlaceholder />
      </div>
    </>
  );
}
