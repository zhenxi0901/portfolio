"use client";

import { usd, useCost } from "./use-cost";

/** What bounds the bill, and the one meter nothing bounds. The ceiling comes from the live price list. */
export function CostGuardrails() {
  const { report } = useCost();
  const p = report?.prices;
  const rows: { what: string; how: React.ReactNode }[] = [
    {
      what: "Scale to zero",
      how: "No instance runs while nobody is visiting, so a quiet hour costs only its uptime checks.",
    },
    {
      what: `At most ${p?.max_instances ?? 3} instances`,
      how: p ? (
        <>
          Flat out for 30 days, compute would list at {usd(p.ceiling_per_month)}: a ceiling on CPU and memory however busy the site gets.
          The what-if above shows how far below it real traffic sits.
        </>
      ) : (
        "The instance cap is a ceiling on CPU and memory however busy the site gets."
      ),
    },
    {
      what: "Rate limits where a request does work",
      how: "Ask answers 8 questions a minute per client, the contact form takes 3 messages per 10 minutes, and the MCP server 60 requests a minute.",
    },
    {
      what: "The fault-injection lab's own limits",
      how: (
        <>
          <a href="/break" className="underline underline-offset-4 hover:text-ink">
            Break it yourself
          </a>{" "}
          is the one page where a visitor can make the server hold requests open, so it has its own caps: 1.5 s a hold, 24 held at once on
          an instance, 240 requests a minute per visitor.
        </>
      ),
    },
    {
      what: "A S$1 budget alert",
      how: "On the billing account, so a surprise reaches my inbox before it reaches an invoice.",
    },
    {
      what: "Not capped: bandwidth",
      how: "Data out has no ceiling of its own. The budget alert is the tripwire, and a CDN in front of the site would be the fix if traffic ever made it matter.",
    },
  ];
  return (
    <ul className="divide-y divide-line rounded-3xl border border-line bg-surface">
      {rows.map((r) => (
        <li key={r.what} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-baseline sm:gap-6 sm:p-5">
          <span className="w-56 shrink-0 font-medium">{r.what}</span>
          <span className="flex-1 text-[15px] leading-relaxed text-ink-2">{r.how}</span>
        </li>
      ))}
    </ul>
  );
}
