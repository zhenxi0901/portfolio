import { cases } from "@/content/profile";
import { products } from "@/content/products";
import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";

export const alt = "A case study by Li ZhenXi";
export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

export function generateStaticParams() {
  return cases.map((c) => ({ slug: c.id }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = cases.find((x) => x.id === slug)!;
  const p = c.products[0];
  return ogImage({
    eyebrow: `Case study · ${products[p].name}`,
    eyebrowColor: ogTone[p],
    title: c.title,
    summary: c.summary,
    stats: c.numbers,
  });
}
