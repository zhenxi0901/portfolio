"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Play, Stop } from "@phosphor-icons/react";
import generated from "@/content/generated/delivery.json";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

// Written by scripts/delivery-stats.mjs in CI from the latest deploy run's jobs: each step's start and
// end in seconds from the run's start. Older snapshots have no lastDeploy, and then nothing renders.
type Step = { name: string; start: number; end: number; result: string };
type LastDeploy = { sha: string; title: string; ended: string; seconds: number; url: string | null; steps: Step[] };
const last = ((generated as { lastDeploy?: LastDeploy | null }).lastDeploy ?? null) as LastDeploy | null;

/** How much faster than real time the replay runs... */
const SPEED = 12;
/** ...unless that would take longer than this many seconds: a long run plays faster instead. */
const LONGEST = 10;

/** What a step did, in a sentence a visitor who has never seen the pipeline can follow. */
const ABOUT: Record<string, string> = {
  "Release only main's head": "A run for an older commit stops here, so only main's head ships.",
  "Sign in to Google Cloud, keyless": "Workload Identity Federation: GitHub's token is exchanged for a short-lived one; no key is stored.",
  "Find the image CI tested": "The exact image CI built and tested, by digest. Nothing is rebuilt for production.",
  "Check the image's provenance and SBOM": "The image's build provenance and SBOM attestations must verify, or it is refused.",
  "Check the error budget": "If the site's own SLO error budget is spent, releases are held (reliability fixes excepted).",
  "Note the revision serving now": "Kept as the rollback target.",
  "Start the new revision with no traffic": "A new Cloud Run revision, serving nobody yet.",
  "Check the new revision before it takes traffic": "The smoke test, at the revision's own URL.",
  "Send traffic to the new revision": "Every visitor moves to it.",
  Verify: "The smoke test again, now live.",
  "Roll back to the previous revision": "Not needed: every check passed. Had one failed, traffic would have gone back on its own.",
  "Publish the release": "A GitHub release with the SBOM and provenance attached.",
};

/** A step's sentence; the rollback's depends on whether it ran. */
const about = (s: Step) =>
  s.name === "Roll back to the previous revision" && s.result !== "skipped"
    ? "A check failed, so traffic went back to the revision noted above."
    : ABOUT[s.name];

/** How a step ended, in words, when it did not simply succeed: colour alone would leave this out. */
const OUTCOME: Record<string, string> = { failure: "failed", cancelled: "cancelled", timed_out: "timed out" };

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/**
 * The latest deploy to production replayed from its own run: every step at its real start and length,
 * sped up so the whole release plays in a few seconds. It plays once when it comes into view; the
 * button stops it, or plays it again. With reduced motion it shows the finished run and does not move.
 */
