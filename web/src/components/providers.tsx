"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ThemeProvider } from "next-themes";
import { toast, Toaster } from "sonner";
import { CommandPalette } from "@/components/site/command-palette";

/**
 * Shown instead of the terminal when its code could not be fetched: offline, or the site was
 * redeployed and the old chunk is gone. Without it the failed import would take the whole page
 * down to Next's error screen. A reload is the cure for both, so that is what it offers.
 */
function TerminalUnavailable() {
  const { open, setOpen } = useTerminal();
  useEffect(() => {
    if (!open) return;
    setOpen(false);
    toast.error("The terminal could not load.", {
      // One toast, however often the key is pressed: the same id replaces rather than stacks.
      id: "terminal-unavailable",
      description: "You may be offline, or the site was updated since this page loaded.",
      action: { label: "Reload", onClick: () => window.location.reload() },
    });
  }, [open, setOpen]);
  return null;
}

// The terminal is its own chunk, fetched the first time someone opens it.
const Terminal = dynamic(() => import("@/components/site/terminal").catch(() => ({ default: TerminalUnavailable })), {
  ssr: false,
  loading: () => (
    <p role="status" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-surface px-4 py-2 font-mono text-xs text-ink-2 shadow-soft">
      opening the terminal…
    </p>
  ),
});

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
  const [paletteOpen, setPaletteOpenState] = useState(false);
  const paletteRef = useRef(false);
  // The palette (cmdk) has no trigger to return focus to, so it is remembered here and given back.
  const paletteOpener = useRef<HTMLElement | null>(null);
  const setPaletteOpen = useCallback((v: boolean) => {
    if (v && !paletteRef.current) {
      const active = document.activeElement;
      paletteOpener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    paletteRef.current = v;
    setPaletteOpenState(v);
  }, []);
  const toggle = useCallback(() => setPaletteOpen(!paletteRef.current), [setPaletteOpen]);

  useEffect(() => {
    if (paletteOpen) return;
    const opener = paletteOpener.current;
    paletteOpener.current = null;
    if (!opener) return;
    // After the dialog has gone, and only if whatever the palette did has not put focus somewhere.
    // If the opener has gone too (it was inside the terminal, which closed), the palette's own button.
    requestAnimationFrame(() => {
      const free = !document.activeElement || document.activeElement === document.body;
      const el = opener.isConnected ? opener : document.querySelector<HTMLElement>("[data-palette-trigger]");
      if (el && free) el.focus({ preventScroll: true });
    });
  }, [paletteOpen]);

  const [terminalOpen, setTerminalOpen] = useState(false);
  // Once opened it stays mounted, so closing it keeps the session on screen for next time.
  const [terminalUsed, setTerminalUsed] = useState(false);
  const setTerminal = useCallback(
    (v: boolean) => {
      if (v) {
        setTerminalUsed(true);
        setPaletteOpen(false);
      }
      setTerminalOpen(v);
    },
    [setPaletteOpen],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Holding a key down repeats it; a dialog should open once, not flicker.
      if (e.repeat) return;
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        // One dialog at a time: Ctrl/Cmd+K works inside the terminal too. The terminal keeps its session.
        setTerminalOpen(false);
        toggle();
      } else if ((e.key === "`" || (e.key === "Dead" && e.code === "Backquote")) && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // On many international layouts the backtick key is a dead key: its code still says which key it is.
        e.preventDefault();
        setTerminal(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, setTerminal]);

  // ?terminal opens it straight away, from a link or from another page. Only that parameter is
  // removed from the address; the rest of the query and the #fragment stay.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("terminal")) return;
    const t = setTimeout(() => {
      params.delete("terminal");
      const query = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
      setTerminal(true);
    }, 300);
    return () => clearTimeout(t);
  }, [setTerminal]);

  const palette = useMemo(() => ({ open: paletteOpen, setOpen: setPaletteOpen, toggle }), [paletteOpen, setPaletteOpen, toggle]);
  const terminal = useMemo(() => ({ open: terminalOpen, setOpen: setTerminal }), [terminalOpen, setTerminal]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PaletteContext.Provider value={palette}>
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
