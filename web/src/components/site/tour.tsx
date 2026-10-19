"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, X } from "@phosphor-icons/react";
import { goTo, openPlatformTab, scrollToId } from "@/lib/utils";

type Stop = { id: string; title: string; text: string; open?: () => void };

const STOPS: Stop[] = [
  {
    id: "work",
    title: "Production work you can play with",
    text: "Five things I shipped at Primustech, each a small working model of the real system. Every card opens a full case study.",
  },
  {
    id: "platform",
    title: "SLOs and error budgets",
    text: "The IoT platform's objectives on a Grafana-style board, with a replayable incident and the alerts behind it.",
    open: () => openPlatformTab("signals"),
  },
  {
    id: "ai",
    title: "The AI agent platform",
    text: "Follow a request through agents, RAG and models on Cloud Run, and switch on the lens to see which parts are mine.",
  },
  {
    id: "research",
    title: "What an AI agent costs to run",
    text: "My final-year project: 320 long agent runs measured on a hosted API and on an A100.",
  },
  {
    id: "status",
    title: "This page is a production service",
    text: "Live latency, the site's own SLO measured by uptime checks, and its DORA metrics from its own deploys.",
  },
  {
    id: "postmortems",
    title: "When things broke",
    text: "Blameless postmortems from running this site: timelines, root causes and action items linked to commits.",
  },
  {
    id: "contact",
    title: "Hiring for reliability?",
    text: "Leave a message here; it reaches me directly. I graduate in June 2027.",
  },
];

const STEP_MS = 8500;
const TICK_MS = 100;

/** Opens the tour from anywhere: a button, the command palette, or /?tour from another page. */
export function startTour() {
  if (!document.getElementById("work")) return goTo("/?tour");
  window.dispatchEvent(new Event("tour-start"));
}

export function Tour() {
  const [i, setI] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const card = useRef<HTMLDivElement>(null);

  // Start on request, or straight away when another page sent the visitor here with ?tour.
  useEffect(() => {
    const start = () => {
      setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      elapsedRef.current = 0;
      setElapsed(0);
      setI(0);
    };
    window.addEventListener("tour-start", start);
    if (new URLSearchParams(window.location.search).has("tour")) {
      window.history.replaceState(null, "", "/");
      const t = setTimeout(start, 600);
      return () => {
        clearTimeout(t);
        window.removeEventListener("tour-start", start);
      };
    }
    return () => window.removeEventListener("tour-start", start);
  }, []);

  // Go to the stop and mark its heading.
  useEffect(() => {
    if (i === null) return;
    const stop = STOPS[i];
    if (stop.open) stop.open();
    else scrollToId(stop.id);
    const heading = document.getElementById(stop.id)?.querySelector("h2");
    heading?.setAttribute("data-tour", "");
    card.current?.focus({ preventScroll: true });
    return () => heading?.removeAttribute("data-tour");
  }, [i]);

  // Autoplay: advance after STEP_MS; stop on the last stop.
  useEffect(() => {
    if (i === null || !playing) return;
    const t = setInterval(() => {
      elapsedRef.current += TICK_MS;
      if (elapsedRef.current >= STEP_MS) {
        if (i < STOPS.length - 1) {
          elapsedRef.current = 0;
          setI(i + 1);
        } else {
          elapsedRef.current = STEP_MS;
          setPlaying(false);
        }
      }
      setElapsed(elapsedRef.current);
    }, TICK_MS);
    return () => clearInterval(t);
  }, [i, playing]);

  const go = (n: number) => {
    elapsedRef.current = 0;
    setElapsed(0);
    setI(Math.max(0, Math.min(STOPS.length - 1, n)));
  };
  const close = () => setI(null);

  if (i === null) return null;
  const stop = STOPS[i];
  const last = i === STOPS.length - 1;

  return (
    <div
      ref={card}
      role="dialog"
      aria-label="A 60-second tour of this site"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        if (e.key === "ArrowRight") go(i + 1);
        if (e.key === "ArrowLeft") go(i - 1);
      }}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg overflow-hidden rounded-3xl border border-line-strong bg-surface/95 shadow-soft outline-none backdrop-blur-md"
    >
      <div className="h-1 bg-surface-2" aria-hidden>
        <div className="h-full bg-accent-ink transition-[width] duration-100 ease-linear" style={{ width: `${((i + Math.min(1, elapsed / STEP_MS)) / STOPS.length) * 100}%` }} />
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div aria-live="polite">
            <p className="font-mono text-xs text-ink-3">
              {i + 1} of {STOPS.length}
            </p>
            <p className="mt-1 font-semibold">{stop.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{stop.text}</p>
          </div>
          <button type="button" onClick={close} aria-label="End the tour" className="-mr-1 -mt-1 rounded-full p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous stop" className="rounded-full border border-line p-2 disabled:opacity-40">
            <ArrowLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause the tour" : "Play the tour"}
            className="rounded-full border border-line p-2"
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            type="button"
            onClick={() => (last ? close() : go(i + 1))}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent"
          >
            {last ? "Done" : "Next"} {!last && <ArrowRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TourButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={startTour} className={className}>
      <Play size={14} weight="fill" /> Take the 60-second tour
    </button>
  );
}
