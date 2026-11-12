import { chapterHeadline } from "@/content/headlines";
import { ogContentType, ogImage, ogSize } from "@/lib/og";

export const alt = "Li ZhenXi: SRE, cloud and AI infrastructure";
export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

// The share card shows the home page's three chapter numbers, read from the same list as its cards,
// so the two cannot disagree (it once said 63 merged PRs for weeks after the site said 169).
export default function Image() {
  return ogImage({
    eyebrow: "Open to 2027 roles",
    title: "Li ZhenXi",
    summary: "I run cloud platforms in production and benchmark AI infrastructure.",
    big: true,
    stats: [chapterHeadline.iot, chapterHeadline.ai, chapterHeadline.aries],
  });
}
