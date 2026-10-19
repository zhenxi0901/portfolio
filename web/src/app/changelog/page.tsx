import { ArrowCounterClockwise, Pause, ShieldCheck, Warning } from "@phosphor-icons/react/dist/ssr";
import generated from "@/content/generated/changelog.json";
import { ArticleShell } from "@/components/article/article-shell";
import { pageMetadata } from "@/lib/page-metadata";
import { cn } from "@/lib/utils";

// Written by scripts/delivery-stats.mjs in CI from this repository's commits, deploy runs and
// releases. Typed explicitly: a JSON import's inferred types would break on an empty list.
type Commit = { sha: string; title: string };
type Base = { at: string; sha: string; url: string };
type Entry =
  | (Base & { kind: "deploy"; release: string | null; minutes: number; commits: Commit[] })
  | (Base & { kind: "failed" | "drill" | "stopped" | "held"; title: string; restoreSeconds: number | null });
const changelog = generated as { generated: string; entries: Entry[] };

const REPO = "https://github.com/zhenxi0901/portfolio";
const TZ = "Asia/Singapore";

export const metadata = pageMetadata({
  title: "Changelog: every release of this site",
  description:
    "Every production release of this portfolio, with the commits it shipped, written by its own pipeline. Rollback drills and held releases included.",
  path: "/changelog",
});

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

type NoticeEntry = Extract<Entry, { kind: "failed" | "drill" | "stopped" | "held" }>;

const NOTICE = {
  failed: {
    icon: Warning,
    tone: "text-critical",
    text: (e: NoticeEntry) =>
      e.restoreSeconds != null ? `Failed its live checks; rolled back in ${e.restoreSeconds} s` : "Failed its live checks after taking traffic",
  },
  drill: {
    icon: ArrowCounterClockwise,
    tone: "text-accent-ink",
    text: (e: NoticeEntry) => `Rollback drill: traffic back on the old revision ${e.restoreSeconds} s after the switch`,
  },
  stopped: { icon: ShieldCheck, tone: "text-p-ai", text: () => "Stopped before taking traffic: the new revision failed its checks" },
  held: { icon: Pause, tone: "text-p-ai", text: () => "Held by the error-budget gate" },
};

export default function ChangelogPage() {
  const entries = changelog.entries;
  const releases = entries.filter((e) => e.kind === "deploy");
  const shipped = releases.reduce((n, e) => n + (e.kind === "deploy" ? e.commits.length : 0), 0);
  const days = [...new Set(entries.map((e) => dayKey(e.at)))];

  return (
    <ArticleShell back={{ href: "/#status", label: "How this site runs" }}>
      <p className="mt-8 font-mono text-xs text-ink-3">Written by the pipeline · Singapore time</p>
      <h1 className="mt-4 text-[clamp(2.25rem,5.5vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.045em]">Changelog</h1>
      <p className="mt-6 max-w-[62ch] text-lg leading-relaxed text-ink-2">
        Every release of this site to production, with the commits it shipped: {releases.length} releases and {shipped} commits so far.
        Since 19 October each one is also a{" "}
        <a href={`${REPO}/releases`} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink">
          GitHub release
        </a>{" "}
        with its SBOM and build provenance, and a{" "}
        <a href={`${REPO}/releases.atom`} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink">
          feed
        </a>{" "}
        you can follow.
      </p>

      <div className="mt-12 space-y-12">
        {days.map((key) => {
          const today = entries.filter((e) => dayKey(e.at) === key);
          return (
            <section key={key} aria-labelledby={`day-${key}`}>
              <h2 id={`day-${key}`} className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
                <span className="text-xl font-semibold tracking-[-0.02em]">{dayLabel(today[0].at)}</span>
                <span className="font-mono text-xs font-normal text-ink-3">
                  {today.filter((e) => e.kind === "deploy").length} release{today.filter((e) => e.kind === "deploy").length === 1 ? "" : "s"}
                </span>
              </h2>
              <ol className="mt-2">
                {today.map((e) => (
                  <li key={`${e.url}-${e.kind}`} className="grid grid-cols-[3.5rem_1fr] gap-x-3 border-b border-line/60 py-4 last:border-0">
                    <a href={e.url} target="_blank" rel="noreferrer" className="pt-0.5 font-mono text-xs text-ink-3 hover:text-ink">
                      {time(e.at)}
                    </a>
                    {e.kind === "deploy" ? (
                      <div>
                        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-ink-2">
                          {e.release ? (
                            <a
                              href={`${REPO}/releases/tag/${e.release}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-xs font-medium text-accent-ink underline-offset-4 hover:underline"
                            >
                              {e.release}
                            </a>
                          ) : (
                            <span className="font-mono text-xs text-ink-3">release</span>
                          )}
                          <span className="font-mono text-xs text-ink-3">
                            {e.commits.length ? `${e.commits.length} commit${e.commits.length === 1 ? "" : "s"}` : "redeploy"} · deploy {e.minutes} min
                          </span>
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {e.commits.map((c) => (
                            <li key={c.sha} className="flex gap-3 text-[15px] leading-snug">
                              <a
                                href={`${REPO}/commit/${c.sha}`}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 pt-0.5 font-mono text-xs text-ink-3 hover:text-ink"
                              >
                                {c.sha}
                              </a>
                              {/* Titles can hold long unbroken tokens (a branch name in a merge commit). */}
                              <span className="min-w-0 [overflow-wrap:anywhere]">{c.title}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <Notice e={e} />
                    )}
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
      <p className="mt-12 text-xs leading-relaxed text-ink-3">
        As of {new Date(changelog.generated).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ })}{" "}
        Singapore time, when the pipeline built the image you are looking at; the release of this very image is the next entry.
      </p>
    </ArticleShell>
  );
}

function Notice({ e }: { e: NoticeEntry }) {
  const n = NOTICE[e.kind];
  const Icon = n.icon;
  return (
    <div>
      <p className={cn("flex items-center gap-2 text-sm font-medium", n.tone)}>
        <Icon size={16} aria-hidden />
        {n.text(e)}
      </p>
      <p className="mt-1 text-[15px] leading-snug text-ink-2 [overflow-wrap:anywhere]">
        <span className="font-mono text-xs text-ink-3">{e.sha}</span> {e.title}
      </p>
    </div>
  );
}
