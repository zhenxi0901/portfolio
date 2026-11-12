"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, X } from "@phosphor-icons/react";
import { goTo, modalOpen, scrollToId } from "@/lib/utils";

type Stop = { id: string; title: string; text: string };

// The tour walks the home page, which since the split into chapters (decision 11) is short enough
// to see in a minute; every stop is on it, so the tour never leaves the page.
const STOPS: Stop[] = [
  {
    id: "now",
    title: "What I am doing now",
    text: "Final-year research at NTU and DevOps at Primustech, dated, with this site's live uptime beside it.",
  },
  {
    id: "chapters",
    title: "Three systems, a chapter each",
    text: "Two platforms I run in production and my final-year research. Each card opens its chapter, with working models of what I built.",
  },
  {
    id: "explore",
    title: "This site runs like production",
    text: "An SLO, a deploy pipeline with rollbacks, postmortems, an MCP server, and incident drills you can play.",
  },
  {
    id: "latest",
    title: "Latest writing",
    text: "The newest posts, from serving LLM agents to a benchmark run without root. The postmortems are on the writing page.",
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
  if (!document.getElementById("chapters")) return goTo("/?tour");
  window.dispatchEvent(new Event("tour-start"));
}

export function Tour() {
  const [i, setI] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const card = useRef<HTMLDivElement>(null);
  // Whatever had focus when the tour opened gets it back when the tour closes.
  const opener = useRef<HTMLElement | null>(null);

  // Start on request, or straight away when another page sent the visitor here with ?tour.
  useEffect(() => {
    const start = () => {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      elapsedRef.current = 0;
      setElapsed(0);
      setI(0);
    };
    window.addEventListener("tour-start", start);
    if (new URLSearchParams(window.location.search).has("tour")) {
      // The URL is tidied when the tour actually starts, so a re-run effect (Strict Mode in dev)
      // still sees ?tour.
      const t = setTimeout(() => {
        // Only ?tour goes: other parameters and the hash stay, as with ?terminal.
        const url = new URL(window.location.href);
        url.searchParams.delete("tour");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
        start();
      }, 600);
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
    scrollToId(stop.id);
    const heading = document.getElementById(stop.id)?.querySelector("h2");
    heading?.setAttribute("data-tour", "");
    return () => heading?.removeAttribute("data-tour");
  }, [i]);

  // Focus the card once, when the tour opens; later steps leave focus where the visitor put it.
  const open = i !== null;
  useEffect(() => {
    if (!open) return;
    card.current?.focus({ preventScroll: true });
    // Esc closes the tour from anywhere on the page, not only from inside the card.
    // But not while the palette or the terminal is on top: that Esc is theirs.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !modalOpen()) setI(null);
    };
    // In the capture phase, so this sees the key before a dialog closes itself: otherwise the
    // dialog is already gone by the time it looks, and one Esc would close both.
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    };
  }, [open]);

  // Autoplay: advance after STEP_MS; stop on the last stop.
  useEffect(() => {
    if (i === null || !playing) return;
    const t = setInterval(() => {
      // The tour holds still while the palette or the terminal is open over it.
      if (modalOpen()) return;
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
          <button
            type="button"
            onClick={() => i > 0 && go(i - 1)}
            aria-disabled={i === 0 || undefined}
            aria-label="Previous stop"
            className="rounded-full border border-line p-2 aria-disabled:opacity-40"
          >
            <ArrowLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              // At the end, Play starts the tour again rather than pausing straight back.
              if (!playing && last && elapsedRef.current >= STEP_MS) {
                go(0);
                setPlaying(true);
              } else setPlaying((p) => !p);
            }}
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
