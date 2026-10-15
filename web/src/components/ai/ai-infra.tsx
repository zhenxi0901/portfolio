"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowDown } from "@phosphor-icons/react";
import { aiStats, aibeIntro } from "@/content/aibe";
import { SectionHeading } from "@/components/site/section-heading";
import { Reveal } from "@/components/motion/reveal";
import { SystemMap } from "@/components/ai/system-map";
import { Measures } from "@/components/ai/measures";
import { cn, scrollToId } from "@/lib/utils";

const TABS = [
  { id: "map", label: "Follow a request" },
  { id: "measure", label: "What I measure" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function AiInfra() {
  const [tab, setTab] = useState<Tab>("map");

  return (
    <section id="ai" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1320px] px-4 py-24 sm:px-8 sm:py-32">
        <SectionHeading
          title={
            <>
              The AI platform <span className="text-accent-ink">I run</span>.
            </>
          }
          lead={`${aibeIntro} Follow a request through it, and switch on the lens to see which parts are mine.`}
        />

        <Reveal className="mt-10">
          <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
            {aiStats.map((s) => (
              <div key={s.label} className="border-l border-line-strong pl-4">
                <dt className="text-3xl font-semibold tracking-[-0.04em]">{s.value}</dt>
                <dd className="mt-1.5 max-w-[34ch] text-sm leading-relaxed text-ink-2">{s.label}</dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <Reveal className="mt-12">
          <div role="tablist" aria-label="AI platform views" className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-surface p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`ai-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`ai-panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  tab === t.id ? "text-on-accent" : "text-ink-2 hover:text-ink",
                )}
              >
                {tab === t.id && (
                  <motion.span
                    layoutId="ai-tab"
                    className="absolute inset-0 rounded-full bg-accent"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative">{t.label}</span>
              </button>
            ))}
          </div>
        </Reveal>

        <div id={`ai-panel-${tab}`} role="tabpanel" aria-labelledby={`ai-tab-${tab}`} className="mt-8">
          {tab === "map" && <SystemMap />}
          {tab === "measure" && <Measures />}
        </div>

        <button
          type="button"
          onClick={() => scrollToId("research")}
          className="mt-10 inline-flex items-center gap-1.5 text-sm font-medium underline decoration-accent-ink decoration-2 underline-offset-4"
        >
          The research side: what serving an AI agent really costs <ArrowDown size={14} />
        </button>
      </div>
    </section>
  );
}
