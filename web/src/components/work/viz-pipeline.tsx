"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle, Circle, CircleNotch, HandPalm, Play, ShieldWarning, XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

const STAGES = ["PR checks", "Build image", "CVE scan", "Integration tests", "Approval", "Promote digest", "Deploy to GKE"];
const APPROVAL = STAGES.indexOf("Approval");
const SCAN = STAGES.indexOf("CVE scan");

type Run =
  | { phase: "idle" }
  | { phase: "running"; at: number; cve: boolean }
  | { phase: "approval" }
  | { phase: "done" }
  | { phase: "failed"; at: number };

/** A playable model of the release gates: a red stage stops everything after it. */
export function PipelineViz() {
  const [run, setRun] = useState<Run>({ phase: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (run.phase !== "running") return;
    timer.current = setTimeout(() => {
      if (run.cve && run.at === SCAN) return setRun({ phase: "failed", at: SCAN });
      const next = run.at + 1;
      if (next === APPROVAL) return setRun({ phase: "approval" });
      if (next >= STAGES.length) return setRun({ phase: "done" });
      setRun({ phase: "running", at: next, cve: run.cve });
    }, 650);
  }, [run]);

  const start = (cve: boolean) => setRun({ phase: "running", at: 0, cve });

  const stateOf = (i: number): "pending" | "running" | "passed" | "failed" | "waiting" => {
    switch (run.phase) {
      case "idle":
        return "pending";
      case "running":
        return i < run.at ? "passed" : i === run.at ? "running" : "pending";
      case "approval":
        return i < APPROVAL ? "passed" : i === APPROVAL ? "waiting" : "pending";
      case "done":
        return "passed";
      case "failed":
        return i < run.at ? "passed" : i === run.at ? "failed" : "pending";
    }
  };

  const busy = run.phase === "running" || run.phase === "approval";

  return (
    <div className="flex h-full flex-col gap-4">
      <ol className="grid gap-1.5" aria-live="polite">
        {STAGES.map((stage, i) => {
          const s = stateOf(i);
          return (
            <li
              key={stage}
              className={
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors " +
                (s === "running" || s === "waiting" ? "bg-surface" : "")
              }
            >
              <StageIcon state={s} />
              <span className={s === "pending" ? "text-ink-3" : "text-ink"}>{stage}</span>
              <span className="ml-auto font-mono text-[11px] text-ink-3">
                {s === "passed" && "passed"}
                {s === "running" && "running"}
                {s === "failed" && <span className="text-critical">1 critical CVE</span>}
                {s === "waiting" && "needs you"}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-auto flex min-h-10 flex-wrap items-center gap-2">
        <AnimatePresence mode="wait" initial={false}>
          {run.phase === "approval" ? (
            <motion.div key="approve" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Button size="sm" onClick={() => setRun({ phase: "running", at: APPROVAL, cve: false })}>
                <HandPalm weight="fill" /> Approve release
              </Button>
            </motion.div>
          ) : (
            <motion.div key="run" className="flex flex-wrap gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Button size="sm" onClick={() => start(false)} disabled={busy}>
                <Play weight="fill" /> Run pipeline
              </Button>
              <Button size="sm" variant="secondary" onClick={() => start(true)} disabled={busy}>
                <ShieldWarning /> Run with a bad image
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className="min-h-5 font-mono text-[11px] text-ink-3" aria-live="polite">
        {run.phase === "done" && "Deployed the exact digest that passed every gate."}
        {run.phase === "failed" && "Stopped at the scan. Nothing reached production."}
        {run.phase === "idle" && "A simulation of the real release gates."}
      </p>
    </div>
  );
}

function StageIcon({ state }: { state: string }) {
  if (state === "passed") return <CheckCircle size={18} weight="fill" className="shrink-0 text-good" aria-label="passed" />;
  if (state === "failed") return <XCircle size={18} weight="fill" className="shrink-0 text-critical" aria-label="failed" />;
  if (state === "running")
    return <CircleNotch size={18} className="shrink-0 animate-spin text-accent-ink" aria-label="running" />;
  if (state === "waiting") return <HandPalm size={18} weight="fill" className="shrink-0 text-accent-ink" aria-label="waiting" />;
  return <Circle size={18} className="shrink-0 text-line-strong" aria-label="pending" />;
}
