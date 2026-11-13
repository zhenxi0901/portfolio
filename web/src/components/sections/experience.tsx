"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Plus } from "@phosphor-icons/react";
import { cases, education, experience } from "@/content/profile";
import { products } from "@/content/products";
import { SectionHeading } from "@/components/site/section-heading";
import { ProductTag } from "@/components/site/product-tag";
import { productStart } from "@/components/work/product-key";
import { scrollToId } from "@/lib/utils";

function Points({ points }: { points: string[] }) {
  return (
    <ul className="grid max-w-3xl gap-3">
      {points.map((p) => (
        <li key={p} className="text-[15px] leading-relaxed text-ink-2 sm:text-base">
          {p}
        </li>
      ))}
    </ul>
  );
}

function Tags({ tags }: { tags: string[] }) {
  return (
    <ul className="mt-5 flex flex-wrap gap-2" aria-label="Tools">
      {tags.map((t) => (
        <li key={t} className="rounded-full border border-line px-3 py-1 font-mono text-xs text-ink-2">
          {t}
        </li>
      ))}
    </ul>
  );
}

export function Experience() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="experience" className="mx-auto max-w-[1320px] scroll-mt-20 px-4 py-24 sm:px-8 sm:py-32">
      <SectionHeading title="Where I've worked" lead="From PLCs in a building's control room to Kubernetes in the cloud." />
      <ol className="mt-12 border-t border-line">
        {experience.map((role, i) => {
          const isOpen = open === i;
          return (
            <li key={role.org} className="border-b border-line">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="group grid w-full grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-5 text-left sm:grid-cols-[9rem_1fr_auto] sm:py-6"
              >
                <span className="order-2 col-span-2 font-mono text-xs text-ink-3 sm:order-none sm:col-span-1">{role.period}</span>
                <span className="min-w-0">
                  <span className="block text-[clamp(1.25rem,2.2vw,1.75rem)] font-semibold leading-tight tracking-[-0.03em] transition-colors group-hover:text-accent-ink">
                    {role.org}
                  </span>
                  <span className="mt-1 block text-sm text-ink-2">{role.role}</span>
                  {/* Closed, the tags say the role spans products; open, each block below is labelled. */}
                  {role.byProduct && !isOpen && (
                    <span className="mt-2.5 flex flex-wrap gap-1.5">
                      {role.byProduct.map((part) => (
                        <ProductTag key={part.product} p={part.product} />
                      ))}
                    </span>
                  )}
                </span>
                <span className="flex items-center">
                  <motion.span
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    className="grid size-9 place-items-center rounded-full border border-line-strong"
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
                    <div className="grid gap-4 pb-7 sm:grid-cols-[9rem_1fr] sm:gap-6">
                      <p className="text-sm text-ink-3">{role.place}</p>
                      {role.byProduct ? (
                        // One block per product, each with its own points, tools and a way to its case studies.
                        <div className="grid gap-9">
                          {role.byProduct.map((part) => {
                            const studies = cases.filter((c) => c.products[0] === part.product);
                            // One case study: straight to its card. Several: to where they start.
                            const target = studies.length === 1 ? `case-${studies[0].id}` : productStart(part.product);
                            return (
                              <div key={part.product} role="group" aria-label={products[part.product].name}>
                                <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                                  <ProductTag p={part.product} />
                                  {/* To its case studies, or, for work with none (the research), to its section. */}
                                  <button
                                    type="button"
                                    onClick={() => scrollToId(studies.length ? target : products[part.product].anchor)}
                                    className="group inline-flex min-h-6 items-center gap-1 text-sm text-ink-3 transition-colors hover:text-ink"
                                  >
                                    {studies.length === 0 ? products[part.product].chapter : studies.length === 1 ? "Its case study" : `Its ${studies.length} case studies`}
                                    <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
                                  </button>
                                </div>
                                <Points points={part.points} />
                                <Tags tags={part.tags} />
                              </div>
                            );
                          })}
                          {role.points.length > 0 && (
                            // Work for the same employer that belongs to neither product.
                            <div role="group" aria-label="Outside both platforms">
                              <p className="mb-4 font-mono text-xs text-ink-3">Also</p>
                              <Points points={role.points} />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <Points points={role.points} />
                          <Tags tags={role.tags} />
                        </div>
                      )}
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
          <p className="text-xl font-semibold tracking-[-0.02em]">{education.school}</p>
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
