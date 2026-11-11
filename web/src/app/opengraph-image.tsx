import { stats } from "@/content/profile";
import { ogContentType, ogImage, ogSize } from "@/lib/og";

export const alt = "Li ZhenXi: SRE, cloud and AI infrastructure";
export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

// The share card shows the same numbers as the hero, read from the same list, so it cannot fall
// behind the site again (it said 63 merged PRs for weeks after the site said 169).
const stat = (value: number) => {
  const s = stats.find((x) => x.value === value);
  if (!s) throw new Error(`opengraph-image: no hero stat with value ${value}`);
  return { value: `${s.prefix ?? ""}${s.value}${s.suffix ?? ""}`, label: s.label };
};

export default function Image() {
  return ogImage({
    eyebrow: "Open to 2027 roles",
    title: "Li ZhenXi",
    summary: "I run cloud platforms in production and benchmark AI infrastructure.",
    big: true,
    stats: [stat(15), stat(169), stat(320)],
  });
}
