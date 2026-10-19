"use client";

import { useEffect, useState } from "react";
import { api, type SloReport, type Status } from "@/lib/api";
import { cn } from "@/lib/utils";

type Reading = { at: Date; ms: number; status: Status | null; slo: SloReport | null };

const EVERY = 60_000;

/** The site's state as this browser sees it right now, checked once a minute. */
export function LiveState() {
  const [r, setR] = useState<Reading | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const check = async () => {
      const t0 = performance.now();
      const status = await api.status().catch(() => null);
      const ms = performance.now() - t0;
      const slo = await api.slo().catch(() => null);
      if (!alive) return;
      setR({ at: new Date(), ms, status, slo });
      timer = setTimeout(check, EVERY);
    };
    check();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const up = r?.status?.status === "ok";
  const frozen = r?.slo?.releases === "frozen";
  const state = !r ? "Checking" : !up ? "Not answering" : frozen ? "Up, releases frozen" : "Operational";
  const tone = !r ? "bg-ink-3" : !up ? "bg-critical" : frozen ? "bg-p-ai" : "bg-good";

  return (
    <div className="mt-10 rounded-3xl border border-line bg-surface p-6" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="flex items-center gap-3 text-2xl font-semibold tracking-[-0.03em]">
          <span className={cn("size-3 rounded-full", tone, r && up && "animate-pulse")} aria-hidden />
          {state}
        </p>
        <p className="font-mono text-xs text-ink-3">
          {r ? `checked ${r.at.toLocaleTimeString("en-GB")} your time, again every minute` : "checking from your browser…"}
        </p>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
        <Fact label="answered your browser in" value={r?.status ? `${Math.round(r.ms)} ms` : "n/a"} />
        <Fact label="live commit" value={r?.status?.commit ?? "n/a"} mono />
        <Fact label="region" value={r?.status?.region ?? "n/a"} mono />
        <Fact
          label="releases"
          value={!r?.slo?.releases || r.slo.releases === "unknown" ? "n/a" : r.slo.releases === "open" ? "open" : "frozen: fixes only"}
        />
      </dl>
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col-reverse justify-end">
      <dt className="mt-1 text-ink-2">{label}</dt>
      <dd className={cn("text-lg font-semibold", mono && "font-mono text-base")}>{value}</dd>
    </div>
  );
}
