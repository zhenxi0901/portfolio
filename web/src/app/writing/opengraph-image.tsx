import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";
import { postmortems } from "@/content/postmortems";
import { posts } from "@/content/writing";

export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

export const alt = "Writing and postmortems by Li ZhenXi";

export default function Image() {
  return ogImage({
    eyebrow: "Writing and postmortems",
    eyebrowColor: ogTone.accent,
    title: "Notes from running real systems",
    summary: "What serving LLM agents taught me, a benchmark run without root, a metrics bill found in orphaned topics, and blameless postmortems of what broke here.",
    stats: [
      { value: String(posts.length), label: "posts, with the numbers behind them" },
      { value: String(postmortems.length), label: "blameless postmortems from running this site" },
    ],
  });
}
