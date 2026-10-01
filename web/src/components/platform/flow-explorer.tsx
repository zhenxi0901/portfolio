"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { flows } from "@/content/profile";
import { cn } from "@/lib/utils";

/** Pick a journey; a packet walks it hop by hop with what happens at each boundary. */
export function FlowExplorer() {
  const [active, setActive] = useState(flows[0].id);
  const reduce = useReducedMotion();
  const flow = flows.find((f) => f.id === active)!;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div role="tablist" aria-label="Traffic paths" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {flows.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={active === f.id}
            onClick={() => setActive(f.id)}
            className={cn(
              "shrink-0 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-colors",
              active === f.id ? "border-accent-ink bg-surface text-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
            )}
          >
            {f.name}
          </button>
        ))}
      </div>

      <div className="relative rounded-3xl border border-line bg-surface p-5 sm:p-7">
        <p className="mb-6 max-w-[62ch] text-[15px] leading-relaxed text-ink" aria-live="polite">
          {flow.about}
        </p>
        <AnimatePresence mode="wait">
          <motion.ol
            key={flow.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative grid gap-5"
            aria-label={flow.name}
          >
            {/* The wire, with a packet riding it. */}
            <span aria-hidden className="absolute bottom-3 left-[15px] top-3 w-px bg-line-strong" />
            {!reduce && (
              <motion.span
                aria-hidden
                className="absolute bottom-3 left-[12px] top-3 w-[7px]"
                initial={{ y: "0%" }}
                animate={{ y: ["0%", "100%"] }}
                transition={{ duration: flow.hops.length * 0.9, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.8 }}
              >
                <span className="absolute -top-[3px] left-0 size-[7px] rounded-full bg-accent-ink" />
              </motion.span>
            )}
            {flow.hops.map((hop, i) => (
              <motion.li
                key={hop.at}
                initial={reduce ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.09, duration: 0.35 }}
                className="relative grid grid-cols-[32px_1fr] gap-3"
              >
                <span className="relative z-10 mt-0.5 grid size-[31px] place-items-center rounded-full border border-line-strong bg-surface font-mono text-[11px] text-ink-2">
                  {i + 1}
                </span>
                <div>
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{hop.at}</span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-ink-2">{hop.tag}</span>
                  </p>
                  <p className="mt-1.5 max-w-[62ch] text-[15px] leading-relaxed text-ink-2">{hop.text}</p>
                </div>
              </motion.li>
            ))}
          </motion.ol>
        </AnimatePresence>
      </div>
    </div>
  );
}
