import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { cases } from "@/content/profile";
import { productOrder, products } from "@/content/products";
import { chapterHeadline as headline } from "@/content/headlines";
import { productIcon, productTone } from "@/components/site/product-tag";
import { SectionHeading } from "@/components/site/section-heading";
import { Reveal } from "@/components/motion/reveal";
import { productPage } from "@/lib/sections";
import { cn } from "@/lib/utils";

/**
 * The three things I work on, one card each, and each card is the door to its chapter: the home
 * page's job is to say what is here and send you to it, not to hold all of it (decision 11).
 */
export function Chapters() {
  return (
    <section id="chapters" className="mx-auto max-w-[1320px] scroll-mt-20 px-4 py-24 sm:px-8 sm:py-28">
      <SectionHeading
        title={
          <>
            Three systems, <span className="text-accent-ink">a chapter each</span>.
          </>
        }
        lead="Two platforms I run in production at Primustech, and the research behind my final-year project at NTU. Each chapter has what I built, working models of it, and the numbers."
      />
      <ol className="mt-12 grid gap-4 lg:grid-cols-3">
        {productOrder.map((p, i) => {
          const Icon = productIcon[p];
          const tone = productTone[p];
          const studies = cases.filter((c) => c.products[0] === p).length;
          return (
            <Reveal key={p} as="li" delay={i * 0.06} className="h-full">
              <a
                href={productPage[p]}
                className={cn("group flex h-full flex-col rounded-3xl border bg-surface p-6 transition-colors hover:bg-surface-2/60 sm:p-7", tone.border)}
              >
                <span className="flex items-center gap-3">
                  <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", tone.soft, tone.text)}>
                    <Icon size={22} weight="duotone" aria-hidden />
                  </span>
                  <span className="font-mono text-[11px] leading-snug text-ink-3">
                    {products[p].org}
                    <br />
                    {products[p].runs}
                  </span>
                </span>
                <span className="mt-6 block text-2xl font-semibold tracking-[-0.03em]">{products[p].name}</span>
                <span className="mt-2 block text-[15px] leading-relaxed text-ink-2">{products[p].what}</span>
                <span className="mt-6 block border-t border-line pt-5">
                  <span className="block text-4xl font-semibold tracking-[-0.04em]">{headline[p].value}</span>
                  <span className="mt-1 block text-sm leading-snug text-ink-2">{headline[p].label}</span>
                </span>
                <span className="mt-auto flex items-center justify-between gap-3 pt-6 text-sm">
                  <span className={cn("font-mono text-xs", tone.text)}>
                    {studies ? `${studies} case ${studies === 1 ? "study" : "studies"}` : "research"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    Open the chapter
                    <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </span>
              </a>
            </Reveal>
          );
        })}
      </ol>
    </section>
  );
}
