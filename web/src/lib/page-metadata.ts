import type { Metadata } from "next";
import { profile } from "@/content/profile";

/**
 * Metadata for a standalone page. A page's openGraph replaces the root layout's whole object, so
 * the card image is repeated here.
 */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const full = `${title} | ${profile.name}`;
  return {
    title: full,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: full,
      description,
      url: path,
      images: [{ url: "/img/og-card.png", width: 1200, height: 630, alt: `${profile.name}, ${profile.role}` }],
    },
    twitter: { card: "summary_large_image", title: full, description, images: ["/img/og-card.png"] },
  };
}
