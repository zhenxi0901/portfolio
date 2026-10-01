"use client";

import { Command } from "@phosphor-icons/react";
import { profile } from "@/content/profile";
import { usePalette } from "@/components/providers";
import { ThemeToggle } from "@/components/site/theme-toggle";

export function TopBar() {
  const { setOpen } = usePalette();
  return (
    <header data-print-hide className="fixed inset-x-0 top-0 z-30">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between px-4 sm:px-8">
        <a
          href="#top"
          className="group flex items-center gap-2.5 rounded-full border border-line bg-surface/80 py-1 pl-1 pr-1 backdrop-blur-md sm:pr-4"
          aria-label={`${profile.name}, back to top`}
        >
          <span className="grid size-9 place-items-center rounded-full bg-accent font-mono text-[13px] font-bold text-on-accent transition-transform duration-300 group-hover:rotate-[-12deg]">
            LZ
          </span>
          <span className="hidden text-sm font-medium tracking-tight sm:block">{profile.name}</span>
        </a>
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface/80 p-1 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Command size={15} />
            <span className="hidden sm:inline">Jump anywhere</span>
            <kbd className="rounded-md border border-line px-1.5 font-mono text-[11px] text-ink-3">/</kbd>
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
