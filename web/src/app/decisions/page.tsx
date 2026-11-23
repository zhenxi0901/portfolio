import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { ArticleShell, Bullets, Prose } from "@/components/article/article-shell";
import { serif } from "@/components/article/serif";
import { decisions, REPO_BLOB } from "@/content/decisions";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Why this site is built the way it is",
  description:
    "Architecture decision records for a portfolio run as a production service: Cloud Run over GKE, one Go binary, an SLO measured from outside, and what each costs.",
  path: "/decisions",
  markdown: "decisions.md",
});

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * The decision records as a long read: each in the serif at reading measure, with the index beside them
 * on a desktop (it stays in view while you read) and above them on a phone.
 */
export default function DecisionsPage() {
  return (
    <ArticleShell back={{ href: "/status", label: "Status" }} wide className={serif.variable}>
      <h1 className="mt-10 max-w-[24ch] font-serif text-[clamp(2.25rem,4.8vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.012em]">
        Why this site is built the way it is
      </h1>
      <p className="mt-6 max-w-[62ch] text-lg leading-relaxed text-ink-2">
        {decisions.length} architecture decision records. Each says what I chose, what it buys and what it costs, with the files that carry it
        out. The same records are in the repository under{" "}
        <a href={`${REPO_BLOB}docs/adr/README.md`} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink">
          docs/adr
        </a>
        .
      </p>

      <div className="mt-12 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
        {/* Taller than a short laptop screen, the index scrolls on its own rather than losing its last records
            off the bottom; the padding keeps the focus ring inside what it clips. */}
        <nav
          aria-label="Decisions"
          className="lg:sticky lg:top-24 lg:-mx-2 lg:max-h-[calc(100dvh-7.5rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:px-2 lg:py-1"
        >
          <ol className="border-t border-line">
            {decisions.map((d) => (
              <li key={d.slug} className="border-b border-line">
                <a href={`#${d.slug}`} className="group flex items-baseline gap-3 py-2.5 text-sm leading-snug text-ink-2 transition-colors hover:text-ink">
                  <span className="w-5 shrink-0 font-mono text-xs text-ink-3">{d.id}</span>
                  <span>{d.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div>
          {decisions.map((d, i) => (
            <section key={d.slug} id={d.slug} aria-labelledby={`${d.slug}-title`} className={i === 0 ? "mt-14 scroll-mt-6 lg:mt-0" : "mt-20 scroll-mt-6"}>
              <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-3">
                <span>ADR {d.id}</span>
                <span>{day(d.date)}</span>
                <span>{d.status}</span>
              </p>
              <h2 id={`${d.slug}-title`} className="mt-2 max-w-[34ch] text-[1.5rem] font-semibold leading-snug tracking-[-0.015em] sm:text-[1.75rem]">
                {d.title}
              </h2>

              <h3 className="mt-7 text-sm font-semibold text-ink-3">Context</h3>
              <div className="mt-2">
                <Prose reading paras={d.context} />
              </div>

              <h3 className="mt-7 text-sm font-semibold text-ink-3">Decision</h3>
              <div className="mt-2 border-l-2 border-ink pl-5">
                <Prose reading paras={d.decision} />
              </div>

              <div className="mt-7 grid gap-7 xl:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-ink-3">What it buys</h3>
                  <div className="mt-3">
                    <Bullets reading items={d.good} />
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink-3">What it costs</h3>
                  <div className="mt-3">
                    <Bullets reading items={d.bad} />
                  </div>
                </div>
              </div>

              {/* Paths in the repository: machine names, so mono. */}
              <ul className="mt-7 flex flex-wrap gap-2">
                {d.evidence.map((e) => (
                  <li key={e.path}>
                    <a
                      href={`${REPO_BLOB}${e.path}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 font-mono text-xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
                    >
                      {e.label}
                      <ArrowUpRight size={12} aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </ArticleShell>
  );
}
