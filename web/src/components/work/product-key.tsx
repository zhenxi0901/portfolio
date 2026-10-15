"use client";

import { ArrowRight } from "@phosphor-icons/react";
import { productOrder, products } from "@/content/products";
import { productIcon, productTone } from "@/components/site/product-tag";
import { Reveal } from "@/components/motion/reveal";
import { cn, scrollToId } from "@/lib/utils";

/** The three products, so every tag on the cards below (and on the map) means something. */
export function ProductKey() {
  return (
    <Reveal className="mt-10">
      <p className="text-sm text-ink-3">What I run, and the colour each one wears on this page:</p>
      <ul className="mt-3 grid gap-3 md:grid-cols-3">
        {productOrder.map((p) => {
          const Icon = productIcon[p];
          const tone = productTone[p];
          return (
            <li key={p}>
              <button
                type="button"
                onClick={() => scrollToId(products[p].anchor)}
                className={cn(
                  "group flex h-full w-full gap-3.5 rounded-2xl border bg-surface p-4 text-left transition-colors hover:bg-surface-2/60",
                  tone.border,
                )}
              >
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", tone.soft, tone.text)}>
                  <Icon size={20} weight="duotone" />
                </span>
                <span className="min-w-0">
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
