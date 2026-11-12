import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { pageOf, sectionHref } from "@/lib/sections";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Go to another page of the site. Each page is its own static file, so a full navigation is the
 * simplest thing that always works.
 */
export function goTo(path: string) {
  window.location.assign(path);
}

/** Jump to a tab of the "Inside the platform" section; from another page, via its deep link. */
export function openPlatformTab(tab: "paths" | "signals" | "cost") {
  if (!document.getElementById("platform")) return goTo(`${pageOf("platform")}#platform-${tab}`);
  window.dispatchEvent(new CustomEvent("platform-tab", { detail: tab }));
  scrollToId("platform");
}

/** Open a tab of the AI agent platform section and scroll to its views; from another page, via its deep link. */
export function openAiTab(tab: "map" | "stack" | "trace" | "measure") {
  if (!document.getElementById("ai-views")) return goTo(`${pageOf("ai-views")}#ai-${tab}`);
  window.dispatchEvent(new CustomEvent("ai-tab", { detail: tab }));
  scrollToId("ai-views");
}

/**
 * Whether the palette or the terminal is open. Both are Radix dialogs, which carry
 * data-state="open"; the tour's own card is a dialog too, but not one of these.
 */
export const modalOpen = () => typeof document !== "undefined" && document.querySelector('[role="dialog"][data-state="open"]') !== null;

/**
 * Scroll to a section by id, honouring reduced motion. On another page, go to the page it lives
 * on. `focus` also moves keyboard focus there, for jumps a keyboard user makes (the dock).
 */
export function scrollToId(id: string, { focus = false }: { focus?: boolean } = {}) {
  const el = document.getElementById(id);
  if (!el) {
    if (window.location.pathname !== pageOf(id)) goTo(sectionHref(id));
    return;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  if (focus) {
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  }
}

/**
 * Follows a link inside the site, such as a fact's source in the Ask console: a section on this
 * page scrolls into view, a tab's deep link opens the tab (through the hash), and a link to
 * another page loads that page.
 */
export function followHref(href: string) {
  const url = new URL(href, window.location.href);
  if (url.pathname !== window.location.pathname) return goTo(url.pathname + url.search + url.hash);
  const id = url.hash.slice(1);
  if (!id) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }
  if (document.getElementById(id)) return scrollToId(id);
  window.location.hash = id;
}
