import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { cases } from "@/content/profile";
import { products } from "@/content/products";
import { ArticleShell, Part, Prose, StatRow } from "@/components/article/article-shell";
import { caseModelNote, caseViz } from "@/components/work/case-viz";
import { ProductTag } from "@/components/site/product-tag";
import { Reveal } from "@/components/motion/reveal";
import { pageMetadata } from "@/lib/page-metadata";
import { sectionHref } from "@/lib/sections";

// Static export: only the cases in profile.ts exist; anything else is the 404 page.
export const dynamicParams = false;

export function generateStaticParams() {
  return cases.map((c) => ({ slug: c.id }));
}

export async function generateMetadata(props: PageProps<"/work/[slug]">) {
  const { slug } = await props.params;
  const c = cases.find((x) => x.id === slug);
  if (!c) return {};
  return pageMetadata({ title: c.title, description: c.summary, path: `/work/${c.id}`, markdown: `work/${c.id}.md` });
}

export default async function CasePage(props: PageProps<"/work/[slug]">) {
  const { slug } = await props.params;
  const i = cases.findIndex((x) => x.id === slug);
  if (i < 0) notFound();
  const c = cases[i];
  const Viz = caseViz[c.id];
  const prev = cases[(i - 1 + cases.length) % cases.length];
  const next = cases[(i + 1) % cases.length];

  return (
    // Back to the card on the home page, which sits with its product: in Work, or in the product's own section.
    <ArticleShell back={{ href: sectionHref(`case-${c.id}`), label: products[c.products[0]].name }}>
      <h1 className="mt-10 max-w-[24ch] text-[clamp(2.25rem,4.6vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.028em]">{c.title}</h1>
      <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-3">
        <span>
          {c.org}, {c.year}
        </span>
        {c.products.map((p) => (
          <ProductTag key={p} p={p} />
        ))}
      </p>
      <p className="mt-6 max-w-[60ch] text-lg leading-relaxed text-ink-2">{c.summary}</p>
      <StatRow stats={c.numbers} />

      {Viz && (
        <Reveal className="mt-10">
          <div className="overflow-hidden rounded-3xl border border-line bg-surface p-5 sm:p-7">
            <p className="max-w-[70ch] text-sm leading-relaxed text-ink-2">{caseModelNote[c.id] ?? "A small working model of the real system."}</p>
            <div className="mt-5">
              <Viz />
            </div>
          </div>
        </Reveal>
      )}

      <Part title="The problem">
        <Prose paras={[c.problem]} />
      </Part>

      <Part title="What I did">
        <ol className="space-y-5">
          {c.did.map((d, n) => (
            <li key={d} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
              <span className="pt-0.5 font-mono text-sm text-ink-3">{n + 1}.</span>
              <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-2 sm:text-base">{d}</p>
            </li>
          ))}
        </ol>
      </Part>

      <figure className="mt-14 border-l-2 border-ink pl-6">
        <figcaption className="text-sm font-medium text-ink-3">The result</figcaption>
        <p className="mt-2 max-w-[44ch] text-2xl font-semibold leading-snug tracking-[-0.015em] sm:text-[1.75rem]">{c.result}</p>
      </figure>

      <Part title="Stack">
        {/* A plain line: the tools are words, not machine output, and not things to press. */}
        <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-2">{c.stack.join(", ")}</p>
      </Part>

      {c.deeper.length > 0 && (
        <Part title="Go deeper">
          <ul className="divide-y divide-line border-y border-line">
            {c.deeper.map((d) => (
              <li key={d.href}>
                <a href={d.href} className="group flex items-center justify-between gap-4 py-4 text-[15px] transition-colors hover:text-ink sm:text-base">
                  <span className="text-ink-2 group-hover:text-ink">{d.label}</span>
                  <ArrowUpRight size={16} className="shrink-0 text-ink-3 group-hover:text-ink" />
                </a>
              </li>
            ))}
          </ul>
        </Part>
      )}

      <nav aria-label="More case studies" className="mt-16 grid gap-3 sm:grid-cols-2">
        <a href={`/work/${prev.id}`} className="group rounded-3xl border border-line bg-surface p-5 transition-colors hover:border-ink-3">
          <span className="inline-flex items-center gap-1.5 text-sm text-ink-3">
            <ArrowLeft size={13} /> Previous case
          </span>
          <span className="mt-2 block font-semibold leading-snug">{prev.title}</span>
        </a>
        <a href={`/work/${next.id}`} className="group rounded-3xl border border-line bg-surface p-5 text-right transition-colors hover:border-ink-3">
          <span className="inline-flex items-center gap-1.5 text-sm text-ink-3">
            Next case <ArrowRight size={13} />
          </span>
          <span className="mt-2 block font-semibold leading-snug">{next.title}</span>
        </a>
      </nav>
    </ArticleShell>
  );
}
