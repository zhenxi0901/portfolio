"use client";

import { useState } from "react";
import { ArrowCounterClockwise, CheckCircle, LockKey, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CLIENTS = ["core", "rule engine", "http transport", "mqtt transport"];

/**
 * Giving a live cache a password. The two switches are the two releases; flip them in either order
 * and see which order breaks every client.
 */
export function TwoStepViz() {
  const [send, setSend] = useState(false);
  const [require, setRequire] = useState(false);
  const broken = require && !send;
  const done = require && send;

  const note = broken
    ? { tone: "bad", title: "Every client is refused", text: "The server asks for a password that no client sends yet. This is what doing it in one step, or in the wrong order, looks like." }
    : done
      ? { tone: "good", title: "Authenticated, and nothing dropped on the way", text: "Each step could be checked and undone on its own. Rolling back means flipping only the last switch." }
      : send
        ? { tone: "good", title: "Nothing changes on the wire", text: "Clients now send the password. A server that requires none accepts it anyway, so this step is safe to ship first and leave running." }
        : { tone: "quiet", title: "No password anywhere", text: "The cache accepts any client inside the cluster. Flip a switch to start the change." };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <ul className="grid gap-1.5" aria-label="Cache clients">
          {CLIENTS.map((c) => (
            <li
              key={c}
              className={cn(
                "flex items-center justify-between gap-2 rounded-xl border bg-surface px-3 py-1.5 font-mono text-xs",
                broken ? "border-critical/50 text-critical" : "border-line text-ink-2",
              )}
            >
              {c}
              <span className="text-[10px] text-ink-3">{send ? "AUTH" : "no auth"}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col items-center gap-1 text-ink-3" aria-hidden>
          {CLIENTS.map((c) => (
            <span key={c} className={cn("block h-px w-8 sm:w-12", broken ? "bg-critical/60" : "bg-line-strong")} />
          ))}
        </div>
        <div className={cn("rounded-2xl border bg-surface p-4 text-center", done ? "border-good/50" : broken ? "border-critical/50" : "border-line")}>
          <LockKey size={22} weight={require ? "fill" : "regular"} className={cn("mx-auto", require ? "text-accent-ink" : "text-ink-3")} />
          <p className="mt-2 text-sm font-medium">Cache</p>
          <p className="mt-0.5 font-mono text-[11px] text-ink-3">{require ? "password required" : "open"}</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { on: send, set: setSend, step: "Step 1", label: "Clients send the password" },
          { on: require, set: setRequire, step: "Step 2", label: "The cache requires it" },
        ].map((s) => (
          <label
            key={s.step}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-2xl border bg-surface px-3.5 py-2.5 text-sm transition-colors",
              s.on ? "border-accent-ink" : "border-line hover:border-line-strong",
            )}
          >
            <input type="checkbox" checked={s.on} onChange={(e) => s.set(e.target.checked)} className="size-4 accent-[var(--accent-ink)]" />
            <span>
              <span className="block font-mono text-[11px] text-ink-3">{s.step}</span>
              {s.label}
            </span>
          </label>
        ))}
      </div>

      <div
        className={cn("flex items-start gap-3 rounded-2xl border bg-surface p-3.5", note.tone === "bad" ? "border-critical/40" : "border-line")}
        role="status"
      >
        {note.tone === "bad" ? (
          <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-critical" />
        ) : (
          <CheckCircle size={20} weight="fill" className={cn("mt-0.5 shrink-0", note.tone === "good" ? "text-good" : "text-ink-3")} />
        )}
        <div className="text-sm">
          <p className="font-medium">{note.title}</p>
          <p className="mt-0.5 leading-relaxed text-ink-2">{note.text}</p>
        </div>
      </div>

      <div className="mt-auto">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setSend(false);
            setRequire(false);
          }}
          disabled={!send && !require}
        >
          <ArrowCounterClockwise /> Reset
        </Button>
      </div>
    </div>
  );
}
