"use client";

import { ArrowUpRight } from "@phosphor-icons/react";
import type { CaseStudy } from "@/content/profile";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/reveal";
import { ProductTag } from "@/components/site/product-tag";

/**
 * One case study with its working model. `level` is the title's heading level: h4 under a product's
 * heading in Work, h3 directly under a section's h2. `wide` is for a card that has a row to itself:
 * on large screens the text goes on the left and the model on the right, instead of the model
 * stretching across the row.
 */
export function CaseCard({
  study,
  children,
  className,
  tone = "plain",
  wide = false,
  level = 4,
}: {
  study: CaseStudy;
  children: React.ReactNode;
  className?: string;
  tone?: "plain" | "dots" | "tint" | "raised";
  wide?: boolean;
  level?: 3 | 4;
}) {
  const Title = level === 3 ? "h3" : "h4";
  return (
    <Reveal className={cn("h-full", className)}>
      <article
        id={`case-${study.id}`}
        className={cn(
          "group relative flex h-full scroll-mt-24 flex-col overflow-hidden rounded-3xl border border-line p-6 sm:p-7",
          wide && "lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[1fr_auto] lg:gap-x-10 lg:p-8",
          tone === "plain" && "bg-surface",
          tone === "raised" && "bg-surface-2",
          tone === "tint" && "bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface))]",
          tone === "dots" && "dot-grid bg-surface",
        )}
      >
        <header className={cn(wide && "lg:col-start-1 lg:row-start-1")}>
          <div className="flex flex-wrap items-center gap-2">
            {study.products.map((p) => (
              <ProductTag key={p} p={p} />
            ))}
            {/* On the accent tint, ink-3 falls just under 4.5:1 in dark mode, so tinted cards use ink-2. */}
            <span className={cn("font-mono text-xs", tone === "tint" ? "text-ink-2" : "text-ink-3")}>
              {study.org}, {study.year}
            </span>
          </div>
          <Title className="mt-2 text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-[1.7rem]">{study.title}</Title>
          <p className="mt-2 max-w-[48ch] text-[15px] leading-relaxed text-ink-2">{study.summary}</p>
        </header>

        <div className={cn("mt-6 flex-1", wide && "lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0")}>{children}</div>

        <a
          href={`/work/${study.id}`}
          className={cn(
            "mt-6 inline-flex w-fit items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 py-2 text-sm font-medium transition-colors hover:border-ink-3",
            wide && "lg:col-start-1 lg:row-start-2 lg:self-end",
          )}
        >
          Read the case <ArrowUpRight size={15} />
        </a>
      </article>
    </Reveal>
  );
}
