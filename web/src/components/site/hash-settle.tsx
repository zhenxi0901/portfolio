"use client";

import { useEffect } from "react";

/** How long after load a section reached by its #link is kept in place, at most. */
const SETTLE_MS = 6000;

/**
 * A link to /status#replay lands on the section, and then the live panels above it fill in and push it
 * down the screen (on a phone, under the dock). For the first few seconds after the page opens, and
 * only until the visitor scrolls, clicks or types themselves, this puts the section back at the top
 * whenever the page changes height. Pages opened without a #section are left alone.
 */
export function HashSettle() {
  useEffect(() => {
    let id = window.location.hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      return;
    }
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    // A reload or Back/Forward puts the visitor where they had scrolled to; that is theirs to keep.
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav && nav.type !== "navigate") return;

    // Where the browser puts a section it jumps to: the page's scroll-padding (the fixed top bar) plus
    // the section's own scroll-margin, below the top of the screen.
    const margin =
      (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) + (parseFloat(getComputedStyle(target).scrollMarginTop) || 0);
    // Instant, not the page's smooth scrolling: a glide on every panel that loads would look like jitter.
    const settle = () => {
      if (Math.abs(target.getBoundingClientRect().top - margin) > 1) target.scrollIntoView({ block: "start", behavior: "instant" });
    };
    const resize = new ResizeObserver(settle);
    resize.observe(document.body);
    const intents = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    const stop = () => {
      resize.disconnect();
      clearTimeout(timer);
      for (const e of intents) window.removeEventListener(e, stop);
    };
    const timer = setTimeout(stop, SETTLE_MS);
    for (const e of intents) window.addEventListener(e, stop, { passive: true });
    return stop;
  }, []);
  return null;
}
