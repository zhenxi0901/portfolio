import { posts } from "@/content/writing";
import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";

export const alt = "Writing by Li ZhenXi";
export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = posts.find((p) => p.slug === slug)!;
  return ogImage({
    eyebrow: `Writing · ${post.date}`,
    eyebrowColor: ogTone[post.product],
    title: post.title,
    summary: post.summary,
    stats: post.stats,
  });
}
