import { incidents } from "@/content/status";
import { profile } from "@/content/profile";
import { SITE_URL } from "@/lib/site";

// Emitted as a static file at build time: /status/feed.xml, an Atom feed of the incident history.
export const dynamic = "force-static";

// Ids are tag: URIs, not URLs, so they stay the same if the site moves to its own domain; a feed
// reader would otherwise show every incident again as new.
const TAG = "tag:zhenxi0901.github.io,2026";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function GET() {
  const updated = incidents[0]?.iso ?? new Date(0).toISOString();
  const entries = incidents
    .map(
      (i) => `  <entry>
    <id>${TAG}:${esc(i.id)}</id>
    <title>${esc(`${i.kind}: ${i.title}`)}</title>
    <link rel="alternate" href="${SITE_URL}${i.href}"/>
    <updated>${i.iso}</updated>
    <summary>${esc(i.summary)}</summary>
  </entry>`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(profile.name)}'s portfolio: incidents</title>
  <subtitle>Incidents, near misses and failed releases of this site, each with a blameless write-up.</subtitle>
  <id>${TAG}:portfolio-status</id>
  <link rel="alternate" href="${SITE_URL}/status"/>
  <link rel="self" href="${SITE_URL}/status/feed.xml"/>
  <updated>${updated}</updated>
  <author><name>${esc(profile.name)}</name></author>
${entries}
</feed>
`;
  return new Response(xml, { headers: { "Content-Type": "application/atom+xml; charset=utf-8" } });
}
