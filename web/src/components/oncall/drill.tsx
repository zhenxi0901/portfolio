"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, BellRinging, CheckCircle, MagnifyingGlass, Wrench, XCircle } from "@phosphor-icons/react";
import type { Move, Scenario } from "@/content/oncall";
import { clock, debrief, idle, lowerFirst, movesNow, paged, pct, play as playMove, spent as spentOf, statusLabel, type DrillState } from "@/lib/drill";
import { cn } from "@/lib/utils";

export function Drill({ scenario }: { scenario: Scenario }) {
  const at = (minutesAfterPage: number) => clock(scenario.start, minutesAfterPage);
  // The rules (what each move does, the clock, the budget, the score) are lib/drill's, shared with
  // the terminal's `oncall` command; this component draws them.
  const [s, setS] = useState<DrillState>(idle);
  const { phase, minutes, log } = s;
  const feed = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // The latest result next to the buttons, on phones only (hidden from lg up).
  const latest = useRef<HTMLDivElement>(null);
  const onPhone = () => latest.current?.offsetParent != null;
  // Each phase change removes the button that was just pressed, so focus is moved on purpose:
  // to the page when it fires, to "Confirm recovery" after the rollback, to the debrief at the end.
  const focusNext = useRef<"pager" | "verify" | "debrief" | null>(null);
  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    // On a phone the result of the rollback is what to see next; the focused button is just below it.
    root.current?.querySelector<HTMLElement>(`[data-focus="${target}"]`)?.focus({ preventScroll: target === "verify" && latest.current?.offsetParent != null });
  }, [phase, log.length]);

  const used = new Set(log.map((e) => e.move.id));
  const burning = phase === "paged";
  const spent = spentOf(scenario, s);

  const start = () => {
    focusNext.current = "pager";
    setS(paged);
  };

  const play = (move: Move) => {
    if (move.effect === "mitigate") focusNext.current = "verify";
    if (move.effect === "verify") focusNext.current = "debrief";
    setS((current) => playMove(current, move));
    requestAnimationFrame(() => {
      feed.current?.scrollTo({ top: 0, behavior: "smooth" });
      // Phones stack the columns: the button pressed is far below the status and the feed, so bring the
      // result (with the status and the budget) to the top of the screen, the buttons right under it.
      if (onPhone()) latest.current?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  };

  if (phase === "idle") {
    return (
      <div className="mt-8 rounded-3xl border border-line bg-surface p-6 sm:p-8 lg:flex lg:items-start lg:justify-between lg:gap-10">
        <div>
          <p className="font-semibold">How it works</p>
          <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-ink-2">
            <li>A page fires. Every look and every action costs simulated minutes, and the error budget burns while you work.</li>
            <li>{scenario.honesty}</li>
            <li>When it is over you get your own postmortem: timeline, time to recover, budget spent and what went well.</li>
          </ul>
        </div>
        {/* Beside the rules from lg up, so a laptop's first screen has it (under them it sat just below); under them on a phone. */}
        <button
          type="button"
          onClick={start}
          className="mt-6 inline-flex shrink-0 items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-on-accent lg:mt-0"
        >
          <BellRinging size={16} weight="fill" /> Go on call
        </button>
      </div>
    );
  }

  const { looks, acts } = movesNow(scenario, s);

  return (
    <div ref={root} className="mt-10 grid gap-4 lg:grid-cols-12">
      {/* The incident: pager, clock, budget, and what you have found. */}
      <div className="flex flex-col gap-4 lg:col-span-7">
        <div
          className={cn(
            "rounded-3xl border p-5 sm:p-6",
            phase === "paged" ? "border-critical/60 bg-[color-mix(in_oklab,var(--critical)_10%,var(--surface))]" : "border-good/50 bg-surface",
          )}
        >
          {/* Not a live region: the clock and budget change on every move and would be re-read each
              time. Focus moves to the title on each phase change, and the feed below announces results. */}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
            <span className={phase === "paged" ? "text-critical" : "text-good"}>
              {statusLabel(s)}
            </span>
            <span className="text-ink-3">paged at {scenario.start}</span>
          </p>
          <p tabIndex={-1} data-focus="pager" className="mt-2 text-xl font-semibold tracking-[-0.02em] outline-none">
            {scenario.page.title}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{scenario.page.detail}</p>
          <dl className="mt-5 grid grid-cols-2 gap-4">
            <div className="flex flex-col-reverse justify-end">
              <dt className="text-xs text-ink-2">now ({minutes} min in)</dt>
              <dd className="font-mono text-2xl font-semibold">{at(minutes)}</dd>
            </div>
            <div className="flex flex-col-reverse justify-end">
              <dt className="text-xs text-ink-2">of the month&apos;s error budget spent{burning ? ", still burning" : ""}</dt>
              <dd className={cn("font-mono text-2xl font-semibold", burning ? "text-critical" : "text-ink")}>{pct(spent)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <p id={`oncall-found-${scenario.id}`} className="font-semibold">
            What you have found
          </p>
          {/* It scrolls once it grows, so it takes focus: keyboard users can then scroll it with the arrow keys. */}
          <div
            ref={feed}
            role="region"
            aria-labelledby={`oncall-found-${scenario.id}`}
            tabIndex={0}
            className="mt-3 max-h-[26rem] space-y-3 overflow-y-auto rounded-2xl pr-1"
            aria-live="polite"
          >
            {/* Inset: the box's rounded corners would clip the first letter of a line that touches them. */}
            {log.length === 0 && <p className="px-2 py-1 text-sm text-ink-3">{scenario.emptyHint}</p>}
            {[...log].reverse().map((e) => (
              <div key={e.move.id + e.at} className="rounded-2xl border border-line bg-surface-2/60 p-3.5">
                <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] text-ink-3">
                  <span className="text-ink">{at(e.at)}</span>
                  <span>{e.move.label}</span>
                  <span>+{e.move.minutes} min</span>
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{e.move.result}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* What you can do. */}
      <div className="flex flex-col gap-4 lg:col-span-5">
        {/* Phones stack the columns, so the latest result also shows here, next to the buttons. The
            feed above is the live region; this copy is not announced twice. */}
        {phase !== "resolved" && log.length > 0 && (
          <div ref={latest} aria-hidden className="scroll-mt-20 rounded-3xl border border-line-strong bg-surface-2/60 p-4 lg:hidden">
            {/* The incident card is a screen or more above: its status and budget come along. */}
            <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px]">
              <span className={phase === "paged" ? "text-critical" : "text-good"}>{statusLabel(s)}</span>
              <span className="text-ink-3">
                {at(minutes)} · {pct(spent)} of the budget spent
              </span>
            </p>
            <p className="mt-1 font-mono text-[11px] text-ink-3">
              {at(log[log.length - 1].at)} {log[log.length - 1].move.label}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{log[log.length - 1].move.result}</p>
          </div>
        )}
        {phase !== "resolved" && (
          <>
            <MoveGroup title="Investigate" icon={<MagnifyingGlass size={16} />} moves={looks} used={used} onPlay={play} />
            <MoveGroup title={phase === "paged" ? "Act" : "Close out"} icon={<Wrench size={16} />} moves={acts} used={used} onPlay={play} />
          </>
        )}
        {phase === "resolved" && <Debrief scenario={scenario} state={s} onRestart={start} />}
      </div>
    </div>
  );
}

function MoveGroup({
  title,
  icon,
  moves,
  used,
  onPlay,
}: {
  title: string;
  icon: React.ReactNode;
  moves: Move[];
  used: Set<string>;
  onPlay: (m: Move) => void;
}) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-5">
      <p className="flex items-center gap-2 font-semibold">
        {icon} {title}
      </p>
      <ul className="mt-3 grid gap-2">
        {moves.map((m) => {
          // Looks reveal the same thing twice; actions can be repeated (and repeated mistakes cost time).
          const done = m.kind === "look" && used.has(m.id);
          return (
            <li key={m.id}>
              <button
                type="button"
                // Not disabled: a disabled button drops keyboard focus, and the look just played is the focused one.
                aria-disabled={done || undefined}
                onClick={() => !done && onPlay(m)}
                data-focus={m.effect === "verify" ? "verify" : undefined}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line px-3.5 py-2.5 text-left text-sm transition-colors hover:border-ink-3 aria-disabled:cursor-default aria-disabled:opacity-45 aria-disabled:hover:border-line"
              >
                <span>{m.label}</span>
                <span className="shrink-0 font-mono text-[11px] text-ink-3">{done ? "seen" : `${m.minutes} min`}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Debrief({ scenario, state, onRestart }: { scenario: Scenario; state: DrillState; onRestart: () => void }) {
  const at = (minutesAfterPage: number) => clock(scenario.start, minutesAfterPage);
  const { log, minutes } = state;
  const { mitigateMinutes, checks, wasted } = debrief(scenario, state);
  const spent = spentOf(scenario, state);

  return (
    <div className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <p className="font-mono text-xs text-good">YOUR POSTMORTEM</p>
      <p tabIndex={-1} data-focus="debrief" className="mt-2 text-xl font-semibold tracking-[-0.02em] outline-none">
        Burn stopped after {mitigateMinutes} minutes, closed after {minutes}
      </p>
      <p className="mt-1 text-sm text-ink-2">
        A focused path ({scenario.focusedPath}) takes about {scenario.goodPathMinutes} minutes, with the root cause found after the burn
        stops. You spent {pct(spent)} of the month&apos;s error budget.
      </p>

      <ul className="mt-5 space-y-2.5">
        {checks.map((c) => (
          <li key={c.text} className="flex gap-2.5 text-sm leading-relaxed">
            {c.ok ? (
              <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-good" aria-label="Yes" />
            ) : (
              <XCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-critical" aria-label="No" />
            )}
            <span className={c.ok ? "text-ink" : "text-ink-2"}>{c.text}</span>
          </li>
        ))}
      </ul>

      {wasted.length > 0 && (
        <p className="mt-4 rounded-2xl bg-surface-2 p-3.5 text-sm leading-relaxed text-ink-2">
          {wasted.length === 1 ? "One move" : `${wasted.length} moves`} did not help: {wasted.map((e) => lowerFirst(e.move.label)).join("; ")}.
        </p>
      )}

      <p className="mt-5 text-sm font-semibold">Timeline</p>
      <ol className="mt-2 space-y-1.5 border-l border-line pl-4 font-mono text-xs text-ink-2">
        <li>
          <span className="text-ink">{scenario.start}</span> paged: {scenario.page.title}
        </li>
        {log.map((e) => (
          <li key={e.move.id + e.at}>
            <span className="text-ink">{at(e.at)}</span> {e.move.label}
          </li>
        ))}
      </ol>

      <p className="mt-5 text-sm leading-relaxed text-ink-2">{scenario.rootCause}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={onRestart} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink-3">
          <ArrowCounterClockwise size={15} /> Run it again
        </button>
        <a href="/writing#postmortems" className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent">
          Read the real postmortems
        </a>
      </div>
    </div>
  );
}
