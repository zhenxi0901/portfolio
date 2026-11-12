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
    // The chapters (decision 11). /v1, the one-page version, is left out: it asks not to be indexed.
    { url: `${SITE_URL}/iot`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/ai`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/research`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/writing`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/oncall`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/status`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/cost`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/changelog`, changeFrequency: "daily", priority: 0.5 },
    { url: `${SITE_URL}/decisions`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/agents`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/evidence`, changeFrequency: "monthly", priority: 0.7 },
    ...cases.map((c) => ({ url: `${SITE_URL}/work/${c.id}`, changeFrequency: "monthly" as const, priority: 0.8 })),
    ...posts.map((p) => ({ url: `${SITE_URL}/writing/${p.slug}`, changeFrequency: "yearly" as const, priority: 0.7 })),
    ...postmortems.map((p) => ({ url: `${SITE_URL}/postmortems/${p.slug}`, changeFrequency: "yearly" as const, priority: 0.6 })),
  ];
}
