"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { MagnifyingGlass, TerminalWindow } from "@phosphor-icons/react";
import { profile } from "@/content/profile";
import { usePalette, useTerminal } from "@/components/providers";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { pages } from "@/components/site/nav-items";
import { usePathname } from "next/navigation";
import { chapterOf } from "@/lib/sections";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// Whether the page has scrolled at all: read from the browser, and "no" on the server and in the
// first render, so the markup hydrates the same either way.
const onScroll = (notify: () => void) => {
  window.addEventListener("scroll", notify, { passive: true });
  return () => window.removeEventListener("scroll", notify);
};
const scrolled = () => window.scrollY > 8;

/** What the server says about itself: whether it answered, and the commit it is running. */
type Serving = { ok: true; commit: string } | { ok: false } | null;

/**
 * The bar across the top. The name is the logo; beside it, a live reading (the site's only colour
 * besides ink, so lime means live): a dot that turns lime once this server answers, and the commit it
 * is running, which opens the status page. On the home page the name jumps to the top; elsewhere
 * (`home`) it goes back home.
 */
export function TopBar({ home = false }: { home?: boolean }) {
  const { setOpen } = usePalette();
  const terminal = useTerminal();
  const path = usePathname();
  // A case study or a post belongs to a chapter: the menu marks that chapter too.
  const chapter = chapterOf(path);
  const away = useSyncExternalStore(onScroll, scrolled, () => false);
  const [serving, setServing] = useState<Serving>(null);
  useEffect(() => {
    let alive = true;
    api
      .status()
      .then((s) => alive && setServing({ ok: true, commit: String(s.commit) }))
      .catch(() => alive && setServing({ ok: false }));
    return () => {
      alive = false;
    };
  }, []);
  const live = serving?.ok ? serving : null;

  return (
    <header data-print-hide className="fixed inset-x-0 top-0 z-30 short:absolute">
      {/* Once the page scrolls, a tinted strip behind the bar, so text scrolling under it does not show through. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 -z-10 border-b border-line/70 bg-bg/85 backdrop-blur-md transition-opacity duration-200 motion-reduce:transition-none",
          away ? "opacity-100 short:opacity-0" : "opacity-0",
        )}
      />
      <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between gap-4 px-4 sm:px-8">
        <div className="flex min-w-0 items-baseline gap-3">
          <a href={home ? "/" : "#top"} className="whitespace-nowrap text-[15px] font-semibold tracking-[-0.01em]">
            {profile.name}
            <span className="sr-only">{home ? ", home page" : ", back to top"}</span>
          </a>
          <a
            href="/status"
            aria-label={live ? `Live: commit ${live.commit} is serving this page. The status page` : "The status page"}
            title={live ? `Commit ${live.commit} is serving this page` : undefined}
            className="group inline-flex items-center gap-1.5 font-mono text-xs text-ink-3 transition-colors hover:text-ink"
          >
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full transition-colors duration-300",
                // Grey until the server answers, and if it does not (a static copy has no API): never a false alarm.
                live ? "bg-live ring-1 ring-live-ink/40" : "bg-line-strong",
              )}
            />
            {/* Seven characters reserved, so nothing moves when the commit arrives. */}
            <span aria-hidden className="inline-block w-[7ch]">
              {live?.commit.slice(0, 7) ?? ""}
            </span>
          </a>
        </div>

        {/* The chapters, on screens wide enough for them; smaller screens have the tabs at the bottom. */}
        <nav aria-label="Chapters" className="hidden items-center gap-6 lg:flex">
          {pages.slice(1).map((p) => (
            <a
              key={p.href}
              href={p.href}
              aria-current={chapter === p.href ? (path === p.href ? "page" : "true") : undefined}
              className="text-[14px] text-ink-2 decoration-2 underline-offset-[7px] transition-colors hover:text-ink aria-[current]:text-ink aria-[current]:underline"
            >
              {p.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen(true)}
            // The label text is hidden on phones, so the button needs its name spelled out.
            aria-label="Jump anywhere"
            data-palette-trigger
            aria-keyshortcuts="/"
            className="inline-flex h-9 items-center gap-2 rounded-md px-2.5 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <MagnifyingGlass size={16} />
            <span className="hidden sm:inline">Jump anywhere</span>
            <kbd className="hidden rounded border border-line px-1.5 font-mono text-[11px] text-ink-3 sm:inline">/</kbd>
          </button>
          <button
            type="button"
            onClick={() => terminal.setOpen(true)}
            aria-label="Open the terminal"
            aria-keyshortcuts="`"
            title="Terminal: a shell over this site's API (`)"
            className="inline-flex size-9 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <TerminalWindow size={18} />
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
