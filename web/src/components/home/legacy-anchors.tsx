"use client";

import { useEffect } from "react";
import { pageOf, sectionHref } from "@/lib/sections";

/**
 * Links from before the split into chapters (/#research, /#platform-cost, /#case-gke) still work:
 * the home page sends them on to the page the section now lives on.
 */
export function LegacyAnchors() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id && pageOf(id) !== "/") window.location.replace(sectionHref(id));
  }, []);
  return null;
}
