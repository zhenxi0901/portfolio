"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowCounterClockwise, BellRinging, CheckCircle, MagnifyingGlass, Wrench, XCircle } from "@phosphor-icons/react";
import { scenario, type Move } from "@/content/oncall";
import { cn } from "@/lib/utils";

type Entry = { move: Move; at: number };
type Phase = "idle" | "paged" | "mitigated" | "resolved";

function clock(minutesAfterPage: number) {
  const [h, m] = scenario.start.split(":").map(Number);
  const t = h * 60 + m + minutesAfterPage;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

export function Drill() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [minutes, setMinutes] = useState(0);
  const [log, setLog] = useState<Entry[]>([]);
  const [mitigatedAt, setMitigatedAt] = useState<number | null>(null);
  const [silenced, setSilenced] = useState(false);
  const feed = useRef<HTMLDivElement>(null);

  const used = new Set(log.map((e) => e.move.id));
  const burning = phase === "paged";
  const spent = (mitigatedAt ?? minutes) * scenario.burnPerMinute;

  const start = () => {
    setPhase("paged");
    setMinutes(0);
    setLog([]);
    setMitigatedAt(null);
    setSilenced(false);
  };

  const play = (move: Move) => {
    const at = minutes + move.minutes;
    setMinutes(at);
    setLog((l) => [...l, { move, at }]);
    if (move.effect === "mitigate") {
      setMitigatedAt(at);
      setPhase("mitigated");
    }
    if (move.effect === "silence") setSilenced(true);
    if (move.effect === "verify") setPhase("resolved");
    requestAnimationFrame(() => feed.current?.scrollTo({ top: 0, behavior: "smooth" }));
  };

  if (phase === "idle") {
    return (
      <div className="mt-10 rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p className="font-semibold">How it works</p>
        <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-ink-2">
          <li>A page fires. Every look and every action costs simulated minutes, and the error budget burns while you work.</li>
          <li>The dashboards, runbook and guardrail are the platform&apos;s real ones; the incident is invented for practice.</li>
          <li>When it is over you get your own postmortem: timeline, time to recover, budget spent and what went well.</li>
        </ul>
        <button
          type="button"
          onClick={start}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-on-accent"
        >
          <BellRinging size={16} weight="fill" /> Go on call
        </button>
      </div>
    );
  }

  const looks = scenario.moves.filter((m) => m.kind === "look");
  const acts = scenario.moves.filter((m) => m.kind === "act" && (m.effect === "verify" ? phase !== "paged" : phase === "paged"));

  return (
    <div className="mt-10 grid gap-4 lg:grid-cols-12">
      {/* The incident: pager, clock, budget, and what you have found. */}
      <div className="flex flex-col gap-4 lg:col-span-7">
        <div
          className={cn(
            "rounded-3xl border p-5 sm:p-6",
            phase === "paged" ? "border-critical/60 bg-[color-mix(in_oklab,var(--critical)_10%,var(--surface))]" : "border-good/50 bg-surface",
          )}
          role="status"
        >
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
            <span className={phase === "paged" ? "text-critical" : "text-good"}>
              {phase === "paged" ? (silenced ? "PAGE SILENCED, STILL BURNING" : "PAGE, FIRING") : phase === "mitigated" ? "MITIGATED, VERIFYING" : "RESOLVED"}
            </span>
            <span className="text-ink-3">paged at {scenario.start}</span>
          </p>
          <p className="mt-2 text-xl font-semibold tracking-[-0.02em]">{scenario.page.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{scenario.page.detail}</p>
          <dl className="mt-5 grid grid-cols-2 gap-4">
            <div className="flex flex-col-reverse justify-end">
              <dt className="text-xs text-ink-2">now ({minutes} min in)</dt>
              <dd className="font-mono text-2xl font-semibold">{clock(minutes)}</dd>
            </div>
            <div className="flex flex-col-reverse justify-end">
              <dt className="text-xs text-ink-2">of the month&apos;s error budget spent{burning ? ", still burning" : ""}</dt>
              <dd className={cn("font-mono text-2xl font-semibold", burning ? "text-critical" : "text-ink")}>{pct(spent)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <p className="font-semibold">What you have found</p>
          <div ref={feed} className="mt-3 max-h-[26rem] space-y-3 overflow-y-auto pr-1" aria-live="polite">
            {log.length === 0 && <p className="text-sm text-ink-3">Nothing yet. Pick a dashboard, the logs or the runbook to start.</p>}
            {[...log].reverse().map((e) => (
              <div key={e.move.id + e.at} className="rounded-2xl border border-line bg-surface-2/60 p-3.5">
                <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] text-ink-3">
                  <span className="text-ink">{clock(e.at)}</span>
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
        {phase !== "resolved" && (
          <>
            <MoveGroup title="Investigate" icon={<MagnifyingGlass size={16} />} moves={looks} used={used} onPlay={play} />
            <MoveGroup title={phase === "paged" ? "Act" : "Close out"} icon={<Wrench size={16} />} moves={acts} used={used} onPlay={play} />
          </>
        )}
        {phase === "resolved" && <Debrief log={log} minutes={minutes} spent={spent} onRestart={start} />}
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
                disabled={done}
                onClick={() => onPlay(m)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line px-3.5 py-2.5 text-left text-sm transition-colors hover:border-ink-3 disabled:opacity-45 disabled:hover:border-line"
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

function Debrief({ log, minutes, spent, onRestart }: { log: Entry[]; minutes: number; spent: number; onRestart: () => void }) {
  const rollback = log.findIndex((e) => e.move.effect === "mitigate");
  const before = (evidence: Move["evidence"], idx: number) => log.slice(0, idx).some((e) => e.move.evidence === evidence);
  const mitigateMinutes = log[rollback]?.at ?? minutes;
  // Scored the way the platform's budget policy reads: mitigate first, investigate second.
  const checks = [
    { ok: before("change", rollback), text: "Checked what changed before rolling back, so the rollback was a decision, not a guess" },
    { ok: mitigateMinutes <= 12, text: `Stopped the burn within 12 minutes (took ${mitigateMinutes})` },
    { ok: log.some((e) => e.move.evidence === "parser"), text: "Found why before closing: messages parsing to nothing while every pod stayed Ready" },
    { ok: !log.some((e) => e.move.effect === "silence"), text: "Never silenced the page" },
    { ok: !log.some((e) => e.move.effect === "refused"), text: "Stayed inside the guardrail: no deleting broker data" },
    { ok: true, text: "Confirmed recovery over several publish cycles before closing" },
  ];
  const wasted = log.filter((e) => e.move.effect === "nothing" || e.move.effect === "silence" || e.move.effect === "refused");

  return (
    <div className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <p className="font-mono text-xs text-good">YOUR POSTMORTEM</p>
      <p className="mt-2 text-xl font-semibold tracking-[-0.02em]">
        Burn stopped after {mitigateMinutes} minutes, closed after {minutes}
      </p>
      <p className="mt-1 text-sm text-ink-2">
        A focused path (check what changed, roll back, confirm) takes about {scenario.goodPathMinutes}, with the root cause found after
        the burn stops. You spent {pct(spent)} of the month&apos;s error budget.
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
          {wasted.length === 1 ? "One move" : `${wasted.length} moves`} did not help: {wasted.map((e) => e.move.label.toLowerCase()).join("; ")}.
        </p>
      )}

      <p className="mt-5 text-sm font-semibold">Timeline</p>
      <ol className="mt-2 space-y-1.5 border-l border-line pl-4 font-mono text-xs text-ink-2">
        <li>
          <span className="text-ink">{scenario.start}</span> paged: {scenario.page.title.toLowerCase()}
        </li>
        {log.map((e) => (
          <li key={e.move.id + e.at}>
            <span className="text-ink">{clock(e.at)}</span> {e.move.label.toLowerCase()}
          </li>
        ))}
      </ol>

      <p className="mt-5 text-sm leading-relaxed text-ink-2">
        Root cause: a parser release changed how payloads are detected, so one gateway version&apos;s messages parsed to nothing. Every
        pod stayed Ready and nothing errored, which is why the freshness SLO, not an error alert, caught it.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={onRestart} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink-3">
          <ArrowCounterClockwise size={15} /> Run it again
        </button>
        <Link href="/#postmortems" className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent">
          Read the real postmortems
        </Link>
      </div>
    </div>
  );
}
