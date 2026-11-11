import { markdownPages } from "@/lib/markdown";

// Markdown copies of the pages, emitted as static files at build time: /md/work/gke.md and so on.
// /llms.txt links to them, and each HTML page names its copy in a <link rel="alternate">.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return markdownPages.map((p) => ({ path: p.path.split("/") }));
}

export async function GET(_: Request, ctx: RouteContext<"/md/[...path]">) {
  const { path } = await ctx.params;
  const page = markdownPages.find((p) => p.path === path.join("/"));
  if (!page) return new Response("Not found", { status: 404 });
  return new Response(page.body() + "\n", { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
