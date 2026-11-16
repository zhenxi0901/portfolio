"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { FileMagnifyingGlass, Robot } from "@phosphor-icons/react";
import { agents, aiStats, aiIntro } from "@/content/ai-platform";
import { cases } from "@/content/profile";
import { CaseCard } from "@/components/work/case-card";
import { caseViz } from "@/components/work/case-viz";
import { ProductTag, productTone } from "@/components/site/product-tag";
import { SectionHeading } from "@/components/site/section-heading";
import { OnCallLink } from "@/components/oncall/oncall-link";
import { Reveal } from "@/components/motion/reveal";
import { SystemMap } from "@/components/ai/system-map";
import { InfraStack } from "@/components/ai/infra-stack";
import { RequestTrace } from "@/components/ai/request-trace";
import { Measures } from "@/components/ai/measures";
import { useHashTab } from "@/lib/use-hash-tab";
import { cn } from "@/lib/utils";
import { onTabKeys } from "@/lib/tabs";

const TABS = [
  { id: "map", label: "Follow a request" },
  { id: "stack", label: "The AI infra stack" },
  { id: "trace", label: "Inside one request" },
  { id: "measure", label: "What I measure" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const TAB_IDS = TABS.map((t) => t.id);

const AGENT_ICON = { operator: Robot, documents: FileMagnifyingGlass } as const;

// This platform's case studies live in its own section, not in Work (see products.ts).
const aiCases = cases.filter((c) => c.products[0] === "ai");

/** `chapter`: the section opens /ai, so its heading is the page's h1 and the product tag would only repeat it. */
export function AiInfra({ chapter = false }: { chapter?: boolean } = {}) {
  const [tab, setTab] = useState<Tab>("map");
  // Other pages link straight to a tab: /ai#ai-trace.
  useHashTab("ai", TAB_IDS, setTab);
  // And this page opens one with openAiTab() (lib/utils.ts), for example from the case card below.
  useEffect(() => {
    const open = (e: Event) => {
      const id = (e as CustomEvent<Tab>).detail;
      if (TAB_IDS.includes(id)) setTab(id);
    };
    window.addEventListener("ai-tab", open);
    return () => window.removeEventListener("ai-tab", open);
  }, []);
  const tone = productTone.ai;
  // As the page's h1 the section heading moves up a level, and so does everything under it.
  const Sub = chapter ? "h2" : "h3";

  return (
    <section id="ai" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1320px] px-4 py-24 sm:px-8 sm:py-32">
        {/* On its own page the product's colour is a short rule, as on /iot; its name is the title below. */}
        {chapter ? <span aria-hidden className={cn("mb-6 block h-[3px] w-12", tone.bg)} /> : <ProductTag p="ai" className="mb-5" />}
        <SectionHeading as={chapter ? "h1" : "h2"} title="The AI agent platform I run" lead={aiIntro} />
        <OnCallLink drill="ai" />

        <Reveal className="mt-10">
          <div className="grid gap-3 md:grid-cols-2">
            {agents.map((a) => {
              const Icon = AGENT_ICON[a.id];
              return (
                // Two descriptions, not things to press: type under a rule in the product's colour, no box.
                <article key={a.id} className={cn("border-t-2 pt-4", tone.border)}>
                  <Sub className="flex items-center gap-2 font-semibold">
                    <Icon size={18} className={tone.text} aria-hidden />
                    {a.name}
                  </Sub>
                  <p className="mt-1.5 max-w-[56ch] text-[15px] leading-relaxed text-ink-2">{a.what}</p>
                  <p className="mt-2 text-sm text-ink-3">{a.runs}</p>
                </article>
              );
            })}
          </div>
          {/* A sentence, not a row of parts: a flex row put a gap between the link and its comma. */}
          <p className="mt-4 text-sm text-ink-2">
            Building data comes from the{" "}
            <a href="/iot" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              building IoT platform
            </a>
            , which I run on GKE; it has a chapter of its own.
          </p>
        </Reveal>

        <Reveal className="mt-10">
          <dl className="grid max-w-3xl gap-x-8 gap-y-6 sm:grid-cols-2">
            {aiStats.map((s) => (
              <div key={s.label} className="border-l border-line-strong pl-4">
                <dt className="text-3xl font-semibold tracking-[-0.04em]">{s.value}</dt>
                <dd className="mt-1.5 max-w-[34ch] text-sm leading-relaxed text-ink-2">{s.label}</dd>
              </div>
            ))}
          </dl>
        </Reveal>

        {aiCases.map((study) => {
          const Viz = caseViz[study.id];
          return (
            <div key={study.id} className="mt-12">
              <CaseCard study={study} tone="tint" wide level={chapter ? 2 : 3} chapter={chapter ? "ai" : undefined}>
                {Viz && <Viz />}
              </CaseCard>
            </div>
          );
        })}

        {/* The views: what the case card's "follow a request" link and openAiTab() scroll to. */}
        <div id="ai-views" className="mt-20 scroll-mt-24">
          <SectionHeading
            as={chapter ? "h2" : "h3"}
            title="Inside the platform"
            lead="Follow a request through it, see the AI infrastructure layer by layer, and switch on the lens to see which parts are mine."
          />
          <Reveal className="mt-8">
            <div
              role="tablist"
              aria-label="AI platform views"
              onKeyDown={(e) => onTabKeys(e, TABS.length, TAB_IDS.indexOf(tab), (k) => setTab(TABS[k].id))}
              className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  id={`ai-tab-${t.id}`}
                  aria-selected={tab === t.id}
                  tabIndex={tab === t.id ? 0 : -1}
                  aria-controls={`ai-panel-${t.id}`}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "relative rounded-md px-4 py-2 text-sm font-medium transition-colors",
                    tab === t.id ? "text-on-accent" : "text-ink-2 hover:text-ink",
                  )}
                >
                  {tab === t.id && (
                    <motion.span
                      layoutId="ai-tab"
                      className="absolute inset-0 rounded-md bg-accent"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative">{t.label}</span>
                </button>
              ))}
            </div>
          </Reveal>

          <div id={`ai-panel-${tab}`} role="tabpanel" aria-labelledby={`ai-tab-${tab}`} className="mt-8">
            {tab === "map" && <SystemMap level={chapter ? 3 : 4} />}
            {tab === "stack" && <InfraStack level={chapter ? 3 : 4} />}
            {tab === "trace" && <RequestTrace />}
            {tab === "measure" && <Measures level={chapter ? 3 : 4} />}
          </div>
        </div>
      </div>
    </section>
  );
}
