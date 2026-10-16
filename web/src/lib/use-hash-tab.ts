"use client";

import { useEffect } from "react";
import { scrollToId } from "@/lib/utils";

/**
 * Opens a section's tab from a link like /#platform-cost, so other pages can point at one tab.
 * `ids` must be a stable array (define it outside the component).
 */
export function useHashTab<T extends string>(section: string, ids: readonly T[], open: (id: T) => void) {
  useEffect(() => {
    const apply = () => {
      const hash = window.location.hash.slice(1);
      const id = hash.startsWith(`${section}-`) ? (hash.slice(section.length + 1) as T) : null;
      if (!id || !ids.includes(id)) return;
      open(id);
      requestAnimationFrame(() => scrollToId(section));
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [section, ids, open]);
}
