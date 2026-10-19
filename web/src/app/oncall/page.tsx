import { ArticleShell } from "@/components/article/article-shell";
import { ProductTag } from "@/components/site/product-tag";
import { Drill } from "@/components/oncall/drill";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "You're on call: an incident drill",
  description:
    "A simulated incident on a building IoT platform, built from its real alerts, dashboards and runbook. Investigate, mitigate, and get your own postmortem.",
  path: "/oncall",
});

export default function OnCallPage() {
  return (
    <ArticleShell back={{ href: "/#platform", label: "Inside the IoT platform" }} wide>
      <p className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ProductTag p="iot" />
        <span className="font-mono text-xs text-ink-3">Incident drill · simulated</span>
      </p>
      <h1 className="mt-4 text-[clamp(2.5rem,6vw,4.25rem)] font-semibold leading-[1] tracking-[-0.045em]">You&apos;re on call.</h1>
      <p className="mt-6 max-w-[62ch] text-lg leading-relaxed text-ink-2">
        It is 02:14 and the pager goes off. The alert, the Grafana pages, the runbook and its guardrail are the ones I built for the
        building IoT platform. The incident is made up, and the clock only moves when you do.
      </p>
      <Drill />
    </ArticleShell>
  );
}
