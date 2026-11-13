"use client";

import { useEffect, useId, useState } from "react";
import type { CostPrices, CostReport } from "@/lib/api";
import { bytes, count, egressCost, usd, useCost, useServerStatus } from "./use-cost";

/** One visit's load on the server: its requests and bytes, measured from this page's own requests. */
type Footprint = { requests: number; bytes: number; measured: boolean };

const typical: Footprint = { requests: 20, bytes: 400 * 1024, measured: false };

/**
 * Instance time a visit keeps billed, in seconds: a page arrives in about three bursts (the page,
 * its files, its API calls), and each keeps an instance busy for at least one 100 ms billing step.
 * Modelled, not timed from this visit: a browser's timings include the reader's own network, which
 * the server never bills.
 */
const BUSY_PER_VISIT = 0.3;

/**
 * Same-origin requests this page made, as Resource Timing reports them: how many, and how many
 * bytes (the compressed body even when it came from the cache, so this prices a first visit).
 */
function measure(): Footprint {
  if (typeof performance === "undefined" || !performance.getEntriesByType) return typical;
  const origin = location.origin;
  const entries = [
    ...(performance.getEntriesByType("navigation") as PerformanceResourceTiming[]),
    ...(performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter((e) => e.name.startsWith(origin)),
  ];
  if (!entries.length) return typical;
  const size = entries.reduce((sum, e) => sum + Math.max(e.transferSize || 0, e.encodedBodySize || 0), 0);
  return { requests: entries.length, bytes: size || typical.bytes, measured: true };
}

/** null until the visit has been measured, so "this month's pace" doesn't jump once it is. */
function useFootprint(): Footprint | null {
  const [f, setF] = useState<Footprint | null>(null);
  useEffect(() => {
    // After load and the page's own API calls, so they count as part of the visit.
    const run = () => window.setTimeout(() => setF(measure()), 2500);
    if (document.readyState === "complete") {
      const t = run();
      return () => window.clearTimeout(t);
    }
    let t = 0;
    const onLoad = () => {
      t = run();
    };
    window.addEventListener("load", onLoad, { once: true });
    return () => {
      window.removeEventListener("load", onLoad);
      window.clearTimeout(t);
    };
  }, []);
  return f;
}

const DAY = 86_400;
const PEAK = 5; // the busiest hour, as a multiple of the day's average rate
// The server's own time per request when /api/status can't say: a static file takes it well under a millisecond.
const SERVER_SECONDS = 0.001;

type Month = {
  requests: number;
  egress: number;
  egressCost: number;
  billedSeconds: number;
  list: number;
  bill: number;
  capVisitsPerSecond: number;
  headroom: number;
};

/**
 * A month of days with `visits` visitors each. A single instance is billed while any request is in
 * flight; with visits and uptime checks arriving at random, that is 1 - e^(-load) of the day. When
 * this month has been measured, the model is anchored to it: the meters at this month's pace, plus
 * the model's difference for more or fewer visitors. The cap is CPU: each instance has one vCPU,
 * and a request takes the server about `perRequest` seconds of it.
 */
function month(p: CostPrices, visits: number, f: Footprint, report: CostReport | null, perRequest: number): Month {
  const probesPerDay = p.probes_per_minute * 1440;
  const days = report?.available ? report.month_days : 30;
  const busyPerDay = (v: number) => DAY * (1 - Math.exp(-((v / DAY) * BUSY_PER_VISIT + (p.probes_per_minute / 60) * p.billing_step_seconds)));
  let billed = busyPerDay(visits);
  let requests = probesPerDay + visits * f.requests;
  let egress = visits * f.bytes;
  if (report?.available && report.days >= 1) {
    const perDay = (x: number) => x / report.days;
    const v0 = paceOf(report, f);
    billed = Math.max(busyPerDay(0), perDay(report.usage.billable_seconds) + busyPerDay(visits) - busyPerDay(v0));
    requests = Math.max(probesPerDay, perDay(report.usage.requests) + (visits - v0) * f.requests);
    egress = Math.max(0, perDay(report.usage.egress_bytes) + (visits - v0) * f.bytes);
  }
  const m = { billed: billed * days, requests: requests * days, egress: egress * days };
  // vCPU-seconds per billed second: a little over one, because startup CPU boost doubles the CPU
  // while an instance starts. Measured when there is a month to measure.
  const vcpu = report?.available && report.usage.billable_seconds > 0 ? report.usage.vcpu_seconds / report.usage.billable_seconds : p.vcpu;
  const cpu = m.billed * vcpu * p.vcpu_second;
  const mem = m.billed * p.memory_gib * p.gib_second;
  const req = (m.requests / 1e6) * p.per_million_requests;
  const out = egressCost(m.egress / 2 ** 30, p);
  const free = Math.min(cpu, p.free_credit_vcpu) + Math.min(mem, p.free_credit_memory) + Math.min(req, p.free_credit_requests);
  const list = cpu + mem + req + out;
  const cap = (p.max_instances * Math.min(p.vcpu / perRequest, p.concurrency / perRequest)) / f.requests;
  const peak = (PEAK * visits) / DAY;
  return {
    requests: m.requests,
    egress: m.egress,
    egressCost: out,
    billedSeconds: m.billed,
    list,
    bill: list - free,
    capVisitsPerSecond: cap,
    headroom: peak > 0 ? cap / peak : Infinity,
  };
}

/** Visits a day at this month's pace: the requests that were not uptime checks, a visit's worth at a time. */
function paceOf(r: CostReport, f: Footprint): number {
  return Math.max(0, (r.usage.requests - r.probe_requests) / r.days / f.requests);
}

const toSlider = (v: number) => Math.round(Math.log10(Math.max(1, v)) * 100);
const fromSlider = (s: number) => Math.round(10 ** (s / 100));

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col-reverse justify-end">
      <dt className="mt-1 text-sm text-ink-2">{label}</dt>
      <dd className={strong ? "text-3xl font-semibold tracking-[-0.03em]" : "text-xl font-semibold tracking-[-0.02em]"}>{value}</dd>
    </div>
  );
}

