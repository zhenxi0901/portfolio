"use client";

import { useEffect, useState } from "react";
import { parseAnsi } from "@/lib/ansi";
import { API_BASE } from "@/lib/api";
import { SITE_URL } from "@/lib/site";

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
