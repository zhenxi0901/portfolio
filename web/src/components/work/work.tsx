import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { cases } from "@/content/profile";
import { productOrder, products, type ProductKey } from "@/content/products";
import { Reveal } from "@/components/motion/reveal";
import { productTone } from "@/components/site/product-tag";
import { SectionHeading } from "@/components/site/section-heading";
import { CaseCard } from "@/components/work/case-card";
import { caseViz } from "@/components/work/case-viz";
import { ProductKey as ProductLegend } from "@/components/work/product-key";
import { cn } from "@/lib/utils";

type Tone = "plain" | "dots" | "tint" | "raised";

/**
 * Where each card sits in its product's 12-column grid. A card with no entry takes half a row.
 * The GKE card spans two rows on purpose: its model plays the migration from one VM to a whole
 * cluster when first seen, and the room beside the two short cards lets it grow without pushing
 * the rest of the page down while someone reads. Give it a row of its own and it jumps by ~550 px.
 */
const placement: Record<string, { span: string; tone?: Tone; wide?: boolean }> = {
  gke: { span: "lg:col-span-7 lg:row-span-2", tone: "dots" },
  pipeline: { span: "lg:col-span-5", tone: "raised" },
  reaper: { span: "lg:col-span-5" },
  observability: { span: "lg:col-span-5", tone: "raised" },
  control: { span: "lg:col-span-7", tone: "dots" },
  "two-step": { span: "lg:col-span-12", wide: true },
};

/** Each product's own section further down the page. */
const deeper: Partial<Record<ProductKey, string>> = {
  iot: "Inside the platform: traffic, SLOs, cost",
};

// One group per product, in the order the legend lists them. A case belongs to its first product.
// A product whose cases sit in its own section (products.ts) has no group here.
const groups = productOrder
  .filter((p) => !products[p].casesInSection)
  .map((p) => ({ p, studies: cases.filter((c) => c.products[0] === p) }))
  .filter((g) => g.studies.length > 0);

/**
 * `chapter` is the product whose chapter this is (/iot): only its cards show, and since the
 * chapter's title has said what this is, the big heading and the key to the products go and the
 * group heading becomes the section's. The one-page version (/v1) shows every group, with both.
 */
export function Work({ chapter }: { chapter?: ProductKey } = {}) {
  return (
    <section id="work" className={cn("mx-auto max-w-[1320px] scroll-mt-20 px-4 sm:px-8", chapter ? "pb-20 pt-14 sm:pb-28 sm:pt-16" : "py-24 sm:py-32")}>
      {!chapter && (
        <>
          <SectionHeading
            title="Production work, as models you can run"
            lead="Things I shipped at Primustech, each a small working model of the real system. Press the buttons."
          />
          <ProductLegend />
        </>
      )}

      {(chapter ? groups.filter((g) => g.p === chapter) : groups).map(({ p, studies }) => {
        const GroupTitle = chapter ? "h2" : "h3";
        const tone = productTone[p];
        return (
          <div key={p} id={`work-${p}`} className={cn(!chapter && "mt-16", "scroll-mt-24")} role="group" aria-labelledby={`work-${p}-title`}>
            <Reveal>
              <div className={cn("flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b pb-4", tone.border)}>
                <div>
                  <p className="text-sm text-ink-3">
                    {products[p].org}, {products[p].runs}
                  </p>
                  <GroupTitle id={`work-${p}-title`} className="mt-1 text-2xl font-semibold tracking-[-0.02em] sm:text-[1.65rem]">
                    {chapter ? "What I shipped, as working models" : products[p].name}
                  </GroupTitle>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                  <span className="text-ink-3">
                    {studies.length} case {studies.length === 1 ? "study" : "studies"}
                  </span>
                  {deeper[p] && (
                    <a href={`#${products[p].anchor}`} className="group inline-flex items-center gap-1.5 text-ink-2 transition-colors hover:text-ink">
                      {deeper[p]}
                      <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </a>
                  )}
                </div>
              </div>
            </Reveal>

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
              {studies.map((study) => {
                const { span, tone: cardTone, wide } = placement[study.id] ?? { span: "lg:col-span-6" };
                const Viz = caseViz[study.id];
                return (
                  <CaseCard key={study.id} study={study} tone={cardTone} wide={wide} level={chapter ? 3 : 4} chapter={chapter} className={span}>
                    {Viz && <Viz />}
                  </CaseCard>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
