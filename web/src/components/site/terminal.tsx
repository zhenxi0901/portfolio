"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { useTerminal } from "@/components/providers";
import { startTour } from "@/components/site/tour";
import { complete, promptFor, runCommand, shortPromptFor, welcome, type Line, type ShellEnv } from "@/lib/shell";
import { cn, goTo } from "@/lib/utils";

/** One thing on the screen: a command the visitor ran (with the prompt it ran at) and what it printed. */
type Entry = { id: number; prompt?: string; command?: string; lines: Line[] };

/**
 * The site's terminal: a shell over its real API (lib/shell.ts). Loaded only when first opened, so
 * it costs the page nothing until then. Its state lives here, outside the dialog, so closing and
 * reopening keeps the session.
 */
export default function Terminal() {
  const { open, setOpen } = useTerminal();
  const { resolvedTheme, setTheme } = useTheme();
  const [entries, setEntries] = useState<Entry[]>([{ id: 0, lines: welcome }]);
  const [input, setInput] = useState("");
  const [cwd, setCwd] = useState("");
  const [busy, setBusy] = useState(false);
  const history = useRef<string[]>([]);
  const cursor = useRef<number | null>(null);
  // What was being typed before ↑ walked into the history, so ↓ can bring it back.
  const draft = useRef("");
  const nextId = useRef(1);
  const cwdRef = useRef("");
  // The command that is out, so Ctrl+C can cancel it.
  const running = useRef<AbortController | null>(null);
  // Where focus was before the terminal opened: there is no Dialog.Trigger to give it back to.
  const opener = useRef<HTMLElement | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const screen = useRef<HTMLDivElement>(null);

  // Keep the newest output in view.
  useEffect(() => {
    screen.current?.scrollTo({ top: screen.current.scrollHeight });
  }, [entries, busy, open]);

  const print = (entry: Omit<Entry, "id">) => setEntries((es) => [...es, { ...entry, id: nextId.current++ }]);

  const run = async (raw: string) => {
    const command = raw.trim();
    if (busy) {
      // Enter while a command is still out: say so, rather than dropping the line in silence.
      print({ lines: [[{ text: "Still waiting for the last command. Ctrl+C cancels it.", cls: "text-ink-3" }]] });
      return;
    }
    const prompt = promptFor(cwdRef.current);
    setInput("");
    cursor.current = null;
    draft.current = "";
    if (!command) return print({ prompt, command: "", lines: [] });
    history.current.push(command);
    let cleared = false;
    const controller = new AbortController();
    running.current = controller;
    const env: ShellEnv = {
      cwd: cwdRef.current,
      history: history.current,
      signal: controller.signal,
      theme: () => resolvedTheme ?? "dark",
      setTheme,
      setCwd: (dir) => {
        cwdRef.current = dir;
        setCwd(dir);
      },
      clear: () => {
        cleared = true;
        setEntries([]);
      },
      close: () => setOpen(false),
      navigate: (path) => setTimeout(() => goTo(path), 250),
      startTour: () => {
        setOpen(false);
        setTimeout(startTour, 250);
      },
    };
    setBusy(true);
    // The command shows at once; its output joins it when the server has answered.
    const id = nextId.current++;
    setEntries((es) => [...es, { id, prompt, command, lines: [] }]);
    const lines = await runCommand(command, env);
    running.current = null;
    if (!cleared) setEntries((es) => es.map((e) => (e.id === id ? { ...e, lines } : e)));
    setBusy(false);
    requestAnimationFrame(() => field.current?.focus());
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Keys pressed while an input method is composing (Chinese, Japanese, ...) are its own.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const h = history.current;
    if (e.key === "ArrowUp" && h.length) {
      e.preventDefault();
      if (cursor.current === null) draft.current = input;
      cursor.current = Math.max(0, (cursor.current ?? h.length) - 1);
      setInput(h[cursor.current]);
    } else if (e.key === "ArrowDown" && cursor.current !== null) {
      e.preventDefault();
      cursor.current = cursor.current + 1 >= h.length ? null : cursor.current + 1;
      setInput(cursor.current === null ? draft.current : h[cursor.current]);
    } else if (e.key === "Tab" && !e.shiftKey && input.trim()) {
      // Completion, not focus. The dialog's focus trap listens for Tab too and would move focus to
      // the close button, where the next Enter closes the terminal; it must not see this one. With
      // nothing typed, Tab moves focus as usual, so the keyboard is never trapped here.
      e.preventDefault();
      e.stopPropagation();
      const { value, options } = complete(input, cwdRef.current);
      setInput(value);
      if (options.length) print({ prompt: promptFor(cwdRef.current), command: input, lines: [[{ text: options.join("   "), cls: "text-ink-3" }]] });
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setEntries([]);
    } else if (e.key === "c" && e.ctrlKey) {
      // Text selected in the field or on the screen is being copied: Ctrl+C is the browser's then.
      const el = e.currentTarget;
      if (el.selectionStart !== el.selectionEnd || window.getSelection()?.toString()) return;
      e.preventDefault();
      if (running.current) {
        running.current.abort();
        return;
      }
      print({ prompt: promptFor(cwdRef.current), command: input + "^C", lines: [] });
      setInput("");
      draft.current = "";
      cursor.current = null;
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-bg/60 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby="terminal-about"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const active = document.activeElement;
            opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
            field.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const el = opener.current;
            opener.current = null;
            // Only if nothing else has taken focus meanwhile, such as the palette opening instead.
            const free = !document.activeElement || document.activeElement === document.body;
            if (el?.isConnected && free) el.focus({ preventScroll: true });
          }}
          className="fixed inset-x-2 bottom-2 top-16 z-50 mx-auto flex max-w-4xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-soft sm:inset-x-6 sm:bottom-auto sm:top-[10vh] sm:h-[72vh]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line py-2 pl-5 pr-2">
            <Dialog.Title className="font-mono text-xs text-ink-2">visitor@zhenxi: a shell over this site&apos;s API</Dialog.Title>
            <Dialog.Close
              aria-label="Close the terminal"
              className="inline-flex size-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X size={16} />
            </Dialog.Close>
          </div>
          <p id="terminal-about" className="sr-only">
            Type a command and press Enter. Type help for the list. Every command reads this site&apos;s live API; nothing can be changed from here.
          </p>

          {/* Clicking the screen focuses the prompt, unless the visitor is selecting text to copy. */}
          <div
            ref={screen}
            onClick={() => !window.getSelection()?.toString() && field.current?.focus()}
            className="flex-1 overflow-y-auto overscroll-contain bg-bg px-4 py-4 font-mono text-[13px] leading-[1.65] text-ink-2 sm:px-5"
          >
            <div role="log" aria-label="Terminal output">
              {entries.map((entry) => (
                <div key={entry.id} className="mb-3">
                  {entry.prompt !== undefined && (
                    <p className="whitespace-pre-wrap break-words">
                      <span className="text-accent-ink">{entry.prompt}</span> <span className="text-ink">{entry.command}</span>
                    </p>
                  )}
                  {entry.lines.map((segs, i) => (
                    <p key={i} className="min-h-[1.65em] whitespace-pre-wrap break-words">
                      {segs.map((seg, k) => {
                        const command = seg.run;
                        return seg.href ? (
                          <a
                            key={k}
                            href={seg.href}
                            {...(seg.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                            className="text-ink underline decoration-accent-ink underline-offset-4"
                          >
                            {seg.text}
                          </a>
                        ) : command ? (
                          <button
                            key={k}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              run(command);
                            }}
                            className={cn("text-left underline decoration-line-strong underline-offset-4 hover:decoration-accent-ink", seg.cls)}
                          >
                            {seg.text}
                          </button>
                        ) : (
                          <span key={k} className={seg.cls}>
                            {seg.text}
                          </span>
                        );
                      })}
                    </p>
                  ))}
                </div>
              ))}
              {busy && <p className="animate-pulse text-ink-3">asking the server… (Ctrl+C cancels)</p>}
            </div>

            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(input);
              }}
            >
              <label htmlFor="terminal-input" className="shrink-0 text-accent-ink">
                <span className="sr-only">Command, at </span>
                {/* A phone keeps the field wide: the short prompt there, the full one from sm up. */}
                <span className="sm:hidden">{shortPromptFor(cwd)}</span>
                <span className="hidden sm:inline">{promptFor(cwd)}</span>
              </label>
              {/* 16px on phones, or iOS zooms the page when the field takes focus. */}
              <input
                id="terminal-input"
                ref={field}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                maxLength={400}
                // The caret is the focus indicator here, as in any terminal.
                style={{ outline: "none" }}
                className="min-w-0 flex-1 bg-transparent font-mono text-base text-ink caret-accent-ink sm:text-[13px]"
              />
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
