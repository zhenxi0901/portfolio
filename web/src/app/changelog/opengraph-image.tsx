import generated from "@/content/generated/changelog.json";
import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";

export const alt = "Changelog of Li ZhenXi's portfolio";
export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

type Totals = { releases: number; commits: number; drills: number };

export default function Image() {
  const { totals } = generated as { totals: Totals };
  return ogImage({
    eyebrow: "Changelog · written by the pipeline",
    eyebrowColor: ogTone.accent,
    title: "Every release of this site, and what it shipped.",
    summary: "Built once, checked before it takes traffic, rolled back on its own if the live checks fail. Drills included.",
    stats: [
      { value: String(totals.releases), label: "releases to production" },
      { value: String(totals.commits), label: "commits shipped" },
      { value: String(totals.drills), label: "rollback drills" },
    ],
  });
}
