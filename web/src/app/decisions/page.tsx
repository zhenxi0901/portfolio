import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { ArticleShell, Bullets, Prose } from "@/components/article/article-shell";
import { decisions, REPO_BLOB } from "@/content/decisions";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Decisions: why this site is built the way it is",
  description:
    "Architecture decision records for a portfolio run as a production service: Cloud Run over GKE, one Go binary, build once and check before traffic, an SLO measured from outside, and what each one costs.",
  path: "/decisions",
});

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function DecisionsPage() {
  return (
    <ArticleShell back={{ href: "/#status", label: "How this site runs" }}>
      <p className="mt-8 font-mono text-xs text-ink-3">Architecture decision records · {decisions.length} so far</p>
      <h1 className="mt-4 text-[clamp(2.25rem,5.5vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
        Why this site is built the way it is.
      </h1>
      <p className="mt-6 max-w-[62ch] text-lg leading-relaxed text-ink-2">
        Each record says what I chose, what it buys and what it costs, with the files that carry it out. The same records are in the
        repository under{" "}
        <a href={`${REPO_BLOB}docs/adr/README.md`} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink">
          docs/adr
        </a>
        .
      </p>

      <nav aria-label="Decisions" className="mt-10">
        <ol className="divide-y divide-line rounded-3xl border border-line bg-surface">
          {decisions.map((d) => (
            <li key={d.slug}>
              <a href={`#${d.slug}`} className="group flex items-baseline gap-4 p-4 sm:px-5">
                <span className="w-6 shrink-0 font-mono text-xs text-ink-3">{d.id}</span>
                <span className="flex-1 text-[15px] text-ink-2 group-hover:text-ink sm:text-base">{d.title}</span>
                <span className="hidden shrink-0 font-mono text-xs text-ink-3 sm:block">{day(d.date)}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {decisions.map((d) => (
        <section key={d.slug} id={d.slug} aria-labelledby={`${d.slug}-title`} className="mt-16 scroll-mt-28">
          <p className="font-mono text-xs text-ink-3">
            ADR {d.id} · {day(d.date)} · {d.status}
          </p>
          <h2 id={`${d.slug}-title`} className="mt-2 text-2xl font-semibold leading-snug tracking-[-0.025em] sm:text-[1.75rem]">
            {d.title}
          </h2>

          <h3 className="mt-6 text-sm font-semibold text-ink-3">Context</h3>
          <div className="mt-2">
            <Prose paras={d.context} />
          </div>

          <h3 className="mt-6 text-sm font-semibold text-ink-3">Decision</h3>
          <div className="mt-2 rounded-2xl border-l-4 border-accent-ink bg-[color-mix(in_oklab,var(--accent)_10%,var(--surface))] px-5 py-4">
            <Prose paras={d.decision} />
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-ink-3">What it buys</h3>
              <div className="mt-3">
                <Bullets items={d.good} />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink-3">What it costs</h3>
              <div className="mt-3">
                <Bullets items={d.bad} />
              </div>
            </div>
          </div>

          <ul className="mt-6 flex flex-wrap gap-2">
            {d.evidence.map((e) => (
              <li key={e.path}>
                <a
                  href={`${REPO_BLOB}${e.path}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
                >
                  {e.label}
                  <ArrowUpRight size={12} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </ArticleShell>
  );
}
