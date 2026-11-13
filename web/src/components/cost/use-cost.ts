"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type CostPrices, type CostReport, type Status } from "@/lib/api";

// One request per page load, shared by the receipt, the insights and the what-if.
let costRequest: Promise<CostReport> | null = null;
let statusRequest: Promise<Status> | null = null;

/**
 * Why the report did not load: "absent" when this copy of the site has no API (a 404), "down"
 * when the live API answered with an error or not at all, so trying again later may work.
 */
export type CostFailure = "absent" | "down";
export type CostState = { report: CostReport | null; failed: CostFailure | null };

/** This month's cost report: null while it loads, with the reason if it could not be read. */
export function useCost(): CostState {
  const [state, setState] = useState<CostState>({ report: null, failed: null });
  useEffect(() => {
    let alive = true;
    (costRequest ??= api.cost())
      .then((report) => alive && setState({ report, failed: null }))
      .catch((err: unknown) => {
        costRequest = null;
        if (alive) setState({ report: null, failed: err instanceof ApiError && err.status === 404 ? "absent" : "down" });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** The instance's own status, for the median time it spends on a request; null if unavailable. */
export function useServerStatus(): Status | null {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let alive = true;
    (statusRequest ??= api.status())
      .then((s) => alive && setStatus(s))
      .catch(() => {
        statusRequest = null;
      });
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

/** US dollars: fractions of a cent are the point of this page, so small amounts keep four places. */
export function usd(x: number): string {
  const sign = x < 0 ? "−" : "";
  const v = Math.abs(x);
  if (v === 0) return "US$0";
  if (v >= 100) return `${sign}US$${Math.round(v).toLocaleString("en-US")}`;
  if (v >= 1) return `${sign}US$${v.toFixed(2)}`;
  return `${sign}US$${v.toFixed(4)}`;
}

export function count(x: number, digits = 0): string {
  return x.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** What sending g GiB to the internet in a month costs, band by band (one flat price on older servers). */
export function egressCost(g: number, p: CostPrices): number {
  const tiers = p.egress_tiers?.length ? p.egress_tiers : [{ per_gib: p.per_gib_egress }];
  let cost = 0;
  let from = 0;
  for (const t of tiers) {
    if (t.up_to_gib === undefined || g <= t.up_to_gib) return cost + Math.max(0, g - from) * t.per_gib;
    cost += (t.up_to_gib - from) * t.per_gib;
    from = t.up_to_gib;
  }
  return cost;
}

export function bytes(b: number): string {
  if (b >= 2 ** 40) return `${(b / 2 ** 40).toFixed(2)} TiB`;
  if (b >= 100 * 2 ** 30) return `${Math.round(b / 2 ** 30).toLocaleString("en-US")} GiB`;
  if (b >= 1 << 30) return `${(b / (1 << 30)).toFixed(2)} GiB`;
  if (b >= 1 << 20) return `${(b / (1 << 20)).toFixed(1)} MiB`;
  return `${Math.round(b / 1024).toLocaleString("en-US")} KiB`;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** "1 Nov to 12 Nov 2026" */
export function span(start: string, end: string): string {
  return `${day(start)} to ${day(end)} ${new Date(end).getUTCFullYear()}`;
}
