"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A column that stays in view beside a longer one, from lg up. While it fits under the top bar it sticks
 * there (`top`, in px). When it is taller than that room, it scrolls with the page until its bottom shows
 * and then stays put: a plain sticky top would hide its last lines for as long as the other column
 * scrolls, which is how /research's links went missing on a 1366x768 laptop.
 */
export function StickyColumn({ top = 112, className, children }: { top?: number; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const gap = 24;
    const fit = () => {
      const over = el.offsetHeight + top + gap - window.innerHeight;
      el.style.top = `${over > 0 ? window.innerHeight - el.offsetHeight - gap : top}px`;
    };
    fit();
    // Fonts arriving, a resized window and the content itself all change the height.
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      watch.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [top]);
  return (
    <div ref={ref} className={cn("lg:sticky", className)} style={{ top }}>
      {children}
    </div>
  );
}
