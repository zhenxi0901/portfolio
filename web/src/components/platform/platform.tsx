"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SectionHeading } from "@/components/site/section-heading";
import { Reveal } from "@/components/motion/reveal";
import { FlowExplorer } from "@/components/platform/flow-explorer";
import { Monitoring } from "@/components/platform/monitoring";
import { CostReview } from "@/components/platform/cost-review";
import { ProductTag } from "@/components/site/product-tag";
import { useHashTab } from "@/lib/use-hash-tab";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "paths", label: "How traffic flows" },
  { id: "signals", label: "What I monitor" },
  { id: "cost", label: "Cost review" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const TAB_IDS = TABS.map((t) => t.id);

/**
 * Opened from elsewhere on the page with: window.dispatchEvent(new CustomEvent("platform-tab", { detail: "cost" })),
 * and from other pages with a link to /#platform-cost.
 */
export function Platform() {
  const [tab, setTab] = useState<Tab>("paths");
  useHashTab("platform", TAB_IDS, setTab);

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
        <ProductTag p="iot" className="mb-5" />
        <SectionHeading
          title="Inside the IoT platform"
          lead="The building IoT platform I run on GKE: how traffic moves through it, what I alert on and why, and where the money went."
        />
        <a
          href="/oncall"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-critical/50 px-4 py-2 text-sm font-medium transition-colors hover:border-critical"
        >
          <span className="relative flex size-2" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-critical opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-critical" />
          </span>
          Try being on call: a simulated incident on this platform
        </a>
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
          {tab === "signals" && <Monitoring />}
          {tab === "cost" && <CostReview />}
        </div>
      </div>
    </section>
  );
}
