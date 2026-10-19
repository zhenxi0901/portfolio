import type { MetadataRoute } from "next";
import { cases } from "@/content/profile";
import { postmortems } from "@/content/postmortems";
import { posts } from "@/content/writing";
import { SITE_URL } from "@/lib/site";

// Static export: written once at build time as /sitemap.xml.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    ...cases.map((c) => ({ url: `${SITE_URL}/work/${c.id}`, changeFrequency: "monthly" as const, priority: 0.8 })),
    ...posts.map((p) => ({ url: `${SITE_URL}/writing/${p.slug}`, changeFrequency: "yearly" as const, priority: 0.7 })),
    ...postmortems.map((p) => ({ url: `${SITE_URL}/postmortems/${p.slug}`, changeFrequency: "yearly" as const, priority: 0.6 })),
  ];
}
