import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { postmortems } from "@/content/postmortems";
import { posts } from "@/content/writing";
import { Reveal } from "@/components/motion/reveal";

type Item = { href: string; title: string; summary: string; date: string; kind: string };

// Posts and postmortems in one list, newest first; the home page shows the latest three.
const items: Item[] = [
  ...posts.map((p) => ({ href: `/writing/${p.slug}`, title: p.title, summary: p.summary, date: p.date, kind: "Post" })),
  ...postmortems.map((p) => ({ href: `/postmortems/${p.slug}`, title: p.title, summary: p.summary, date: p.date, kind: "Postmortem" })),
].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

export function Latest() {
  return (
    <section id="latest" aria-labelledby="latest-title" className="mx-auto max-w-[1320px] scroll-mt-20 px-4 py-24 sm:px-8 sm:py-28">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="latest-title" className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.04em]">
          Latest writing
        </h2>
        <a href="/writing" className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink">
          All posts and postmortems
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
        </a>
      </div>
      <ol className="mt-8 divide-y divide-line border-y border-line">
        {items.slice(0, 3).map((item, i) => (
          <Reveal key={item.href} as="li" delay={i * 0.05}>
            <a href={item.href} className="group grid gap-x-8 gap-y-1 py-6 sm:grid-cols-[9rem_1fr_auto] sm:items-baseline">
              <span className="font-mono text-xs text-ink-3">
                {item.date} · {item.kind}
              </span>
              <span>
                <span className="block text-lg font-semibold leading-snug tracking-[-0.02em] group-hover:underline group-hover:decoration-accent-ink group-hover:underline-offset-4">
                  {item.title}
                </span>
                <span className="mt-1 block max-w-[75ch] text-[15px] leading-relaxed text-ink-2">{item.summary}</span>
              </span>
              <ArrowRight size={16} className="hidden text-ink-3 transition-transform group-hover:translate-x-0.5 sm:block" aria-hidden />
            </a>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
