"use client";

import { useState } from "react";
import { fyp } from "@/content/profile";
import { Segmented } from "@/components/work/segmented";

type View = "all" | "internet" | "apps";

const VIEWS: { value: View; label: string }[] = [
  { value: "all", label: "All runs" },
  { value: "internet", label: "Internet" },
  { value: "apps", label: "Applications" },
];

// The model is the story, so it carries the accent; MCP gets the project's own colour.
const FILL: Record<string, string> = {
  model: "var(--accent-ink)",
  own: "var(--ink-3)",
  mcpNet: "var(--p-aries)",
  mcpApp: "color-mix(in oklab, var(--p-aries) 55%, var(--surface))",
  between: "var(--line-strong)",
};

const KIND: Record<string, string> = { local: "var(--ink-3)", application: "color-mix(in oklab, var(--p-aries) 55%, var(--surface))", internet: "var(--p-aries)" };

// Latency axis: log scale from 1 ms to 20 s.
const LO = Math.log10(1);
const HI = Math.log10(20000);
const x = (ms: number) => ((Math.log10(Math.max(1, ms)) - LO) / (HI - LO)) * 100;
const TICKS = [1, 10, 100, 1000, 10000];
const fmt = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s` : `${ms} ms`);

/** Where an agent's time goes, and what each MCP server costs per call: 48 instrumented runs. */
export function AgentTime() {
  const [view, setView] = useState<View>("all");
  const parts = fyp.agentTime.parts.filter((p) => p[view] > 0);
  const mcp = fyp.agentTime.parts.filter((p) => p.key.startsWith("mcp")).reduce((s, p) => s + p[view], 0);

  return (
    <figure className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <figcaption>
        <p className="font-semibold">Where an agent&apos;s time goes</p>
        <p className="mt-0.5 text-sm text-ink-2">
          {fyp.agentTime.runs} later runs with the agent&apos;s own spans switched on, half of them on tasks whose MCP servers reach
          the internet, where a call takes far longer. The model&apos;s turns are most of it; MCP tool servers are{" "}
          <span className="font-medium text-ink">{mcp.toFixed(1)}%</span> here.
        </p>
      </figcaption>

      <div className="mt-4">
        <Segmented<View> label="Which tasks: all, those whose servers reach the internet, or the pool tasks, mostly backed by applications" options={VIEWS} value={view} onChange={setView} />
      </div>

      <div
        className="mt-4 flex h-9 w-full gap-[2px]"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${p[view]}%`).join(", ")}
      >
        {parts.map((p) => (
          <div
            key={p.key}
            className="h-full transition-[width] duration-500 first:rounded-l-lg last:rounded-r-lg motion-reduce:transition-none"
            style={{ background: FILL[p.key], width: `${p[view]}%` }}
          />
        ))}
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {parts.map((p) => (
          <li key={p.key} className="flex items-start gap-2">
            <span className="mt-1.5 size-2.5 shrink-0 rounded-[3px]" style={{ background: FILL[p.key] }} />
            <span>
              <span className="font-semibold tabular-nums">{p[view]}%</span> <span className="text-ink-2">{p.label}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-7 border-t border-line pt-5">
        <p className="text-sm font-medium">What one call costs, by server</p>
        <p className="mt-0.5 text-sm text-ink-2">
          Each bar runs from the median call to the 95th percentile, on a log scale. Nine of the thirteen servers, {fyp.mcpServers.reduce((n, s) => n + s.calls, 0)} of
          874 calls.
        </p>
        <div className="mt-4 grid grid-cols-[6.5rem_1fr] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[7.5rem_1fr]">
          {fyp.mcpServers.map((s) => (
            <div key={s.name} className="contents">
              <span className="truncate font-mono text-xs text-ink-2">{s.name}</span>
              <div
                className="relative h-4"
                role="img"
                aria-label={`${s.name}, ${s.kind} server: median ${fmt(s.p50)}, 95th percentile ${fmt(s.p95)}, ${s.calls} calls`}
                title={`${s.name}: median ${fmt(s.p50)}, P95 ${fmt(s.p95)} (${s.calls} calls)`}
              >
                <span className="absolute inset-y-[7px] left-0 right-0 rounded-full bg-surface-2" />
                <span
                  className="absolute inset-y-1 rounded-full"
                  style={{ left: `${x(s.p50)}%`, width: `${Math.max(1.2, x(s.p95) - x(s.p50))}%`, background: KIND[s.kind] }}
                />
              </div>
            </div>
          ))}
          <span />
          <div className="relative mt-1 h-4 font-mono text-[10px] text-ink-3" aria-hidden>
            {TICKS.map((t) => (
              <span key={t} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${x(t)}%` }}>
                {fmt(t)}
              </span>
            ))}
          </div>
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
          {(["local", "application", "internet"] as const).map((k) => (
            <li key={k} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ background: KIND[k] }} />
              {k === "local" ? "does the work itself" : k === "application" ? "calls an application beside it" : "reaches the internet"}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-ink-2">
          Servers that reach the internet are slow with long tails: a browser call takes 1.4 s at the median, and an arXiv search 11 s at the 95th percentile.
          Two ideas would save memory, not time: starting a server only at its first call adds about 1.2 s per server, roughly as much as all the
          MCP waiting in a run, and restoring an idle application from a snapshot takes about 1.5 s.
        </p>
      </div>
    </figure>
  );
}
