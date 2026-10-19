import generated from "@/content/generated/changelog.json";
import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";

export const alt = "Changelog of Li ZhenXi's portfolio";
export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

type Entry = { kind: string; commits?: unknown[] };

export default function Image() {
  const entries = (generated as { entries: Entry[] }).entries;
  const releases = entries.filter((e) => e.kind === "deploy");
  const commits = releases.reduce((n, e) => n + (e.commits?.length ?? 0), 0);
  return ogImage({
    eyebrow: "Changelog · written by the pipeline",
    eyebrowColor: ogTone.accent,
    title: "Every release of this site, and what it shipped.",
    summary: "Built once, checked before it takes traffic, rolled back on its own if the live checks fail. Drills included.",
    stats: [
      { value: String(releases.length), label: "releases to production" },
      { value: String(commits), label: "commits shipped" },
      { value: String(entries.filter((e) => e.kind === "drill").length), label: "rollback drills" },
    ],
  });
}
