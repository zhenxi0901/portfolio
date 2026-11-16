"use client";

import { useEffect, useRef } from "react";

/**
 * Marks the element shown (`data-shown`) when it enters the viewport, which starts the motion inside
 * it that carries information (bars growing to their value, lines drawing: see [data-reveal] in
 * globals.css). The element itself does not fade in; content is always readable, with or without
 * JavaScript.
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
