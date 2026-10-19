"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "@phosphor-icons/react";
import { scrollToId } from "@/lib/utils";
import { Reveal } from "@/components/motion/reveal";

const STEPS = [
  { label: "Question", note: "from a facility manager" },
  { label: "Agent team", note: "Agno on Cloud Run" },
  { label: "Data", note: "live readings, documents" },
  { label: "Gemini", note: "Vertex AI, OpenRouter" },
  { label: "Answer", note: "traced with tokens and cost" },
];

/** The request path through the AI products, with a packet riding it. */
export function AiViz() {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="relative">
        <ol className="relative z-10 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.label} delay={i * 0.12} y={10} className="rounded-2xl border border-line bg-surface p-3">
              <p className="text-sm font-semibold">{s.label}</p>
              <p className="mt-1 text-xs leading-snug text-ink-2">{s.note}</p>
            </Reveal>
          ))}
        </ol>
        {!reduce && (
          <div aria-hidden className="pointer-events-none absolute inset-x-3 top-1/2 hidden h-px bg-line-strong sm:block">
            {/* The dot moves along the line itself. (A full-width carrier translated by its own width
                looked the same but stuck out past the line, widening any page without a clipping parent.) */}
            <motion.span
              className="absolute -top-[3px] size-[7px] -translate-x-1/2 rounded-full bg-accent-ink"
              animate={{ left: ["0%", "100%"] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.6 }}
            />
          </div>
        )}
      </div>
      <ul className="grid gap-2 text-sm text-ink-2 sm:grid-cols-3">
        <li className="rounded-2xl bg-surface p-3">Load and latency tests on the agent API</li>
        <li className="rounded-2xl bg-surface p-3">Token cost tracked per request</li>
        <li className="rounded-2xl bg-surface p-3">Models compared on latency and cost</li>
      </ul>
      <button
        type="button"
        onClick={() => scrollToId("ai")}
        className="mt-auto inline-flex w-fit items-center gap-1.5 text-sm font-medium text-ink underline decoration-accent-ink decoration-2 underline-offset-4"
      >
        Follow a request through the whole platform <ArrowRight size={14} />
      </button>
    </div>
  );
}
