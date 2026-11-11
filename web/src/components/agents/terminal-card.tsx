"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import { SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

type Run = { text: string; cls: string };

const ESC = String.fromCharCode(27) + "[";
const COLOURS: Record<string, string> = { "32": "font-medium text-accent-ink", "33": "font-medium text-p-ai", "38;5;155": "text-accent-ink" };

/** Turns the handful of ANSI codes the card uses into styled runs. */
function parseAnsi(raw: string): Run[] {
  const runs: Run[] = [];
  let bold = false;
  let dim = false;
  let colour = "";
  raw.split(ESC).forEach((chunk, i) => {
    let text = chunk;
    if (i > 0) {
      const end = chunk.indexOf("m");
      const code = chunk.slice(0, end);
      text = chunk.slice(end + 1);
      if (code === "0" || code === "") {
        bold = dim = false;
        colour = "";
      } else if (code === "1") bold = true;
      else if (code === "2") dim = true;
      else colour = COLOURS[code] ?? colour;
    }
    if (text) runs.push({ text, cls: cn(bold && "font-semibold text-ink", dim && "text-ink-3", colour) });
  });
  return runs;
}

/** What `curl <site>` prints right now, fetched from the same handler at /api/card.txt. */
export function TerminalCard() {
  const [raw, setRaw] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "live" | "offline">("loading");

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/api/card.txt`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => {
        if (!alive) return;
        setRaw(t.trimEnd());
        setState("live");
      })
      .catch(() => alive && setState("offline"));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <figure className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <figcaption className="font-mono text-[11px] text-ink-3" aria-live="polite">
        {state === "live" && "fetched just now · the same text curl gets"}
        {state === "loading" && "asking the server…"}
        {state === "offline" && "the server did not answer · run the command yourself"}
      </figcaption>
      <pre tabIndex={0} className="mt-3 overflow-x-auto rounded-2xl border border-line bg-bg p-4 font-mono text-xs leading-relaxed text-ink-2 sm:text-[13px]">
        <span className="text-ink-3">$ </span>
        <span className="text-ink">curl {SITE_URL}</span>
        {raw !== null && "\n"}
        {raw !== null &&
          parseAnsi(raw).map((r, i) => (
            <span key={i} className={r.cls}>
              {r.text}
            </span>
          ))}
      </pre>
    </figure>
  );
}
