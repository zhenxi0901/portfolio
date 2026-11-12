import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";
import { products } from "@/content/products";
import { heroStat } from "@/lib/og-stat";

export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

export const alt = "Research, ARIES agent benchmarks: a chapter of Li ZhenXi's portfolio";

export default function Image() {
  return ogImage({
    eyebrow: "Chapter · ARIES agent benchmarks",
    eyebrowColor: ogTone.aries,
    title: "What it costs to serve long-running LLM agents",
    summary: products.aries.what,
    stats: [heroStat(320), heroStat(3.02), { value: "A100", label: "and a hosted API, measured side by side" }],
  });
}