/** What a busier month would cost, priced with the receipt's own list and this visit's footprint. */
export function WhatIf() {
  const { report, failed } = useCost();
  const measured = useFootprint();
  const status = useServerStatus();
  const id = useId();
  const f = measured ?? typical;
  // Kept unrounded, so "this month's pace" reproduces the receipt's projection to the cent.
  const pace = report?.available && report.days >= 1 ? Math.max(1, paceOf(report, f)) : null;
  const [visits, setVisits] = useState<number | null>(null);
  const v = visits ?? pace ?? 100;
  // The server's median time on a request, from its own status (never the reader's network).
  const p50 = status?.latency_ms.p50;
  const perRequest = p50 && p50 > 0 ? Math.max(0.0002, p50 / 1000) : SERVER_SECONDS;

  if (!report || !measured) {
    return (
      <p className="rounded-3xl border border-line bg-surface p-6 text-ink-2" role="status">
        {failed === "absent"
          ? "The what-if prices with the live price list, which this copy of the site can't reach."
          : failed === "down"
            ? "The what-if needs the live price list, which didn't load just now. Try again in a minute."
            : "Loading the price list…"}
      </p>
    );
  }
  const p = report.prices;
  const m = month(p, v, f, report, perRequest);
  const visitors = (x: number) => `${count(x)} ${x === 1 ? "visitor" : "visitors"} a day`;
  const headroom = m.headroom >= 10 ? count(m.headroom) : m.headroom.toFixed(1);
  const presets = [
    ...(pace ? [{ label: "This month's pace", visits: pace }] : []),
    { label: "A good day", visits: 1_000 },
    { label: "Hacker News front page", visits: 30_000 },
    { label: "Viral", visits: 300_000 },
  ];
  const hours = m.billedSeconds / 3600;
  return (
    <div className="grid gap-6 rounded-3xl border border-line bg-surface p-5 sm:p-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div>
        <label htmlFor={id} className="font-medium">
          Visitors a day
        </label>
        <p className="mt-1 text-4xl font-semibold tracking-[-0.04em] tabular-nums">{count(v)}</p>
        <input
          id={id}
          type="range"
          min={0}
          max={600}
          step={1}
          value={toSlider(v)}
          onChange={(e) => setVisits(fromSlider(Number(e.target.value)))}
          aria-valuetext={`${visitors(v)}: ${usd(m.bill)} a month to pay`}
          className="mt-4 w-full accent-[var(--accent-ink)]"
        />
        <div className="mt-1 flex justify-between font-mono text-[11px] text-ink-3" aria-hidden>
          <span>1</span>
          <span>1,000</span>
          <span>1,000,000</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {presets.map((s) => (
            <button
              key={s.label}
              type="button"
              aria-pressed={v === s.visits}
              onClick={() => setVisits(s.visits)}
              className="rounded-full border border-line px-3 py-1.5 text-sm text-ink-2 transition-colors hover:border-ink-3 hover:text-ink aria-pressed:border-accent-ink aria-pressed:text-ink"
            >
              {s.label}
              <span className="ml-1.5 font-mono text-xs text-ink-3">{count(s.visits)}</span>
            </button>
          ))}
        </div>
        <p className="mt-5 text-sm leading-relaxed text-ink-2">
          {f.measured ? (
            <>
              Each visitor is priced like your visit to this page: {f.requests} requests and {bytes(f.bytes)} over the wire. An instance stays
              billed for about {BUSY_PER_VISIT} s of it: three bursts of requests, each at least one 100 ms step.
            </>
          ) : (
            <>Each visitor is priced as a typical visit: 20 requests, 400 KiB, an instance billed for about {BUSY_PER_VISIT} s.</>
          )}{" "}
          The Hacker News number is a guess at a front-page day, not a measurement.
        </p>
      </div>

      <div>
        <h3 className="font-medium">A month of days like that</h3>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          <Stat label="to pay, after the free tier" value={usd(m.bill)} strong />
          <Stat label="at list price" value={usd(m.list)} />
          <Stat label="sent to the internet" value={bytes(m.egress)} />
          <Stat label="requests" value={count(m.requests)} />
          <Stat label="instance time billed" value={hours >= 10 ? `${count(hours)} h` : `${hours.toFixed(1)} h`} />
          <Stat label="busiest hour vs the cap" value={Number.isFinite(m.headroom) ? (m.headroom >= 1 ? `${headroom}× under` : "over") : "–"} />
        </dl>
        <p className="mt-6 text-sm leading-relaxed text-ink-2" aria-live="polite">
          {m.headroom >= 1
            ? `The ${p.max_instances}-instance cap would only bind at about ${count(m.capVisitsPerSecond)} visits a second (one vCPU each, at the server's own ${(perRequest * 1000).toFixed(1)} ms a request), so at this traffic it is a cost guard, not a limit.`
            : `At this traffic the busiest hour would pass the ${p.max_instances}-instance cap: Cloud Run would queue requests and turn some away.`}{" "}
          {m.bill > 0.01 && m.egressCost / m.bill > 0.8
            ? m.egressCost / m.bill >= 0.995
              ? "All of what is left to pay is data leaving Google's network."
              : `${Math.round((m.egressCost / m.bill) * 100)}% of what is left to pay is data leaving Google's network.`
            : ""}
        </p>
      </div>
    </div>
  );
}
