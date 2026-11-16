import { notFound } from "next/navigation";
import { CheckCircle, Circle, ArrowRight, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { postmortems, REPO, type TimelineTag } from "@/content/postmortems";
import { ArticleShell, Bullets, Part, Prose, StatRow } from "@/components/article/article-shell";
import { serif } from "@/components/article/serif";
import { KindChip } from "@/components/sections/postmortems";
import { pageMetadata } from "@/lib/page-metadata";
import { cn } from "@/lib/utils";

// Static export: only the slugs listed here exist; anything else is the 404 page.
export const dynamicParams = false;

export function generateStaticParams() {
  return postmortems.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(props: PageProps<"/postmortems/[slug]">) {
  const { slug } = await props.params;
  const pm = postmortems.find((p) => p.slug === slug);
  if (!pm) return {};
  return pageMetadata({ title: pm.title, description: pm.summary, path: `/postmortems/${pm.slug}`, markdown: `postmortems/${pm.slug}.md` });
}

const TAG: Record<TimelineTag, { label: string; dot: string }> = {
  change: { label: "Change", dot: "bg-ink-3" },
  detect: { label: "Detected", dot: "bg-critical" },
  investigate: { label: "Investigating", dot: "bg-p-ai" },
  fix: { label: "Fix", dot: "bg-accent-ink" },
  resolve: { label: "Resolved", dot: "bg-good" },
};

export default async function PostmortemPage(props: PageProps<"/postmortems/[slug]">) {
  const { slug } = await props.params;
  const pm = postmortems.find((p) => p.slug === slug);
  if (!pm) notFound();
  const done = pm.actions.filter((a) => a.done).length;
  const others = postmortems.filter((p) => p.slug !== pm.slug);

  return (
    <ArticleShell back={{ href: "/writing#postmortems", label: "All postmortems" }} className={serif.variable}>
      <h1 className="mt-10 max-w-[24ch] font-serif text-[clamp(2.25rem,4.8vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.012em]">{pm.title}</h1>
      <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-3">
        <KindChip kind={pm.kind} />
        <span>{pm.date}</span>
        <span>Blameless postmortem</span>
      </p>
      <p className="mt-8 max-w-[60ch] font-serif text-[1.3125rem] leading-[1.55] text-ink-2">{pm.summary}</p>
      <StatRow stats={pm.stats} />

      <Part title="Impact">
        <Prose reading paras={[pm.impact]} />
      </Part>

      <Part title="Timeline" aside="Singapore time (UTC+8), 1 Oct 2026 unless marked">
        {/* A time gutter: the clock down the left, what happened to the right, as an incident log reads. */}
        <ol className="space-y-5">
          {pm.timeline.map((t) => (
            <li key={t.at + t.what} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
              <p className="pt-0.5">
                <time className="block font-mono text-sm font-medium text-ink">{t.at}</time>
                <span className="mt-1 flex items-center gap-1.5 text-xs text-ink-3">
                  <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TAG[t.tag].dot)} />
                  {TAG[t.tag].label}
                </span>
              </p>
              <p className="max-w-[62ch] font-serif text-[1.0625rem] leading-[1.65] text-ink">{t.what}</p>
            </li>
          ))}
        </ol>
      </Part>

      <Part title="Root cause">
        <Prose reading paras={pm.rootCause} />
      </Part>

      <Part title="Contributing factors">
        <Bullets reading items={pm.contributing} />
      </Part>

      <Part title="How it was detected">
        <Prose reading paras={[pm.detection]} />
      </Part>

      <div className="grid gap-x-10 sm:grid-cols-2">
        <Part title="What went well">
          <Bullets reading items={pm.wentWell} />
        </Part>
        <Part title="Where I got lucky">
          <Prose reading paras={[pm.lucky]} />
        </Part>
      </div>

      <Part title="Action items" aside={`${done} of ${pm.actions.length} done`}>
        <ul className="divide-y divide-line border-y border-line">
          {pm.actions.map((a) => (
            <li key={a.what} className="flex gap-3 py-4">
              {a.done ? (
                <CheckCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-good" aria-label="Done" />
              ) : (
                <Circle size={20} className="mt-0.5 shrink-0 text-ink-3" aria-label="Open" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-relaxed sm:text-base">{a.what}</p>
                <p className="mt-1 font-mono text-xs text-ink-3">
                  {a.commit ? (
                    <a href={`${REPO}/commit/${a.commit}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:text-ink hover:underline">
                      commit {a.commit} <ArrowUpRight size={11} />
                    </a>
                  ) : a.done ? (
                    `shipped ${a.when}`
                  ) : (
                    "open"
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Part>

      <figure className="mt-14 border-l-2 border-ink pl-6">
        <figcaption className="text-sm font-medium text-ink-3">The lesson</figcaption>
        <blockquote className="mt-2 max-w-[40ch] font-serif text-[1.625rem] italic leading-[1.4] text-ink sm:text-[1.875rem]">{pm.lesson}</blockquote>
      </figure>

      <p className="mt-10 text-sm leading-relaxed text-ink-3">
        Blameless means the write-up is about systems and decisions, not people. Every decision here was mine. Sources: the
        repository&apos;s commits, the GitHub Actions run history, and Cloud Run&apos;s revisions and request logs.
      </p>

      <nav aria-label="More postmortems" className="mt-14">
        <h2 className="text-sm font-semibold text-ink-3">More postmortems</h2>
        <ul className="mt-4 grid gap-x-10 border-t border-line sm:grid-cols-2">
          {others.map((o) => (
            <li key={o.slug} className="border-b border-line">
              <a href={`/postmortems/${o.slug}`} className="group block h-full py-5">
                <KindChip kind={o.kind} />
                <p className="mt-3 font-semibold leading-snug tracking-[-0.01em]">{o.title}</p>
                <p className="mt-2 inline-flex items-center gap-1 text-sm text-ink-3 group-hover:text-ink">
                  Read it <ArrowRight size={13} />
                </p>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </ArticleShell>
  );
}

