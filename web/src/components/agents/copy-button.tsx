"use client";

import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";

/**
 * Copies `text`; says so for two seconds. Screen readers hear "Copied" once, from a status line of
 * its own, rather than the button's whole label twice. `describedBy` names what is copied, where
 * several buttons on a page would otherwise all be called "Copy".
 */
export function CopyButton({ text, label, name, describedBy }: { text: string; label: string; name?: string; describedBy?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-describedby={describedBy}
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
      <span>{done ? "Copied" : label}</span>
      {/* What is copied, for screen readers, where a page has several buttons labelled "Copy". */}
      {name && <span className="sr-only"> {name}</span>}
      <span role="status" className="sr-only">
        {done ? "Copied" : ""}
      </span>
    </button>
  );
}
