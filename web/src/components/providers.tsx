"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { CommandPalette } from "@/components/site/command-palette";

// The terminal is its own chunk, fetched the first time someone opens it.
const Terminal = dynamic(() => import("@/components/site/terminal"), { ssr: false });

type PaletteCtx = { open: boolean; setOpen: (v: boolean) => void; toggle: () => void };
const PaletteContext = createContext<PaletteCtx | null>(null);

export function usePalette() {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error("usePalette must be used inside <Providers>");
  return ctx;
}

type TerminalCtx = { open: boolean; setOpen: (v: boolean) => void };
const TerminalContext = createContext<TerminalCtx | null>(null);

export function useTerminal() {
  const ctx = useContext(TerminalContext);
  if (!ctx) throw new Error("useTerminal must be used inside <Providers>");
  return ctx;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  const [terminalOpen, setTerminalOpen] = useState(false);
  // Once opened it stays mounted, so closing it keeps the session on screen for next time.
  const [terminalUsed, setTerminalUsed] = useState(false);
  const setTerminal = useCallback((v: boolean) => {
    if (v) {
      setTerminalUsed(true);
      setOpen(false);
    }
    setTerminalOpen(v);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        toggle();
      } else if (e.key === "`" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setTerminal(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, setTerminal]);

  // /?terminal opens it straight away, from a link or from another page.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("terminal")) return;
    const t = setTimeout(() => {
      window.history.replaceState(null, "", window.location.pathname);
      setTerminal(true);
    }, 300);
    return () => clearTimeout(t);
  }, [setTerminal]);

  const value = useMemo(() => ({ open, setOpen, toggle }), [open, toggle]);
  const terminal = useMemo(() => ({ open: terminalOpen, setOpen: setTerminal }), [terminalOpen, setTerminal]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PaletteContext.Provider value={value}>
        <TerminalContext.Provider value={terminal}>
          {children}
          <CommandPalette />
          {terminalUsed && <Terminal />}
          <Toaster
            position="bottom-center"
            offset={96}
            toastOptions={{
              className: "!rounded-2xl !border !border-line !bg-surface !text-ink !shadow-soft !font-sans",
            }}
          />
        </TerminalContext.Provider>
      </PaletteContext.Provider>
    </ThemeProvider>
  );
}
