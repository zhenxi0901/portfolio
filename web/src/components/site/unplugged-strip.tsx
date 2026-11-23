"use client";

import { useEffect } from "react";
import { PlugsConnected } from "@phosphor-icons/react";
import { toast } from "sonner";
import { MINUTES, pagesCut, partName, replug, unpluggedPart, WOULD_NOT_LOAD } from "@/lib/unplug";
import { useUnplugged } from "@/lib/use-unplugged";

function plugBackIn() {
  replug();
  // The home page takes its readings again by itself; every other page has drawn itself without the part.
  if (window.location.pathname !== "/") window.location.reload();
}

/** Says that a page would not have loaded, for a link that was not followed. */
function wouldNotLoad() {
  const part = unpluggedPart();
  if (!part) return;
  toast.error("That page would not load", {
    id: "unplugged",
    description: `${partName[part]} is unplugged in this tab.`,
    action: { label: "Plug it back in", onClick: plugBackIn },
  });
}

/**
 * Under the top bar of every page while something is unplugged: what, that it is this tab only, and the way back. It
 * also stops links to other pages when the part that is gone is the one that sends them: the real server would
 * answer, and the visitor would be told one thing and shown another.
 */
export function UnpluggedStrip() {
  const part = useUnplugged();
  useEffect(() => {
    if (!part || !pagesCut()) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      // A jump within this page needs no server.
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search && url.hash)) return;
      e.preventDefault();
      e.stopPropagation();
      wouldNotLoad();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener(WOULD_NOT_LOAD, wouldNotLoad);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(WOULD_NOT_LOAD, wouldNotLoad);
    };
  }, [part]);

  if (!part) return null;
  return (
    <div role="status" className="absolute inset-x-0 top-full border-b border-critical/50 bg-[color-mix(in_oklab,var(--critical)_14%,var(--bg))]">
      <p className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 text-[13px] sm:px-8">
        <span className="flex items-center gap-2">
          <span aria-hidden className="size-2 rounded-full bg-critical" />
          <span>
            <span className="font-medium">{partName[part]}</span> is unplugged, in this tab only
            <span className="text-ink-2 max-sm:sr-only">, for up to {MINUTES} minutes. The site itself is fine.</span>
          </span>
        </span>
        <button type="button" onClick={plugBackIn} className="inline-flex min-h-6 items-center gap-1.5 font-medium underline underline-offset-4">
          <PlugsConnected size={15} aria-hidden />
          Plug it back in
        </button>
      </p>
    </div>
  );
}
