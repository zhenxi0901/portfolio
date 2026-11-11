"use client";

import { useState } from "react";
import { ArrowClockwise, CircleNotch, Play } from "@phosphor-icons/react";
import { api, ApiError } from "@/lib/api";
import { mcpRequest } from "@/lib/mcp-client";
import { isTimeout, WAIT_MS } from "@/lib/signal";
import type { LiveCheck as Kind } from "@/content/evidence";

// Rounded down, like every other availability figure on the site.
const pct = (x: number, digits: number) => `${(Math.floor(x * 100 * 10 ** digits + 1e-6) / 10 ** digits).toFixed(digits)}%`;

const since = (seconds: number) => (seconds < 90 ? `${Math.round(seconds)} s` : seconds < 5400 ? `${Math.round(seconds / 60)} min` : `${(seconds / 3600).toFixed(1)} h`);

/** The server said "slow down": a different answer from "no answer", so it is told apart. */
class RateLimited extends Error {}

/** Each check asks this site's own API and reports what came back, in one line. */
const checks: Record<Kind, () => Promise<string>> = {
  slo: async () => {
    const r = await api.slo();
    if (!r.available) return `No availability figures right now: ${r.reason ?? "no reason given"}`;
    const read = r.stale ? ` These are the last good numbers, read ${r.updated.slice(11, 16)} UTC.` : "";
    return `${r.passed.toLocaleString("en-GB")} of ${r.checks.toLocaleString("en-GB")} checks passed: ${pct(r.availability, 3)} against ${pct(r.target, 1)}. ${pct(Math.max(r.budget_remaining, 0), 1)} of the error budget is left.${read}`;
  },
  status: async () => {
    const r = await api.status();
    return r.region === "local"
      ? `Commit ${r.commit.slice(0, 7)} is running on a local copy, not the live site.`
      : `Commit ${r.commit.slice(0, 7)} is running in ${r.region}; this instance has been up ${since(r.uptime_seconds)}.`;
  },
  mcp: async () => {
    const x = await mcpRequest("tools/list");
    if (x.status === 429) throw new RateLimited();
    const names = x.json?.result?.tools?.map((t) => t.name) ?? [];
    if (x.status !== 200 || names.length === 0) throw new Error(`HTTP ${x.status}`);
    return `HTTP ${x.status}. ${names.length} tools: ${names.join(", ")}.`;
  },
};

function explain(e: unknown): string {
  if (e instanceof RateLimited || (e instanceof ApiError && e.status === 429)) return "The server is rate limiting this browser. Wait a minute and check again.";
  if (isTimeout(e)) return `No answer within ${WAIT_MS / 1000} s; the server may be waking up. Try again, or see the status page.`;
  return "The server did not answer. That is evidence too: try again, or see the status page.";
}

type State = { phase: "idle" } | { phase: "busy" } | { phase: "done"; text: string; at: Date; ok: boolean };

/**
 * Runs one check from the visitor's browser, so the proof is theirs and not a screenshot.
 * `describedBy` is the claim it checks: there are several "Check it now" buttons on the page.
 */
export function LiveCheck({ kind, describedBy }: { kind: Kind; describedBy?: string }) {
  const [s, setS] = useState<State>({ phase: "idle" });
  const run = async () => {
    // aria-disabled, not disabled, keeps the button focused while it works; so it guards itself.
    if (s.phase === "busy") return;
    setS({ phase: "busy" });
    try {
      setS({ phase: "done", text: await checks[kind](), at: new Date(), ok: true });
    } catch (e) {
      setS({ phase: "done", text: explain(e), at: new Date(), ok: false });
    }
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <button
        type="button"
        onClick={run}
        aria-describedby={describedBy}
        aria-disabled={s.phase === "busy"}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[13px] font-medium text-on-accent transition-[transform,filter] hover:brightness-95 active:scale-[0.97] aria-disabled:opacity-60"
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
