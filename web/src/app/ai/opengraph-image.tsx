import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";
import { cases } from "@/content/profile";
import { products } from "@/content/products";

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
    stats: cases.find((c) => c.id === "ai-platform")!.numbers,
  });
}
