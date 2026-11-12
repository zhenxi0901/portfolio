"use client";

import { ArrowRight } from "@phosphor-icons/react";
import { cases } from "@/content/profile";
import { productOrder, products, type ProductKey as Key } from "@/content/products";
import { productIcon, productTone } from "@/components/site/product-tag";
import { Reveal } from "@/components/motion/reveal";
import { cn, scrollToId } from "@/lib/utils";

/** Where a product's part of the page starts: its case studies in Work if they are there, else its own section. */
export const productStart = (p: Key) =>
  !products[p].casesInSection && cases.some((c) => c.products[0] === p) ? `work-${p}` : products[p].anchor;

/** The three products, so every tag on the cards below (and on the map) means something. */
export function ProductKey() {
  return (
    <Reveal className="mt-10">
      <p className="text-sm text-ink-3">What I work on, and the colour each one wears across this site:</p>
      <ul className="mt-3 grid gap-3 md:grid-cols-3">
        {productOrder.map((p) => {
          const Icon = productIcon[p];
          const tone = productTone[p];
          return (
            <li key={p}>
              <button
                type="button"
                onClick={() => scrollToId(productStart(p))}
                className={cn(
                  "group flex h-full w-full gap-3.5 rounded-2xl border bg-surface p-4 text-left transition-colors hover:bg-surface-2/60",
                  tone.border,
                )}
              >
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", tone.soft, tone.text)}>
                  <Icon size={20} weight="duotone" />
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-[11px] text-ink-3">{products[p].org}</span>
                  <span className="flex items-center gap-1.5 font-semibold">
                    {products[p].name}
                    <ArrowRight size={13} className="text-ink-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-1 block text-sm leading-snug text-ink-2">{products[p].what}</span>
                  <span className={cn("mt-2 block font-mono text-xs", tone.text)}>{products[p].runs}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Reveal>
  );
}
