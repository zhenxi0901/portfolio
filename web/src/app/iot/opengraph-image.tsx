import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";
import { cases } from "@/content/profile";
import { products } from "@/content/products";
import { heroStat } from "@/content/headlines";

export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

export const alt = "The building IoT platform: a chapter of Li ZhenXi's portfolio";

export default function Image() {
  const studies = cases.filter((c) => c.products[0] === "iot").length;
  return ogImage({
    eyebrow: "Chapter · Building IoT platform",
    eyebrowColor: ogTone.iot,
    title: "The building IoT platform I run on GKE",
    summary: products.iot.what,
    stats: [{ value: String(studies), label: "case studies, each a working model" }, heroStat(169), heroStat(15)],
  });
}
