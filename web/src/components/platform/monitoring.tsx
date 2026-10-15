"use client";

import { useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { budgetPolicy, burnRules, slos, sreTerms } from "@/content/slo";
import { SloBoard } from "@/components/platform/slo-board";
import { Signals } from "@/components/platform/signals";
import { Investigate } from "@/components/platform/investigate";
import { cn } from "@/lib/utils";

const VIEWS = [
  { id: "slo", label: "SLOs and error budgets" },
  { id: "causes", label: "Cause alerts" },
  { id: "investigate", label: "How I investigate" },
] as const;
type View = (typeof VIEWS)[number]["id"];

const RULES_URL = "https://github.com/zhenxi0901/portfolio/blob/main/deploy/prometheus/rules.yml";

/**
 * "What I monitor", top down: what users feel (SLIs), the objectives and their error budgets, alerts on
 * the budget, then the cause alerts and dashboards that say where to look.
 */
export function Monitoring() {
  const [view, setView] = useState<View>("slo");

  return (
    <div>
      <ol className="grid gap-3 md:grid-cols-3" aria-label="SLI, SLO and SLA">
        {sreTerms.map((t) => (
          <li key={t.term} className="rounded-3xl border border-line bg-surface p-5">
            <p className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-[-0.03em] text-accent-ink">{t.term}</span>
              <span className="text-sm text-ink-2">{t.name}</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink">{t.what}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              <span className="font-medium text-ink-3">Here: </span>
              {t.here}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-2">
        I start from what users feel, not from what is easy to graph. SLIs measure it from outside, objectives say how much failure
        is acceptable, and alerts fire on the error budget: a short blip pages no one, a fast burn pages at once, and a slow leak
        still opens a ticket. Cause alerts and dashboards then say where to look.
      </p>

      <div role="tablist" aria-label="Monitoring views" className="mt-6 inline-flex flex-wrap gap-1 rounded-2xl border border-line bg-surface p-1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setView(v.id)}
            className={cn(
              "rounded-xl px-3.5 py-1.5 text-sm font-medium transition-colors",
              view === v.id ? "bg-ink text-bg" : "text-ink-2 hover:text-ink",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {view === "slo" && (
          <div className="grid gap-4">
            <SloBoard />
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="overflow-x-auto rounded-3xl border border-line bg-surface p-5">
                <h4 className="font-semibold">The SLIs, as good events over valid events</h4>
                <ul className="mt-3 grid gap-3">
                  {slos.map((s) => (
                    <li key={s.id} className="text-sm leading-relaxed">
                      <p className="font-medium">
                        {s.name} <span className="font-mono text-xs text-ink-3">proposed {s.target}%</span>
                      </p>
                      <p className="mt-0.5 font-mono text-[12px] text-ink-2">
                        {s.good} / {s.valid}
                      </p>
                      <p className="mt-0.5 text-ink-2">{s.why}</p>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="rounded-3xl border border-line bg-surface p-5">
                <h4 className="font-semibold">When the budget burns</h4>
                <ul className="mt-3 grid gap-2 text-sm">
                  {burnRules.map((r) => (
                    <li key={r.name} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-xl bg-surface-2 px-3 py-2">
                      <span className="font-medium">{r.name}</span>
                      <span className="font-mono text-xs text-ink-2">
                        &gt;{r.rate}x over {r.long} and {r.short}: {r.action}
                      </span>
                    </li>
                  ))}
                </ul>
                <h4 className="mt-5 font-semibold">Error budget policy</h4>
                <ul className="mt-2 grid gap-1.5 text-sm leading-relaxed">
                  {budgetPolicy.map((p) => (
                    <li key={p.when}>
                      <span className="font-medium">{p.when}:</span> <span className="text-ink-2">{p.then}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm leading-relaxed text-ink-2">
                  The platform&apos;s SLO page stays a design gate until objectives are agreed, so these targets are proposals. This
                  site already runs the pattern: 99.5% over 30 days, paging on a 14.4x fast burn.{" "}
                  <a href={RULES_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-ink underline decoration-accent-ink decoration-2 underline-offset-4">
                    See the rules <ArrowUpRight size={13} />
                  </a>
                </p>
              </section>
            </div>
          </div>
        )}
        {view === "causes" && (
          <div>
            <p className="mb-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-2">
              SLO alerts say users are hurting. These cause alerts say where to look, and catch the failures an SLO is slow to see,
              like a message lost without an error. Break one and watch it.
            </p>
            <Signals />
          </div>
        )}
        {view === "investigate" && <Investigate />}
      </div>
    </div>
  );
}
