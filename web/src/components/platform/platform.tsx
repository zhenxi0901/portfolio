"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SectionHeading } from "@/components/site/section-heading";
import { Reveal } from "@/components/motion/reveal";
import { FlowExplorer } from "@/components/platform/flow-explorer";
import { Signals } from "@/components/platform/signals";
import { CostReview } from "@/components/platform/cost-review";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "paths", label: "How traffic flows" },
  { id: "signals", label: "What I monitor" },
  { id: "cost", label: "Cost review" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Opened from elsewhere on the page with: window.dispatchEvent(new CustomEvent("platform-tab", { detail: "cost" })) */
export function Platform() {
  const [tab, setTab] = useState<Tab>("paths");

  useEffect(() => {
    const open = (e: Event) => {
      const id = (e as CustomEvent<Tab>).detail;
      if (TABS.some((t) => t.id === id)) setTab(id);
    };
    window.addEventListener("platform-tab", open);
    return () => window.removeEventListener("platform-tab", open);
  }, []);

  return (
    <section id="platform" className="scroll-mt-20 border-t border-line bg-surface-2/40">
      <div className="mx-auto max-w-[1320px] px-4 py-24 sm:px-8 sm:py-32">
        <SectionHeading
          title="Inside the platform"
          lead="How traffic moves through the GKE platform I run at Primustech, which signals I alert on and why, and where the money went."
        />
        <Reveal className="mt-10">
          <div role="tablist" aria-label="Platform views" className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-surface p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  tab === t.id ? "text-on-accent" : "text-ink-2 hover:text-ink",
                )}
              >
                {tab === t.id && (
                  <motion.span
                    layoutId="platform-tab"
                    className="absolute inset-0 rounded-full bg-accent"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative">{t.label}</span>
              </button>
            ))}
          </div>
        </Reveal>
        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-8">
          {tab === "paths" && <FlowExplorer />}
          {tab === "signals" && <Signals />}
          {tab === "cost" && <CostReview />}
        </div>
      </div>
    </section>
  );
}
