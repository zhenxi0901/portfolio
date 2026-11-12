import { ArticleShell } from "@/components/article/article-shell";
import { DrillPicker } from "@/components/oncall/drill-picker";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "You're on call: incident drills",
  description:
    "Two simulated incidents, one on a building IoT platform and one on an AI agent platform. Investigate, stop the error budget burning, and get your own postmortem.",
  path: "/oncall",
});

export default function OnCallPage() {
  return (
    <ArticleShell back={{ href: "/", label: "Home" }} wide>
      <p className="mt-8 font-mono text-xs text-ink-3">Incident drills · simulated</p>
      <h1 className="mt-4 text-[clamp(2.5rem,6vw,4.25rem)] font-semibold leading-[1] tracking-[-0.045em]">You&apos;re on call.</h1>
      <p className="mt-6 max-w-[62ch] text-lg leading-relaxed text-ink-2">
        Two made-up incidents, one on each platform I run. Pick one, and the clock only moves when you do.
      </p>
      <DrillPicker />
    </ArticleShell>
  );
}
