"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { CommandPalette } from "@/components/site/command-palette";

type PaletteCtx = { open: boolean; setOpen: (v: boolean) => void; toggle: () => void };
const PaletteContext = createContext<PaletteCtx | null>(null);

export function usePalette() {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error("usePalette must be used inside <Providers>");
  return ctx;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const value = useMemo(() => ({ open, setOpen, toggle }), [open, toggle]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PaletteContext.Provider value={value}>
        {children}
        <CommandPalette />
        <Toaster
          position="bottom-center"
          offset={96}
          toastOptions={{
            className: "!rounded-2xl !border !border-line !bg-surface !text-ink !shadow-soft !font-sans",
          }}
        />
      </PaletteContext.Provider>
    </ThemeProvider>
  );
}
