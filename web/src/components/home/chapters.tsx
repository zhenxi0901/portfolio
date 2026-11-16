import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { cases } from "@/content/profile";
import { productOrder, products } from "@/content/products";
import { chapterHeadline as headline } from "@/content/headlines";
import { productTone } from "@/components/site/product-tag";
import { SectionHeading } from "@/components/site/section-heading";
import { productPage } from "@/lib/sections";
import { cn } from "@/lib/utils";

/**
 * The three things I work on, each the door to its chapter: the home page says what is here and sends
 * you to it, not to hold all of it (decision 11). No boxes: they are three columns of type under a thin
 * rule in their product's colour, and the number in each is a fact from the work, so it is ink, not lime.
 */
export function Chapters() {
  return (
    <section id="chapters" className="mx-auto max-w-[1320px] scroll-mt-20 px-4 py-24 sm:px-8 sm:py-28">
      <SectionHeading
        title="Two platforms in production, and the research behind my final-year project"
        lead="I run both platforms at Primustech; the research is at NTU's HyScale Lab. Each chapter has what I built, a working model of it you can press, and the numbers."
      />
      <ol className="mt-14 grid gap-12 lg:grid-cols-3 lg:gap-10">
        {productOrder.map((p) => {
          const studies = cases.filter((c) => c.products[0] === p).length;
          return (
            <li key={p}>
              <a href={productPage[p]} className="group block">
                <span aria-hidden className={cn("block h-[3px] w-12", productTone[p].bg)} />
                <span className="mt-5 block text-sm text-ink-3">
                  {products[p].org}, {products[p].runs}
                </span>
                <span className="mt-2 block text-2xl font-semibold tracking-[-0.02em] decoration-2 underline-offset-[6px] group-hover:underline">
                  {products[p].name}
                </span>
                <span className="mt-3 block text-[15px] leading-relaxed text-ink-2">{products[p].what}</span>
                <span className="mt-7 block text-5xl font-semibold tracking-[-0.03em]">{headline[p].value}</span>
                <span className="mt-2 block max-w-[34ch] text-sm leading-snug text-ink-2">{headline[p].label}</span>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                  {studies ? `${studies} case ${studies === 1 ? "study" : "studies"} in the chapter` : "Open the chapter"}
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
