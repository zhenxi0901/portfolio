"use client";

import { useEffect, useRef } from "react";

/**
 * Fade-and-rise when the element enters the viewport. The animation itself is CSS
 * (see [data-reveal] in globals.css); this only flips `data-shown`, so server-rendered
 * HTML is readable before, and without, JavaScript.
 */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "li";
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.setAttribute("data-shown", "");
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -5% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref as never}
      data-reveal=""
      className={className}
      style={{ "--reveal-delay": `${delay}s`, "--reveal-y": `${y}px` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
