// Which page each section lives on. Until November 2026 every section was on the home page; it was
// split into chapters (decision 11), and links, the Ask console's sources, the palette, the tour
// and the MCP server all find a section through this table rather than assuming "/#id".
import { cases } from "@/content/profile";
import { productOrder, type ProductKey } from "@/content/products";

/** Each product's chapter page. */
export const productPage: Record<ProductKey, string> = { iot: "/iot", ai: "/ai", aries: "/research" };

const PAGE: Record<string, string> = {
  top: "/",
  now: "/",
  chapters: "/",
  explore: "/",
  latest: "/",
  contact: "/",
  work: "/iot",
  platform: "/iot",
  ai: "/ai",
  "ai-views": "/ai",
  research: "/research",
  about: "/about",
  experience: "/about",
  stack: "/about",
  ask: "/about",
  writing: "/writing",
  postmortems: "/writing",
  status: "/status",
  oncall: "/oncall",
};

/** The page a section is on. Case studies follow their product; tab deep links follow their section. */
export function pageOf(id: string): string {
  if (Object.hasOwn(PAGE, id)) return PAGE[id];
  if (id.startsWith("case-")) {
    const c = cases.find((x) => `case-${x.id}` === id);
    return c ? productPage[c.products[0]] : "/";
  }
  if (id.startsWith("work-")) return Object.hasOwn(productPage, id.slice(5)) ? productPage[id.slice(5) as ProductKey] : "/iot";
  if (id.startsWith("platform-")) return "/iot";
  if (id.startsWith("ai-")) return "/ai";
  return "/";
}

/** Every id that was on the home page before the split and is on another page now, with that page. */
export function movedFromHome(): Record<string, string> {
  // A group of cards per product that has cases. The AI platform's existed for a few hours on
  // 11 Nov 2026, before its case moved into its own section; a link to it still lands on /ai.
  const groups = productOrder.filter((p) => cases.some((c) => c.products[0] === p)).map((p) => `work-${p}`);
  const ids = [...Object.keys(PAGE), ...cases.map((c) => `case-${c.id}`), ...groups];
  return Object.fromEntries(ids.map((id) => [id, pageOf(id)]).filter(([, page]) => page !== "/"));
}

/** The chapters, in reading order: the dock, the top bar and the pager follow it. */
export const CHAPTER_PATHS = ["/", "/iot", "/ai", "/research", "/writing", "/about"];

/**
 * The chapter a page belongs to: the chapter itself, a case study's product chapter, or Writing
 * for a post or a postmortem. Pages of their own (status, drills, decisions...) belong to none.
 */
export function chapterOf(path: string): string | null {
  const p = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  if (CHAPTER_PATHS.includes(p)) return p;
  if (p.startsWith("/work/")) {
    const page = pageOf(`case-${p.slice("/work/".length)}`);
    return page === "/" ? null : page;
  }
  if (p.startsWith("/writing/") || p.startsWith("/postmortems/")) return "/writing";
  return null;
}

/** A link to a section from anywhere: "/iot#platform", or just "/" for the top of the home page. */
export function sectionHref(id: string): string {
  return id === "top" ? "/" : `${pageOf(id)}#${id}`;
}
