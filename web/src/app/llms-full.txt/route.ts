import { llmsFullTxt } from "@/lib/markdown";

// Emitted as a static file at build time: every fact on the site, as one Markdown document.
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsFullTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
