"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Whether the visitor asked for reduced motion, for components whose MARKUP depends on it.
 *
 * motion's useReducedMotion reads the media query on the first client render, so a visitor with
 * reduced motion on got different markup from the server's and React reported a hydration error
 * (#418) on every page with such a component. This one answers false while hydrating, exactly as
 * the server rendered, and the real value straight after.
 */
export function useReducedMotionSafe(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
