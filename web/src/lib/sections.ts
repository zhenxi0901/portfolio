// Which page each section lives on. Until November 2026 every section was on the home page; it was
// split into chapters (decision 11), and links, the Ask console's sources, the palette, the tour
// and the MCP server all find a section through this table rather than assuming "/#id".
import { cases } from "@/content/profile";
import type { ProductKey } from "@/content/products";

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

/** A link to a section from anywhere: "/iot#platform", or just "/" for the top of the home page. */
export function sectionHref(id: string): string {
  return id === "top" ? "/" : `${pageOf(id)}#${id}`;
}
