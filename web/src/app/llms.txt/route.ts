import { llmsTxt } from "@/lib/markdown";

// Emitted as a static file at build time: an index of the site for AI agents (llmstxt.org).
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
