import type { Metadata } from "next";
import { profile } from "@/content/profile";

/** Metadata for a standalone page. Its share image is the opengraph-image route beside the page. */
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
    },
    twitter: { card: "summary_large_image", title: full, description },
  };
}
