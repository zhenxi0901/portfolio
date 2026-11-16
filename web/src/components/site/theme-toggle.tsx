"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { useEffect, useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function useIsClient() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

/** The page background of each theme: the browser's own bar matches it (layout.tsx sets the defaults). */
const BAR = { light: "#f6f6f4", dark: "#0a0a0c" } as const;

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isClient = useIsClient();
  const dark = isClient && resolvedTheme === "dark";
  // A theme picked by hand overrides the system's, so the browser's bar follows the choice, not the system.
  useEffect(() => {
    if (resolvedTheme !== "dark" && resolvedTheme !== "light") return;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", BAR[resolvedTheme]);
  }, [resolvedTheme]);
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="inline-flex size-9 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isClient ? dark ? <Sun size={18} /> : <Moon size={18} /> : <span className="size-[18px]" />}
    </button>
  );
}
