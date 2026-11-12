import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { ArticleShell, Part } from "@/components/article/article-shell";
import { CostReceipt } from "@/components/cost/receipt";
import { CostInsights } from "@/components/cost/insights";
import { WhatIf } from "@/components/cost/what-if";
import { CostGuardrails } from "@/components/cost/guardrails";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "What this site costs",
  description:
    "This site's Cloud Run bill this month, metered request by request at Google's list prices: where the money goes, what a spike would cost, and what caps it.",
  path: "/cost",
});

const REPO = "https://github.com/zhenxi0901/portfolio";

const ext = "inline-flex items-center gap-0.5 underline underline-offset-4 hover:text-ink";

export default function CostPage() {
  return (
    <ArticleShell back={{ href: "/status", label: "Status" }} wide>
      <p className="mt-8 font-mono text-xs text-ink-3">Cloud Run · asia-southeast1 · request-based billing</p>
      <h1 id="cost" className="mt-4 scroll-mt-28 text-[clamp(2.25rem,5.5vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
        What this site costs
      </h1>
      <p className="mt-4 max-w-[64ch] text-lg leading-relaxed text-ink-2">
        Every request to this site is metered. This is the month so far, read from Cloud Monitoring and priced at Google&apos;s list prices:
        what it costs, where the money goes, and what a busy day would do to it.
      </p>

      <div className="mt-12 grid items-start gap-10 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-12">
        <CostReceipt />
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Where the money goes</h2>
          <div className="mt-5">
            <CostInsights />
          </div>
        </div>
      </div>

      <Part title="What if it got busy?" aside="priced with the receipt's list">
        <WhatIf />
      </Part>

      <Part title="What stops a runaway bill">
        <CostGuardrails />
      </Part>

      <Part title="How this is measured">
        <div className="max-w-[72ch] space-y-4 text-[15px] leading-relaxed text-ink-2">
          <p>
            <strong className="font-medium text-ink">Usage</strong> is Cloud Monitoring&apos;s own metering of this service: requests, billed
            instance time, CPU and memory allocation, and bytes sent to the internet, summed from the start of the month (UTC). The Go server
            reads it with the identity it already uses for the{" "}
            <a href="/status" className="underline underline-offset-4 hover:text-ink">
              SLO
            </a>
            , at most once an hour.{" "}
            <a href={`${REPO}/tree/main/api/internal/cost`} target="_blank" rel="noreferrer" className={ext}>
              The code
              <ArrowUpRight size={12} aria-hidden />
            </a>
          </p>
          <p>
            <strong className="font-medium text-ink">Prices</strong> are Google&apos;s list prices in US dollars on 12 November 2026:{" "}
            <a href="https://cloud.google.com/run/pricing" target="_blank" rel="noreferrer" className={ext}>
              Cloud Run with request-based billing in Singapore
              <ArrowUpRight size={12} aria-hidden />
            </a>
            , a Tier 2 region, and{" "}
            <a href="https://cloud.google.com/vpc/network-pricing" target="_blank" rel="noreferrer" className={ext}>
              Premium Tier data transfer out of Singapore
              <ArrowUpRight size={12} aria-hidden />
            </a>
            . The billing account pays in Singapore dollars at Google&apos;s own price list, and its month runs on Pacific time, so the invoice
            will not match to the cent.
          </p>
          <p>
            <strong className="font-medium text-ink">Not on the receipt</strong>, because each stays inside its free allowance: image storage
            (about 0.5 GiB, held there by a cleanup policy), the uptime checks themselves (about 130,000 a month of a million free), logs and
            traces.
          </p>
          <p>The invoice itself is only in the billing console. This page is an estimate from the same meters the invoice is built from.</p>
        </div>
      </Part>
    </ArticleShell>
  );
}
