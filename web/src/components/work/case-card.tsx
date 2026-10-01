"use client";

import { ArrowUpRight, CheckCircle } from "@phosphor-icons/react";
import type { CaseStudy } from "@/content/profile";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Reveal } from "@/components/motion/reveal";

export function CaseCard({
  study,
  children,
  className,
  tone = "plain",
}: {
  study: CaseStudy;
  children: React.ReactNode;
  className?: string;
  tone?: "plain" | "dots" | "tint" | "raised";
}) {
  return (
    <Reveal className={cn("h-full", className)}>
      <article
        id={`case-${study.id}`}
        className={cn(
          "group relative flex h-full scroll-mt-24 flex-col overflow-hidden rounded-3xl border border-line p-6 sm:p-7",
          tone === "plain" && "bg-surface",
          tone === "raised" && "bg-surface-2",
          tone === "tint" && "bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface))]",
          tone === "dots" && "dot-grid bg-surface",
        )}
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-ink-3">
              {study.org}, {study.year}
            </p>
            <h3 className="mt-2 text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-[1.7rem]">{study.title}</h3>
            <p className="mt-2 max-w-[48ch] text-[15px] leading-relaxed text-ink-2">{study.summary}</p>
          </div>
        </header>

        <div className="mt-6 flex-1">{children}</div>

        <Dialog>
          <DialogTrigger className="mt-6 inline-flex w-fit items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 py-2 text-sm font-medium transition-colors hover:border-ink-3">
            Read the case <ArrowUpRight size={15} />
          </DialogTrigger>
          <DialogContent>
            <p className="font-mono text-xs text-ink-3">
              {study.org}, {study.year}
            </p>
            <DialogTitle className="mt-2 pr-10 text-3xl font-semibold tracking-[-0.03em]">{study.title}</DialogTitle>
            <DialogDescription className="mt-4 text-[15px] leading-relaxed text-ink-2">{study.problem}</DialogDescription>
            <h4 className="mt-7 text-sm font-semibold">What I did</h4>
            <ul className="mt-3 space-y-3">
              {study.did.map((d) => (
                <li key={d} className="flex gap-3 text-[15px] leading-relaxed text-ink-2">
                  <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-accent-ink" />
                  {d}
                </li>
              ))}
            </ul>
            <p className="mt-7 rounded-2xl bg-surface-2 p-4 text-[15px] font-medium leading-relaxed">{study.result}</p>
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Stack">
              {study.stack.map((s) => (
                <li key={s} className="rounded-full border border-line px-3 py-1 font-mono text-xs text-ink-2">
                  {s}
                </li>
              ))}
            </ul>
          </DialogContent>
        </Dialog>
      </article>
    </Reveal>
  );
}
