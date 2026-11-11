"use client";

import { useState } from "react";
import { ArrowClockwise, CircleNotch, Play } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { mcpRequest } from "@/lib/mcp-client";
import type { LiveCheck as Kind } from "@/content/evidence";

// Rounded down, like every other availability figure on the site.
const pct = (x: number, digits: number) => `${(Math.floor(x * 100 * 10 ** digits + 1e-6) / 10 ** digits).toFixed(digits)}%`;

const since = (seconds: number) => (seconds < 90 ? `${Math.round(seconds)} s` : seconds < 5400 ? `${Math.round(seconds / 60)} min` : `${(seconds / 3600).toFixed(1)} h`);

/** Each check asks this site's own API and reports what came back, in one line. */
const checks: Record<Kind, () => Promise<string>> = {
  slo: async () => {
    const r = await api.slo();
    if (!r.available) return `The server is not reading uptime checks here: ${r.reason ?? "no reason given"}`;
    return `${r.passed.toLocaleString("en-GB")} of ${r.checks.toLocaleString("en-GB")} checks passed: ${pct(r.availability, 3)} against ${pct(r.target, 1)}. ${pct(Math.max(r.budget_remaining, 0), 1)} of the error budget is left.`;
  },
  status: async () => {
    const r = await api.status();
    return `Commit ${r.commit.slice(0, 7)} is running in ${r.region}; this instance has been up ${since(r.uptime_seconds)}.`;
  },
  mcp: async () => {
    const x = await mcpRequest("tools/list");
    const names = x.json?.result?.tools?.map((t) => t.name) ?? [];
    if (x.status !== 200 || names.length === 0) throw new Error(`HTTP ${x.status}`);
    return `HTTP ${x.status}. ${names.length} tools: ${names.join(", ")}.`;
  },
};

type State = { phase: "idle" } | { phase: "busy" } | { phase: "done"; text: string; at: Date; ok: boolean };

/** Runs one check from the visitor's browser, so the proof is theirs and not a screenshot. */
export function LiveCheck({ kind }: { kind: Kind }) {
  const [s, setS] = useState<State>({ phase: "idle" });
  const run = async () => {
    setS({ phase: "busy" });
    try {
      setS({ phase: "done", text: await checks[kind](), at: new Date(), ok: true });
    } catch {
      setS({ phase: "done", text: "The server did not answer. That is evidence too: try again, or see the status page.", at: new Date(), ok: false });
    }
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <button
        type="button"
        onClick={run}
        disabled={s.phase === "busy"}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[13px] font-medium text-on-accent transition-[transform,filter] hover:brightness-95 active:scale-[0.97] disabled:opacity-60"
      >
        {s.phase === "busy" ? <CircleNotch size={14} className="animate-spin" aria-hidden /> : s.phase === "done" ? <ArrowClockwise size={14} aria-hidden /> : <Play size={14} weight="fill" aria-hidden />}
        {s.phase === "done" ? "Check again" : "Check it now"}
      </button>
      <p className="min-w-0 flex-1 basis-64 text-sm leading-relaxed" aria-live="polite">
        {s.phase === "done" && (
          <>
            <span className={s.ok ? "text-ink" : "text-critical"}>{s.text}</span>{" "}
            <span className="font-mono text-xs text-ink-3">asked at {s.at.toLocaleTimeString("en-GB")}</span>
          </>
        )}
      </p>
    </div>
  );
}
