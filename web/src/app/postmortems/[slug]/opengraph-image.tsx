import { postmortems } from "@/content/postmortems";
import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";

export const alt = "A blameless postmortem by Li ZhenXi";
export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

export function generateStaticParams() {
  return postmortems.map((p) => ({ slug: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pm = postmortems.find((p) => p.slug === slug)!;
  return ogImage({
    eyebrow: `Postmortem · ${pm.kind}`,
    eyebrowColor: pm.kind === "Near miss" ? ogTone.critical : ogTone.ai,
    title: pm.title,
    summary: pm.summary,
    stats: pm.stats,
  });
}
