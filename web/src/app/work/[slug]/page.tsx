import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { cases } from "@/content/profile";
import { ArticleShell, Part, Prose, StatRow } from "@/components/article/article-shell";
import { caseViz } from "@/components/work/case-viz";
import { ProductTag } from "@/components/site/product-tag";
import { Reveal } from "@/components/motion/reveal";
import { pageMetadata } from "@/lib/page-metadata";

// Static export: only these five cases exist; anything else is the 404 page.
export const dynamicParams = false;

export function generateStaticParams() {
  return cases.map((c) => ({ slug: c.id }));
}

export async function generateMetadata(props: PageProps<"/work/[slug]">) {
  const { slug } = await props.params;
  const c = cases.find((x) => x.id === slug);
  if (!c) return {};
  return pageMetadata({ title: `${c.title}: a case study`, description: c.summary, path: `/work/${c.id}` });
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
    <ArticleShell back={{ href: `/#case-${c.id}`, label: "All work" }}>
      <p className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2">
        {c.products.map((p) => (
          <ProductTag key={p} p={p} />
        ))}
        <span className="font-mono text-xs text-ink-3">
          {c.org}, {c.year} · Case study
        </span>
      </p>
      <h1 className="mt-4 text-[clamp(2.25rem,5.5vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.045em]">{c.title}</h1>
      <p className="mt-6 max-w-[60ch] text-lg leading-relaxed text-ink-2">{c.summary}</p>
      <StatRow stats={c.numbers} />

      {Viz && (
        <Reveal className="mt-10">
          <div className="rounded-3xl border border-line bg-surface p-5 sm:p-7">
            <p className="font-mono text-xs text-ink-3">A small working model of the real system. Press the buttons.</p>
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
            <li key={d} className="flex gap-4">
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line-strong font-mono text-xs text-ink-2">
                {n + 1}
              </span>
              <p className="pt-0.5 text-[15px] leading-relaxed text-ink-2 sm:text-base">{d}</p>
            </li>
          ))}
        </ol>
      </Part>

      <figure className="mt-14 rounded-3xl bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface))] p-6 sm:p-8">
        <figcaption className="font-mono text-xs uppercase tracking-[0.18em] text-ink-3">The result</figcaption>
        <p className="mt-3 text-2xl font-semibold leading-snug tracking-[-0.02em] sm:text-3xl">{c.result}</p>
      </figure>

      <Part title="Stack">
        <ul className="flex flex-wrap gap-2" aria-label="Stack">
          {c.stack.map((s) => (
            <li key={s} className="rounded-full border border-line px-3 py-1 font-mono text-xs text-ink-2">
              {s}
            </li>
          ))}
        </ul>
      </Part>

      {c.deeper.length > 0 && (
        <Part title="Go deeper">
          <ul className="divide-y divide-line rounded-3xl border border-line bg-surface">
            {c.deeper.map((d) => (
              <li key={d.href}>
                <a href={d.href} className="group flex items-center justify-between gap-4 p-4 text-[15px] transition-colors hover:text-ink sm:p-5 sm:text-base">
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
