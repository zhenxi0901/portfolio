"use client";

import { ArrowRight } from "@phosphor-icons/react";
import type { CaseStudy } from "@/content/profile";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/reveal";
import { ProductTag } from "@/components/site/product-tag";
import type { ProductKey } from "@/content/products";

/**
 * One case study with its working model. `level` is the title's heading level: one below the heading
 * it sits under (h2 straight under a chapter's h1, h4 under a product's h3 in Work). `wide` is for a card that has a row to itself:
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
  chapter,
}: {
  study: CaseStudy;
  children: React.ReactNode;
  className?: string;
  tone?: "plain" | "dots" | "tint" | "raised";
  wide?: boolean;
  level?: 2 | 3 | 4;
  /** The chapter the card is shown in: its own product's tag would only repeat the page's title. */
  chapter?: ProductKey;
}) {
  const Title = level === 2 ? "h2" : level === 3 ? "h3" : "h4";
  return (
    <Reveal className={cn("h-full", className)}>
      <article
        id={`case-${study.id}`}
        className={cn(
          "group relative flex h-full scroll-mt-4 flex-col overflow-hidden rounded-3xl border border-line p-6 sm:p-7",
          wide && "lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[1fr_auto] lg:gap-x-10 lg:p-8",
          tone === "plain" && "bg-surface",
          tone === "raised" && "bg-surface-2",
          // Was a lime wash; now that --accent is ink, a mix of it read as a heavy grey. A quiet raised surface instead.
          tone === "tint" && "bg-surface-2",
          tone === "dots" && "bg-surface",
        )}
      >
        <header className={cn(wide && "lg:col-start-1 lg:row-start-1")}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* On a tint, ink-3 can fall under 4.5:1, so tinted cards use ink-2. */}
            <span className={cn("text-sm", tone === "tint" ? "text-ink-2" : "text-ink-3")}>
              {study.org}, {study.year}
            </span>
            {study.products
              .filter((p) => p !== chapter)
              .map((p) => (
                <ProductTag key={p} p={p} />
              ))}
          </div>
          <Title className="mt-2 text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-[1.65rem]">{study.title}</Title>
          <p className="mt-2 max-w-[48ch] text-[15px] leading-relaxed text-ink-2">{study.summary}</p>
          {study.measured !== undefined && (
            <p className="mt-3 max-w-[48ch] text-[15px] leading-relaxed text-ink-2">
              <span className="font-semibold text-ink">{study.numbers[study.measured].value}</span> {study.numbers[study.measured].label}
            </p>
          )}
        </header>

        <div className={cn("mt-6 flex-1", wide && "lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0")}>{children}</div>

        <a
          href={`/work/${study.id}`}
          className={cn(
            "mt-6 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-ink underline decoration-line-strong decoration-2 underline-offset-[5px] transition-colors hover:decoration-ink",
            wide && "lg:col-start-1 lg:row-start-2 lg:self-end",
          )}
        >
          Read the case <ArrowRight size={15} />
        </a>
      </article>
    </Reveal>
  );
}
