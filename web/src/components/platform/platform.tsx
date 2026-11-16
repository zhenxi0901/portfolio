"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SectionHeading } from "@/components/site/section-heading";
import { OnCallLink } from "@/components/oncall/oncall-link";
import { Reveal } from "@/components/motion/reveal";
import { FlowExplorer } from "@/components/platform/flow-explorer";
import { Monitoring } from "@/components/platform/monitoring";
import { CostReview } from "@/components/platform/cost-review";
import { ProductTag } from "@/components/site/product-tag";
import { useHashTab } from "@/lib/use-hash-tab";
import { cn } from "@/lib/utils";
import { onTabKeys } from "@/lib/tabs";

const TABS = [
  { id: "paths", label: "How traffic flows" },
  { id: "signals", label: "What I monitor" },
  { id: "cost", label: "Cost review" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const TAB_IDS = TABS.map((t) => t.id);

/**
 * Opened from elsewhere on the page with: window.dispatchEvent(new CustomEvent("platform-tab", { detail: "cost" })),
 * and from other pages with a link to /iot#platform-cost.
 */
/** `chapter`: on /iot, where the page already says which product this is. */
export function Platform({ chapter = false }: { chapter?: boolean } = {}) {
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
        {!chapter && <ProductTag p="iot" className="mb-5" />}
        <SectionHeading
          title="Inside the IoT platform"
          lead="Start with the path a request takes through it. The alerts that page me, and why each one does, are in the next tab; the cost review that cut the bill by an estimated 15% is in the last."
        />
        <OnCallLink drill="iot" />
        <Reveal className="mt-10">
          <div
            role="tablist"
            aria-label="Platform views"
            onKeyDown={(e) => onTabKeys(e, TABS.length, TAB_IDS.indexOf(tab), (k) => setTab(TABS[k].id))}
            className="flex flex-wrap gap-2 sm:inline-flex sm:gap-1 sm:rounded-lg sm:border sm:border-line sm:bg-surface sm:p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                tabIndex={tab === t.id ? 0 : -1}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative rounded-md px-4 py-2 text-sm font-medium transition-colors max-sm:border",
                  tab === t.id ? "text-on-accent max-sm:border-accent" : "text-ink-2 hover:text-ink max-sm:border-line",
                )}
              >
                {tab === t.id && (
                  <motion.span
                    layoutId="platform-tab"
                    className="absolute inset-0 rounded-md bg-accent"
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
