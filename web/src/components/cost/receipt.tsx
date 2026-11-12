"use client";

import type { CostLine, CostReport } from "@/lib/api";
import { bytes, count, span, usd, useCost } from "./use-cost";

const unitLabel: Record<string, string> = { "vCPU-seconds": "vCPU-s", "GiB-seconds": "GiB-s", requests: "requests", GiB: "GiB" };

function quantity(l: CostLine): string {
  if (l.unit === "GiB") return `${l.quantity.toFixed(2)} GiB`;
  return `${count(l.quantity)} ${unitLabel[l.unit] ?? l.unit}`;
}

function price(l: CostLine): string {
  if (l.unit === "requests") return `US$${(l.price * 1e6).toFixed(2)} per million`;
  return `US$${l.price < 0.01 ? l.price.toFixed(7).replace(/0+$/, "") : l.price.toFixed(2)} each`;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/** Bars drawn from the month's request count: decoration, so every receipt looks a little different. */
function Barcode({ seed }: { seed: number }) {
  const digits = String(Math.max(1, Math.round(seed))).padStart(8, "7").split("").map(Number);
  let x = 0;
  const bars: { x: number; w: number }[] = [];
  for (const d of [...digits, ...digits.slice().reverse()]) {
    const w = 1 + (d % 3);
    bars.push({ x, w });
    x += w + 1 + ((d * 7) % 3);
  }
  return (
    <svg viewBox={`0 0 ${x} 28`} className="mx-auto mt-4 h-7 w-44" aria-hidden preserveAspectRatio="none">
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={28} className="fill-ink-2" />
      ))}
    </svg>
  );
}

function Row({ label, value, strong = false, sub }: { label: string; value: string; strong?: boolean; sub?: string }) {
  return (
    <tr>
      <th scope="row" className={`py-1.5 pr-3 text-left align-top ${strong ? "font-semibold" : "font-normal"}`}>
        {label}
        {sub && <span className="block text-[11px] leading-snug text-ink-3">{sub}</span>}
      </th>
      <td className={`py-1.5 text-right align-top tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</td>
    </tr>
  );
}

function Paper({ children, busy = false }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <figure className="receipt mx-auto w-full max-w-[440px]" aria-busy={busy || undefined}>
      <div className="receipt-paper px-6 pb-9 pt-10 font-mono text-[13px] leading-relaxed text-ink">{children}</div>
    </figure>
  );
}

function Header({ report }: { report: CostReport | null }) {
  return (
    <header className="text-center">
      <p className="text-sm font-semibold tracking-[0.18em]">PORTFOLIO · CLOUD RUN</p>
      <p className="text-ink-3">asia-southeast1 · request-based billing</p>
      {report?.available && (
        <p className="text-ink-3">
          {span(report.start, report.end)} · {report.days.toFixed(1)} days
        </p>
      )}
    </header>
  );
}

const rule = "my-4 border-t border-dashed border-line-strong";

/** This month's usage as a shop receipt: each meter at list price, the free tier, and what is left. */
export function CostReceipt() {
  const { report, failed } = useCost();

  if (!report) {
    return (
      <Paper busy={!failed}>
        <Header report={null} />
        <hr className={rule} />
        <p role="status" className="py-10 text-center text-ink-2">
          {failed ? "The meters aren't reachable from this copy of the site. On the live site this receipt is printed from Cloud Monitoring." : "Reading this month's meters…"}
        </p>
      </Paper>
    );
  }

  if (!report.available) {
    const p = report.prices;
    return (
      <Paper>
        <Header report={report} />
        <hr className={rule} />
        <p className="text-ink-2">{report.reason} The price list it uses:</p>
        <table className="mt-3 w-full">
          <caption className="sr-only">List prices for this service, US dollars</caption>
          <tbody>
            <Row label="CPU" value={`US$${p.vcpu_second}`} sub="per vCPU-second" />
            <Row label="Memory" value={`US$${p.gib_second}`} sub="per GiB-second" />
            <Row label="Requests" value={`US$${p.per_million_requests.toFixed(2)}`} sub="per million" />
            <Row label="Data to the internet" value={`US$${p.per_gib_egress.toFixed(2)}`} sub="per GiB" />
          </tbody>
        </table>
        <p className="mt-4 text-center text-[11px] text-ink-3">List prices as of {p.as_of}</p>
      </Paper>
    );
  }

  return (
    <Paper>
      <Header report={report} />
      <hr className={rule} />
      <table className="w-full">
        <caption className="sr-only">This month&apos;s usage at list price, in US dollars</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {report.lines.map((l) => (
            <Row key={l.item} label={l.item} value={usd(l.cost)} sub={`${quantity(l)} × ${price(l)}`} />
          ))}
        </tbody>
        <tbody className="border-t border-dashed border-line-strong">
          <Row label="List price" value={usd(report.list_price)} />
          <Row label="Free tier" value={usd(-report.free_tier)} sub="CPU, memory and requests, per billing account" />
        </tbody>
        <tfoot className="border-t-4 border-double border-line-strong">
          <Row label="To pay, estimated" value={usd(report.bill)} strong />
        </tfoot>
      </table>
      <hr className={rule} />
      {report.projected_list_price > 0 && (
        <p className="text-ink-2">
          The whole month at this pace: {usd(report.projected_list_price)} at list price, {usd(report.projected_bill)} to pay.
        </p>
      )}
      <p className="mt-1 text-ink-2">
        {usd(report.per_ten_thousand)} per 10,000 requests · {bytes(report.usage.egress_bytes)} sent
      </p>
      <hr className={rule} />
      <p className="text-center text-[11px] text-ink-3">
        List prices as of {report.prices.as_of} · meters read {time(report.updated)} UTC
        {report.stale && <span className="block">Cloud Monitoring isn&apos;t answering; this is the last good reading.</span>}
      </p>
      <Barcode seed={report.usage.requests} />
    </Paper>
  );
}
