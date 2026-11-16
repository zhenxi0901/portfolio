"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import delivery from "@/content/generated/delivery.json";
import { decisions } from "@/content/decisions";
import { proofCounts } from "@/content/evidence";
import { useTerminal } from "@/components/providers";
import { SectionHeading } from "@/components/site/section-heading";
import { sloSpan } from "@/components/sections/slo-panel";
import { api, type CostReport, type SloReport, type Status } from "@/lib/api";
import { money, printed } from "@/lib/money";
import { uptime } from "@/lib/uptime";

type Built = { windowDays: number; deploys: number; changeFailureRate: number | null };
const built = delivery as unknown as Built;
const claims = proofCounts.live + proofCounts.public + proofCounts.private;

/** Rounded down to a tenth: a budget left is never shown as more than it is. */
const tenthDown = (x: number) => (Math.floor(x * 10) / 10).toFixed(1);
// Two decimals under a millisecond: a static page takes a few hundredths of one in the Go server.
const ms = (v: number) => (v >= 10 ? `${Math.round(v)} ms` : v >= 1 ? `${v.toFixed(1)} ms` : `${v.toFixed(2)} ms`);

type Readings = { slo: SloReport | null; cost: CostReport | null; status: Status | null; mine: number | null; done: boolean };

/**
 * What the Go server spent on this visitor's own request for the page, from its Server-Timing header
 * (the map at the top reads the same). The instance's own p95 is no headline: it includes the hourly
 * reads of Cloud Monitoring and GitHub that run inside a request, so it reads in seconds while pages
 * are served in a fraction of a millisecond.
 */
function myServerTime(): number | null {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return nav?.serverTiming?.find((e) => e.name === "app")?.duration ?? null;
}

/**
 * The home page's way into how the site runs: a ledger, not a grid of icons. On the left, readings the
 * browser takes from the site's own API as the ledger comes into view (lime, the site's colour for
 * live), plus two figures fixed when this build was made (ink, and they say so); on the right, the
 * things to try. Every row opens the page behind it.
 */
export function OpsLedger() {
  const { setOpen } = useTerminal();
  const ref = useRef<HTMLElement>(null);
  const [r, setR] = useState<Readings>({ slo: null, cost: null, status: null, mine: null, done: false });

  // Read once, when the ledger is near the screen: the first visitor after a cold start would
  // otherwise wait on Cloud Monitoring for a section they may never scroll to.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        Promise.allSettled([api.slo(), api.cost(), api.status()]).then(([slo, cost, status]) => {
          if (!alive) return;
          const ok = <T,>(p: PromiseSettledResult<T>) => (p.status === "fulfilled" ? p.value : null);
          setR({ slo: ok(slo), cost: ok(cost), status: ok(status), mine: myServerTime(), done: true });
        });
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, []);

  const slo = r.slo?.available ? r.slo : null;
  const cost = r.cost?.available ? r.cost : null;
  const bill = cost ? printed(cost) : null;
  // Until the reading arrives, a quiet placeholder; if it never does, say so rather than show a stale number.
  const pending = r.done ? "not available" : "reading…";

  const readings: { label: string; href: string; value: string | null; note: string; live: boolean }[] = [
    {
      label: "Availability",
      href: "/status",
      value: slo ? uptime(slo.availability) : null,
      note: slo ? `over ${slo.since ? sloSpan(slo.since, slo.updated) : `${slo.window_days} days`}, from uptime checks in three regions` : "from uptime checks in three regions",
      live: true,
    },
    {
      label: "Error budget left",
      href: "/status",
      value: slo ? `${tenthDown(Math.max(0, slo.budget_minutes - slo.downtime_minutes))} min` : null,
      note: slo ? `of ${slo.budget_minutes} for a 99.9% objective` : "for a 99.9% objective",
      live: true,
    },
    {
      label: "Time in the Go server",
      href: "/status",
      value: r.mine !== null ? ms(r.mine) : r.status ? ms(r.status.latency_ms.p50) : null,
      note: r.mine !== null ? "spent on your request for this page" : "the median of this instance's recent requests",
      live: true,
    },
    {
      label: "This month's bill",
      href: "/cost",
      value: bill ? money(bill.bill, bill.d) : null,
      note: "to pay so far, estimated from the service's own meters",
      live: true,
    },
    {
      label: "Deploys",
      href: "/changelog",
      value: `${built.deploys}`,
      note: `in ${built.windowDays} days, ${built.changeFailureRate ? `${Math.round(built.changeFailureRate * 100)}% failed` : "none failed"}; counted when this build was made`,
      live: false,
    },
    {
      label: "Claims you can check",
      href: "/evidence",
      value: `${proofCounts.live + proofCounts.public} of ${claims}`,
      note: `${proofCounts.live} live on this site, ${proofCounts.public} on public record; the rest are private and say so`,
      live: false,
    },
  ];

  const tries: { title: string; text: string; href?: string; terminal?: boolean }[] = [
    { title: "Break it yourself", text: "Inject delays and 503s into your own requests, and watch retries, a breaker and hedging cope.", href: "/break" },
    { title: "Go on call", text: "Two incidents to work through, and a postmortem of your own at the end.", href: "/oncall" },
    { title: "Open the terminal", text: "A shell over the live API. Try status, slo or oncall. Press ` anywhere.", terminal: true },
    { title: "Ask about my work", text: "Answers from this site's own facts, with sources and a trace of how each was found.", href: "/about#ask" },
    { title: "Point an agent at it", text: "The site is an MCP server with five read-only tools.", href: "/agents" },
    { title: "Read the decisions", text: `${decisions.length} records of why the site is built the way it is, and what each one costs.`, href: "/decisions" },
  ];

  return (
    <section ref={ref} id="explore" className="scroll-mt-16 border-y border-line bg-surface-2/40">
      <div className="mx-auto max-w-[1320px] px-4 py-20 sm:px-8 sm:py-24">
        <SectionHeading
          title="The service behind this page"
          lead="This site runs as a small production service. The lime figures are read from its own API as you scroll here; every row opens the page behind it."
        />
        <div className="mt-12 grid gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div>
            <h3 className="text-sm font-medium text-ink-3">Readings</h3>
            <ul className="mt-3 border-t border-line">
              {readings.map((x) => (
                <li key={x.label} className="border-b border-line">
                  <a href={x.href} className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1 py-4">
                    <span className="text-[15px] font-medium text-ink">{x.label}</span>
                    <span className={x.value === null ? "text-sm text-ink-3" : x.live ? "text-xl font-semibold text-live-ink" : "text-xl font-semibold text-ink"}>
                      {x.value ?? pending}
                    </span>
                    <span className="col-span-2 text-sm leading-snug text-ink-3">
                      {x.note}
                      {x.live && <span className="sr-only">. A live reading</span>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-medium text-ink-3">Try it</h3>
            <ul className="mt-3 border-t border-line">
              {tries.map((t) => {
                const body = (
                  <>
                    <span className="flex items-center justify-between gap-4">
                      <span className="text-[15px] font-medium text-ink group-hover:underline group-hover:underline-offset-4">{t.title}</span>
                      <ArrowRight size={15} className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
                    </span>
                    <span className="mt-1 block text-sm leading-snug text-ink-2">{t.text}</span>
                  </>
                );
                const cls = "group block w-full py-4 text-left";
                return (
                  <li key={t.title} className="border-b border-line">
                    {t.terminal ? (
                      <button type="button" onClick={() => setOpen(true)} className={cls}>
                        {body}
                      </button>
                    ) : (
                      <a href={t.href} className={cls}>
                        {body}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
