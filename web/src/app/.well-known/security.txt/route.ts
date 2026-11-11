import { profile } from "@/content/profile";
import { SITE_URL } from "@/lib/site";

// RFC 9116. Emitted as a static file at build time. Expires is a year from the build, and every
// push rebuilds the site, so it never goes stale while the site is maintained.
export const dynamic = "force-static";

export function GET() {
  const expires = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10) + "T00:00:00.000Z";
  const body = [
    `Contact: mailto:${profile.email}`,
    `Expires: ${expires}`,
    `Preferred-Languages: en`,
    `Canonical: ${SITE_URL}/.well-known/security.txt`,
    `Policy: ${profile.github}/portfolio/blob/main/SECURITY.md`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
