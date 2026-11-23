"use client";

import { usePathname } from "next/navigation";
import { chapterOf } from "@/lib/sections";
import { cn } from "@/lib/utils";

/** The chapters, with names short enough for a phone; where a name is shortened, the link carries the full one. */
const tabs = [
  { label: "Home", full: "Home", href: "/" },
  { label: "IoT", full: "IoT platform", href: "/iot" },
  { label: "AI", full: "AI agent platform", href: "/ai" },
  { label: "Research", full: "Research", href: "/research" },
  { label: "Writing", full: "Writing", href: "/writing" },
  { label: "About", full: "About", href: "/about" },
];

/**
 * The chapters on screens too narrow to list them in the top bar: labelled tabs along the bottom, where
 * a thumb reaches them. (It was an icon dock; a brain, a flask and an ID card left visitors guessing.)
 * From lg up the top bar lists the chapters and this bar is gone. The name stays Dock for its callers.
 */
export function Dock() {
  const path = usePathname();
  const chapter = chapterOf(path);
  return (
    <nav
      data-print-hide
      aria-label="Pages"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden short:static"
    >
      <ul className="mx-auto flex h-14 max-w-xl items-stretch px-1">
        {tabs.map((t) => {
          const current = t.href === chapter ? (t.href === path ? "page" : "true") : undefined;
          return (
            <li key={t.href} className="flex-1">
              <a
                href={t.href}
                aria-current={current}
                aria-label={t.full === t.label ? undefined : t.full}
                className="flex h-full flex-col items-center justify-center gap-1.5 text-[12px] font-medium text-ink-3 transition-colors hover:text-ink aria-[current]:text-ink"
              >
                {/* The current chapter's mark: a short bar over its name, in ink. */}
                <span aria-hidden className={cn("h-0.5 w-5 rounded-full", current ? "bg-ink" : "bg-transparent")} />
                {t.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
