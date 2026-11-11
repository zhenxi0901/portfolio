import type { Metadata } from "next";
import { profile } from "@/content/profile";

/**
 * Metadata for a standalone page. Its share image is the opengraph-image route beside the page.
 * `markdown` is the page's Markdown copy under /md/ (lib/markdown.ts), announced to agents.
 */
export function pageMetadata({ title, description, path, markdown }: { title: string; description: string; path: string; markdown?: string }): Metadata {
  const full = `${title} | ${profile.name}`;
  return {
    title: full,
    description,
    alternates: { canonical: path, ...(markdown ? { types: { "text/markdown": `/md/${markdown}` } } : {}) },
    openGraph: {
      type: "article",
      title: full,
      description,
      url: path,
    },
    twitter: { card: "summary_large_image", title: full, description },
  };
}
