import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Jump to a tab of the "Inside the platform" section. */
export function openPlatformTab(tab: "paths" | "signals" | "cost") {
  window.dispatchEvent(new CustomEvent("platform-tab", { detail: tab }));
  scrollToId("platform");
}

/** Scroll to a section by id, honouring reduced motion. From another page, go to it on the home page. */
export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) {
    // Sections live on the home page, a separate static file, so this is a full navigation on purpose.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (window.location.pathname !== "/") window.location.assign(`/#${id}`);
    return;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}
