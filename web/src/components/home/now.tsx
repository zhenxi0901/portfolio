"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { now } from "@/content/profile";
import { api, type SloReport } from "@/lib/api";
import { sloPct, sloSpan } from "@/components/sections/slo-panel";
import { Recently } from "@/components/home/recently";

/**
 * The two things a visitor asks first: what am I doing now, and is this thing up. The first is
 * dated by hand (it is only as true as its date); the second is the site's own SLO, live, rounded
 * down like every other place that shows it.
 */
export function Now() {
  const [slo, setSlo] = useState<SloReport | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .slo()
      .then((r) => alive && setSlo(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const live = slo?.available ? `${sloPct(slo.availability)} available over ${slo.since ? sloSpan(slo.since, slo.updated) : `${slo.window_days} days`}` : null;

  return (
    <section id="now" aria-labelledby="now-title" className="mx-auto max-w-[1320px] scroll-mt-20 px-4 sm:px-8">
      <div className="grid gap-5 rounded-3xl border border-line bg-surface p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-10">
        <div>
          <h2 id="now-title" className="font-mono text-xs text-ink-3">
            Now <span aria-hidden>·</span> <span className="sr-only">, </span>updated {now.updated}
          </h2>
          <p className="mt-2 max-w-[68ch] text-[17px] leading-relaxed">{now.text}</p>
          <Recently />
        </div>
        <a
          href="/status"
          className="group inline-flex w-fit items-center gap-2.5 rounded-full border border-line-strong px-4 py-2.5 text-sm font-medium transition-colors hover:border-ink-3"
        >
          <span className="relative flex size-2" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-good" />
          </span>
          {live ? `Live: ${live}` : "Live status of this site"}
          <ArrowRight size={14} className="text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </a>
      </div>
    </section>
  );
}
