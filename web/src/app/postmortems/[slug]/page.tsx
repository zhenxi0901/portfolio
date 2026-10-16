import { notFound } from "next/navigation";
import { ArrowUpRight, CheckCircle, Circle } from "@phosphor-icons/react/dist/ssr";
import { postmortems, REPO, type TimelineTag } from "@/content/postmortems";
import { ArticleShell, Bullets, Part, Prose, StatRow } from "@/components/article/article-shell";
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
  return pageMetadata({ title: `Postmortem: ${pm.title}`, description: pm.summary, path: `/postmortems/${pm.slug}` });
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
    <ArticleShell back={{ href: "/#postmortems", label: "All postmortems" }}>
      <p className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-xs text-ink-3">
        <KindChip kind={pm.kind} />
        <span>{pm.date}</span>
        <span aria-hidden>·</span>
        <span>Blameless postmortem</span>
      </p>
      <h1 className="mt-4 text-[clamp(2.25rem,5.5vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.045em]">{pm.title}</h1>
      <p className="mt-6 max-w-[60ch] text-lg leading-relaxed text-ink-2">{pm.summary}</p>
      <StatRow stats={pm.stats} />

      <Part title="Impact">
        <Prose paras={[pm.impact]} />
      </Part>

      <Part title="Timeline" aside="Singapore time (UTC+8), 1 Oct 2026 unless marked">
        <ol className="relative space-y-6 border-l border-line pl-6">
          {pm.timeline.map((t) => (
            <li key={t.at + t.what} className="relative">
              <span aria-hidden className={cn("absolute -left-[29px] top-1.5 size-2.5 rounded-full ring-4 ring-bg", TAG[t.tag].dot)} />
              <p className="flex flex-wrap items-baseline gap-x-3 font-mono text-xs">
                <time className="font-semibold text-ink">{t.at}</time>
                <span className="text-ink-3">{TAG[t.tag].label}</span>
              </p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2 sm:text-base">{t.what}</p>
            </li>
          ))}
        </ol>
      </Part>

      <Part title="Root cause">
        <Prose paras={pm.rootCause} />
      </Part>

      <Part title="Contributing factors">
        <Bullets items={pm.contributing} />
      </Part>

      <Part title="How it was detected">
        <Prose paras={[pm.detection]} />
      </Part>

      <div className="grid gap-x-10 sm:grid-cols-2">
        <Part title="What went well">
          <Bullets items={pm.wentWell} />
        </Part>
        <Part title="Where I got lucky">
          <Prose paras={[pm.lucky]} />
        </Part>
      </div>

      <Part title="Action items" aside={`${done} of ${pm.actions.length} done`}>
        <ul className="divide-y divide-line rounded-3xl border border-line bg-surface">
          {pm.actions.map((a) => (
            <li key={a.what} className="flex gap-3 p-4 sm:p-5">
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

      <figure className="mt-14 rounded-3xl bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface))] p-6 sm:p-8">
        <figcaption className="font-mono text-xs uppercase tracking-[0.18em] text-ink-3">The lesson</figcaption>
        <blockquote className="mt-3 text-2xl font-semibold leading-snug tracking-[-0.02em] sm:text-3xl">{pm.lesson}</blockquote>
      </figure>

      <p className="mt-10 text-sm leading-relaxed text-ink-3">
        Blameless means the write-up is about systems and decisions, not people. Every decision here was mine. Sources: the
        repository&apos;s commits, the GitHub Actions run history, and Cloud Run&apos;s revisions and request logs.
      </p>

      <nav aria-label="More postmortems" className="mt-14">
        <h2 className="text-sm font-semibold text-ink-3">More postmortems</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {others.map((o) => (
            <li key={o.slug}>
              <a href={`/postmortems/${o.slug}`} className="group block h-full rounded-3xl border border-line bg-surface p-5 transition-colors hover:border-ink-3">
                <KindChip kind={o.kind} />
                <p className="mt-3 font-semibold leading-snug tracking-[-0.01em]">{o.title}</p>
                <p className="mt-2 inline-flex items-center gap-1 text-sm text-ink-3 group-hover:text-ink">
                  Read it <ArrowUpRight size={13} />
                </p>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </ArticleShell>
  );
}

