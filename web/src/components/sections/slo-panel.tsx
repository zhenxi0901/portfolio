"use client";

import { useEffect, useRef, useState } from "react";
import { api, type SloReport } from "@/lib/api";
import { cn } from "@/lib/utils";

const pct = (x: number, digits = 3) => `${(x * 100).toFixed(digits)}%`;

/** How long the checks have been running, from the report's own timestamps. */
function span(since: string, updated: string) {
  const h = (Date.parse(updated) - Date.parse(since)) / 36e5;
  return h < 48 ? `${Math.max(1, Math.round(h))} h` : `${Math.round(h / 24)} days`;
}
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const dayTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function dayTone(checks: number, passed: number, target: number) {
  if (!checks) return "bg-surface-2";
  const ratio = passed / checks;
  if (ratio >= target) return "bg-good";
  if (ratio >= 0.99) return "bg-p-ai";
  return "bg-critical";
}

/** This site's own SLO: real uptime-check results from Cloud Monitoring, not a sample. */
export function SloPanel() {
  const [report, setReport] = useState<SloReport | null>(null);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch once, when the panel is close to view; the server caches for five minutes anyway.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        api.slo().then(setReport, () => setFailed(true));
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const r = report;
  const budgetTone = !r?.available ? "" : r.budget_remaining >= 0.5 ? "text-good" : r.budget_remaining >= 0 ? "text-p-ai" : "text-critical";

  return (
    <div ref={ref} className="mt-4 rounded-3xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="font-semibold">
          This site&apos;s own SLO, measured from outside{" "}
          <span className="ml-1 rounded-full border border-line px-2 py-0.5 align-middle font-mono text-[11px] font-normal text-ink-2">
            real data
          </span>
        </p>
        <p className="font-mono text-xs text-ink-2">Objective: 99.9% over 30 days</p>
      </div>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-ink-2">
        SLI: the share of Google Cloud uptime checks that get a 2xx from <code className="font-mono text-[13px]">/api/health</code> within
        10 s. They run every minute from Singapore, Belgium and Oregon.
      </p>

      {!r && !failed && <div className="mt-6 h-28 animate-pulse rounded-2xl bg-surface-2" aria-hidden />}
      {(failed || (r && !r.available)) && (
        <p className="mt-6 rounded-2xl bg-surface-2 p-4 text-sm text-ink-2" role="status">
          {failed ? "Couldn't reach the API for the SLO right now." : r?.reason}
          {r?.reason?.startsWith("Measured on the live site") && " This copy isn't running on Cloud Run."}
        </p>
      )}

      {r?.available && (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            <div className="flex flex-col-reverse justify-end">
              {/* Monitoring stores several samples per probe, so the counts are not shown as "checks". */}
              <dt className="mt-1 text-sm text-ink-2">availability over {r.since ? span(r.since, r.updated) : "the window"}</dt>
              <dd className="text-3xl font-semibold tracking-[-0.03em]">{pct(r.availability)}</dd>
            </div>
            <div className="flex flex-col-reverse justify-end">
              <dt className="mt-1 text-sm text-ink-2">
                error budget left: {Math.max(0, r.budget_minutes - r.downtime_minutes).toFixed(1)} of {r.budget_minutes.toFixed(1)} min
              </dt>
              <dd className={cn("text-3xl font-semibold tracking-[-0.03em]", budgetTone)}>{pct(Math.max(-9.99, r.budget_remaining), 1)}</dd>
            </div>
            <div className="col-span-2 flex flex-col-reverse justify-end sm:col-span-1">
              <dt className="mt-1 text-sm text-ink-2">downtime the checks saw</dt>
              <dd className="text-3xl font-semibold tracking-[-0.03em]">{r.downtime_minutes.toFixed(1)} min</dd>
            </div>
          </dl>

          <div className="mt-6">
            <div
              className="flex h-9 items-stretch gap-[3px]"
              role="img"
              aria-label={`Daily availability for the last ${r.days.length} days; ${r.days.filter((d) => d.checks && d.passed / d.checks < r.target).length} below the objective.`}
            >
              {r.days.map((d) => (
                <span
                  key={d.end}
                  title={d.checks ? `${day(d.end)}: ${pct(d.passed / d.checks)} available` : `${day(d.end)}: not measured yet`}
                  className={cn("flex-1 rounded-[3px]", dayTone(d.checks, d.passed, r.target))}
                />
              ))}
            </div>
            <p className="mt-2 flex justify-between font-mono text-[11px] text-ink-3">
              <span>30 days ago</span>
              <span>each bar is 24 hours</span>
              <span>now</span>
            </p>
          </div>

          {r.releases && r.releases !== "unknown" && (
            <p className="mt-5 flex items-start gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink-2">
              <span
                className={cn("mt-1.5 size-2 shrink-0 rounded-full", r.releases === "open" ? "bg-good" : "bg-critical")}
                aria-hidden
              />
              <span>
                <span className="font-medium text-ink">Releases {r.releases === "open" ? "open" : "frozen"}.</span>{" "}
                {r.releases === "open"
                  ? "Budget is left, so changes ship. If it runs out, the deploy pipeline holds every release that is not marked as a reliability fix."
                  : "The error budget is spent, so the deploy pipeline holds every release that is not marked as a reliability fix until it recovers."}
              </span>
            </p>
          )}

          <p className="mt-4 text-xs leading-relaxed text-ink-3">
            {r.since && `Measured since ${dayTime(r.since)} your time; the 30-day window fills in from there. `}
            Read from Cloud Monitoring by this site&apos;s Go API, cached for five minutes
            {r.stale ? "; this is the last good reading, the latest fetch failed." : "."}
          </p>
        </>
      )}
    </div>
  );
}
