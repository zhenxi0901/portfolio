"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus } from "@phosphor-icons/react";
import { education, experience } from "@/content/profile";
import { SectionHeading } from "@/components/site/section-heading";

export function Experience() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="experience" className="mx-auto max-w-[1320px] scroll-mt-20 px-4 py-24 sm:px-8 sm:py-32">
      <SectionHeading title="Where I've worked" lead="From PLCs in a building's control room to Kubernetes in the cloud." />
      <ol className="mt-14 border-t border-line">
        {experience.map((role, i) => {
          const isOpen = open === i;
          return (
            <li key={role.org} className="border-b border-line">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="group grid w-full grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-7 text-left sm:grid-cols-[9rem_1fr_auto] sm:py-9"
              >
                <span className="order-2 col-span-2 font-mono text-xs text-ink-3 sm:order-none sm:col-span-1">{role.period}</span>
                <span className="text-[clamp(2rem,5.5vw,4.25rem)] font-semibold leading-none tracking-[-0.05em] transition-colors group-hover:text-accent-ink">
                  {role.org}
                </span>
                <span className="flex items-center gap-4">
                  <span className="hidden text-right text-sm text-ink-2 md:block">{role.role}</span>
                  <motion.span
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    className="grid size-10 place-items-center rounded-full border border-line-strong"
                  >
                    <Plus size={16} />
                  </motion.span>
                </span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="grid gap-6 pb-9 sm:grid-cols-[9rem_1fr]">
                      <p className="text-sm text-ink-3">
                        <span className="md:hidden">
                          {role.role}
                          <br />
                        </span>
                        {role.place}
                      </p>
                      <div>
                        <ul className="grid max-w-3xl gap-3">
                          {role.points.map((p) => (
                            <li key={p} className="text-lg leading-relaxed text-ink-2">
                              {p}
                            </li>
                          ))}
                        </ul>
                        <ul className="mt-5 flex flex-wrap gap-2" aria-label="Tools">
                          {role.tags.map((t) => (
                            <li key={t} className="rounded-full border border-line px-3 py-1 font-mono text-xs text-ink-2">
                              {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ol>

      <div className="mt-14 grid gap-2 rounded-3xl border border-line bg-surface p-6 sm:grid-cols-[9rem_1fr] sm:p-8">
        <p className="font-mono text-xs text-ink-3">{education.period}</p>
        <div>
          <p className="text-2xl font-semibold tracking-[-0.03em]">{education.school}</p>
          <p className="mt-1 text-ink-2">{education.degree}</p>
          <p className="mt-4 text-sm text-ink-2">
            Exchange semesters at <span className="text-ink">{education.exchanges[0]}</span> and{" "}
            <span className="text-ink">{education.exchanges[1]}</span>.
          </p>
        </div>
      </div>
    </section>
  );
}
