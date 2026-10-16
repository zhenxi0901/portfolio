"use client";

import { ArrowUpRight } from "@phosphor-icons/react";
import type { CaseStudy } from "@/content/profile";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/reveal";
import { ProductTag } from "@/components/site/product-tag";

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
            <div className="flex flex-wrap items-center gap-2">
              {study.products.map((p) => (
                <ProductTag key={p} p={p} />
              ))}
              <span className="font-mono text-xs text-ink-3">
                {study.org}, {study.year}
              </span>
            </div>
            <h3 className="mt-2 text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-[1.7rem]">{study.title}</h3>
            <p className="mt-2 max-w-[48ch] text-[15px] leading-relaxed text-ink-2">{study.summary}</p>
          </div>
        </header>

        <div className="mt-6 flex-1">{children}</div>

        <a
          href={`/work/${study.id}`}
          className="mt-6 inline-flex w-fit items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 py-2 text-sm font-medium transition-colors hover:border-ink-3"
        >
          Read the case <ArrowUpRight size={15} />
        </a>
      </article>
    </Reveal>
  );
}
