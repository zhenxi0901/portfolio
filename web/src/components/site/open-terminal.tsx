"use client";

import { TerminalWindow } from "@phosphor-icons/react";
import { useTerminal } from "@/components/providers";

/** A button that opens the site's terminal, for pages that talk about it. */
export function OpenTerminal({ label = "Open the terminal" }: { label?: string }) {
  const { setOpen } = useTerminal();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-keyshortcuts="`"
      className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-5 text-sm font-medium text-ink transition-colors hover:border-ink-3"
    >
      <TerminalWindow size={16} aria-hidden />
      {label}
      <kbd aria-hidden className="rounded-md border border-line px-1.5 font-mono text-[11px] text-ink-3">`</kbd>
    </button>
  );
}