export function DeployReplay() {
  const reduce = useReducedMotionSafe();
  const total = last ? Math.max(1, last.seconds, ...last.steps.map((s) => s.end)) : 1;
  const speed = Math.max(SPEED, Math.ceil(total / LONGEST));
  // Run time shown, in seconds. It starts at the end, so the page shows the whole run without
  // JavaScript and before the replay begins.
  const [t, setT] = useState(total);
  const [playing, setPlaying] = useState(false);
  const frame = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const played = useRef(false);

  const play = useCallback(() => {
    // A replay the visitor started counts as the one it plays by itself, so scrolling on never restarts it.
    played.current = true;
    cancelAnimationFrame(frame.current);
    const t0 = performance.now();
    setPlaying(true);
    setT(0);
    const tick = (now: number) => {
      const run = Math.min(total, ((now - t0) / 1000) * speed);
      setT(run);
      if (run < total) frame.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame.current = requestAnimationFrame(tick);
  }, [total, speed]);

  // Moving content that starts by itself needs a way to stop it (WCAG 2.2.2): this jumps to the end.
  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    setPlaying(false);
    setT(total);
  }, [total]);

  // Once, when at least half of it is on screen.
  useEffect(() => {
    if (reduce || !root.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !played.current) play();
      },
      { threshold: 0.5 },
    );
    io.observe(root.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [reduce, play]);

  if (!last || last.steps.length === 0) return null;
  const pct = (s: number) => `${(s / total) * 100}%`;
  // Reduced motion switched on mid-replay cancels the frames: show the finished run, not a frozen one.
  const shown = reduce ? total : t;
  const moving = playing && !reduce;
  const explained = last.steps.filter((s) => about(s));

  return (
    <div ref={root} id="replay" className="mt-4 scroll-mt-28 rounded-3xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="font-semibold">Replay the latest deploy</p>
        <p className="font-mono text-xs text-ink-2">
          commit {last.sha} · {when(last.ended)} UTC · {clock(last.seconds)} end to end
        </p>
      </div>
      <p className="mt-2 max-w-[75ch] text-sm leading-relaxed text-ink-2">
        &ldquo;{last.title}&rdquo;: every step of that release at its real start and length, played {speed} times faster.
        {last.url && (
          <>
            {" "}
            <a href={last.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-ink-3 underline underline-offset-4 hover:text-ink">
              The run on GitHub
              <ArrowUpRight size={12} aria-hidden />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </>
        )}
      </p>

      {!reduce && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={playing ? stop : play}
            className="inline-flex items-center gap-2 rounded-full border border-line-strong px-4 py-2 text-sm font-medium transition-colors hover:border-ink-3"
          >
            {playing ? <Stop size={14} aria-hidden /> : <Play size={14} aria-hidden />}
            {playing ? "Stop" : "Replay"}
          </button>
          <span className="font-mono text-xs tabular-nums text-ink-3" aria-hidden>
            {clock(shown)} / {clock(total)}
          </span>
        </div>
      )}

      <ol className="mt-5 space-y-3" aria-label={`The steps of the deploy of commit ${last.sha}, in order`}>
        {last.steps.map((s) => {
          const skipped = s.result === "skipped";
          const outcome = OUTCOME[s.result];
          const length = s.end - s.start;
          const done = skipped ? 0 : length === 0 ? (shown >= s.start ? 1 : 0) : Math.min(1, Math.max(0, (shown - s.start) / length));
          return (
            <li key={`${s.name}-${s.start}`} className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[17rem_minmax(0,1fr)_4.5rem] sm:items-center">
              <span className={cn("min-w-0", skipped ? "text-ink-3" : "text-ink")}>
                {s.name}
                {about(s) && <span className="sr-only">. {about(s)}</span>}
              </span>
              <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
                <span className="relative block h-2 rounded-full bg-surface-2" aria-hidden>
                  <span
                    className={cn(
                      "absolute inset-y-0 overflow-hidden rounded-full",
                      skipped ? "border border-dashed border-line-strong" : "bg-line",
                    )}
                    style={{ left: pct(s.start), width: `max(4px, ${pct(Math.max(length, 0.5))})` }}
                  >
                    {!skipped && (
                      <span
                        className={cn("absolute inset-y-0 left-0", outcome ? "bg-critical" : "bg-accent-ink")}
                        style={{ width: `${done * 100}%` }}
                      />
                    )}
                  </span>
                  {moving && <span className="absolute -inset-y-1 w-px bg-ink" style={{ left: pct(shown) }} />}
                </span>
              </span>
              <span className={cn("text-right font-mono text-xs tabular-nums sm:order-none", outcome ? "text-critical" : "text-ink-3")}>
                {skipped ? "skipped" : (outcome ?? (length < 1 ? "<1 s" : `${length} s`))}
              </span>
            </li>
          );
        })}
      </ol>
      {/* A disclosure, not a hover title: it opens by keyboard and by touch, and without JavaScript. */}
      {explained.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm text-ink-2 hover:text-ink">What each step does</summary>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm leading-relaxed sm:grid-cols-[17rem_minmax(0,1fr)] sm:gap-y-2">
            {explained.map((s) => (
              <Fragment key={`${s.name}-${s.start}`}>
                <dt className="mt-2 font-medium text-ink sm:mt-0">{s.name}</dt>
                <dd className="text-ink-2">{about(s)}</dd>
              </Fragment>
            ))}
          </dl>
        </details>
      )}
      <p className="mt-4 text-xs leading-relaxed text-ink-3">
        Read from the run&apos;s own step timings by the pipeline when it built this image, so this is the release before the one
        serving you, unless nothing has shipped since.
      </p>
    </div>
  );
}
