import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";
import { products } from "@/content/products";
import { aiStats } from "@/content/ai-platform";

export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

export const alt = "The AI agent platform: a chapter of Li ZhenXi's portfolio";

export default function Image() {
  return ogImage({
    eyebrow: "Chapter · AI agent platform",
    eyebrowColor: ogTone.ai,
    title: "The AI agent platform I run on Google Cloud",
    summary: products.ai.what,
    stats: aiStats,
  });
}
