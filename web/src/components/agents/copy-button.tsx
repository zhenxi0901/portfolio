"use client";

import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";

/** Copies `text`; says so for two seconds, to sighted users and screen readers alike. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          // No clipboard permission: the text is on screen to select by hand.
        }
      }}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[13px] text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
    >
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </button>
  );
}
