"use client";

import { count, usd, useCost, useServerStatus } from "./use-cost";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <h3 className="text-lg font-semibold leading-snug tracking-[-0.02em]">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{children}</p>
    </li>
  );
}

/** "7 in 10" for a share of at least one in ten, a percentage below that. */
function share(x: number): string {
  return x >= 0.095 ? `${Math.round(x * 10)} in 10` : `${Math.max(1, Math.round(x * 100))}%`;
}

/** Three things the receipt says that are not obvious from a price list. */
export function CostInsights() {
  const { report } = useCost();
  const status = useServerStatus();
  if (!report?.available) {
    return (
      <ul className="grid content-start gap-3" aria-busy={!report || undefined}>
        <Card title="Where the money goes">
          On the live site this part reads the month&apos;s meters and says where the time and money went: how much of the traffic is the site
          watching itself, what Cloud Run&apos;s 100 ms billing step does to a fast server, and what the free tier does not cover.
        </Card>
      </ul>
    );
  }
  const r = report;
  const compute = r.lines.slice(0, 3).reduce((sum, l) => sum + l.cost, 0);
  const egress = r.lines[3];
  const billedMs = r.billed_seconds_per_request * 1000;
  const p50 = status?.latency_ms.p50;
  return (
    <ul className="grid content-start gap-3">
      <Card title={`${share(r.probe_share)} requests are the site checking on itself`}>
        Uptime checks call /api/health once a minute from three regions: about {count(r.probe_requests)} of this month&apos;s{" "}
        {count(r.usage.requests)} requests. Knowing the site is up is most of its traffic.
      </Card>
      <Card title={`Billed ${Math.round(billedMs)} ms a request${p50 !== undefined ? `, for ${p50.toFixed(1)} ms of work` : ""}`}>
        Cloud Run bills an instance&apos;s busy time in 100 ms steps, and a lone uptime check keeps an instance busy for a whole step. About{" "}
        {Math.round(r.probe_billed_share * 100)}% of the billed time is the site answering its own checks
        {p50 !== undefined ? "; the median request takes the server well under a millisecond" : ""}.
      </Card>
      {r.free_tier >= compute - 1e-9 ? (
        <Card title="The free tier pays for the compute">
          CPU, memory and requests list at {usd(compute)} so far, inside a free tier worth {usd(r.prices.free_credit_vcpu)} a month in CPU
          alone. Data leaving Google&apos;s network has no free allowance from Singapore, so the {egress.quantity.toFixed(2)} GiB sent is the{" "}
          {usd(r.bill)} left to pay.
        </Card>
      ) : (
        <Card title="A busy month: past the free tier">
          CPU, memory and requests list at {usd(compute)} so far, and the free tier covers {usd(r.free_tier)} of it. Data leaving
          Google&apos;s network ({egress.quantity.toFixed(2)} GiB, {usd(egress.cost)}) has no free allowance from Singapore.
        </Card>
      )}
    </ul>
  );
}
