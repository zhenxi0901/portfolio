import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
  if (!document.getElementById("platform")) return goTo(`/#platform-${tab}`);
  window.dispatchEvent(new CustomEvent("platform-tab", { detail: tab }));
  scrollToId("platform");
}

/** Scroll to a section by id, honouring reduced motion. From another page, go to it on the home page. */
export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) {
    // Sections live on the home page.
    if (window.location.pathname !== "/") goTo(`/#${id}`);
    return;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}
