"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, GitMerge, GitPullRequest, Package, PencilSimpleLine, RocketLaunch, Siren, type Icon } from "@phosphor-icons/react";
import snapshot from "@/content/generated/activity.json";
import delivery from "@/content/generated/delivery.json";
import { posts } from "@/content/writing";
import { postmortems } from "@/content/postmortems";
import { api, type ActivityItem } from "@/lib/api";

type Entry = { key: string; at: string; verb: string; icon: Icon; title: string; where?: string; href: string; external: boolean };

/** How many entries the home page shows. */
const SHOW = 5;
/** GitHub is read hourly (every ten minutes after a failure): older than this, the list says how old. */
const STALE_MS = 3 * 36e5;
const REPO = "https://github.com/zhenxi0901/portfolio";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "19 Oct 2026", as the content files write dates, at midnight UTC: parsed by hand, since browsers differ. */
function contentDay(s: string): string {
  const [d, m, y] = s.split(" ");
  return new Date(Date.UTC(Number(y), MONTHS.indexOf(m), Number(d))).toISOString();
}

// Singapore days, like the changelog and the deploys-per-day chart. A fixed zone, so the server's render
// and the browser's agree; content dates (midnight UTC) fall on the same day either way.
const TZ = "Asia/Singapore";
/** "13 Nov". */
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ });
/** "13 Nov, 10:50". */
const dayTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });

/** Whether two commit ids name the same commit, one perhaps abbreviated (as the live map compares them). */
const sameCommit = (a: string, b: string) => !!a && !!b && (a.startsWith(b) || b.startsWith(a));

/** A pull request's title without a "feat(scope):"-style prefix, starting with a capital. */
function tidy(title: string): string {
  const t = title.replace(/^(feat|fix|docs|chore|refactor|perf|test|build|ci|style)(\([^)]*\))?!?:\s*/i, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function fromGitHub(items: ActivityItem[]): Entry[] {
  return items.map((it) => ({
    key: it.url,
    at: it.at,
    verb: it.kind === "merged" ? "Merged" : it.kind === "review" ? "In review" : "Released",
    icon: it.kind === "merged" ? GitMerge : it.kind === "review" ? GitPullRequest : Package,
    title: it.kind === "release" ? it.title : tidy(it.title),
    where: it.kind === "release" ? undefined : `${it.repo}#${it.number}`,
    href: it.url,
    external: true,
  }));
}

// What only this site knows, fixed when it was built: its deploys, and what I have written.
type Built = {
  generated: string;
  // The commit this build was made from. It ships after the snapshot is written, so it is in no list.
  head?: { sha: string; title: string } | null;
  // The pipeline's recent deploys, newest first, each with the subject of the commit it shipped.
  recent: { sha: string; title: string; ended: string }[];
};
const built = delivery as Built;
const writing: Entry[] = [
  ...posts.map((p) => ({ key: p.slug, at: contentDay(p.date), verb: "Wrote", icon: PencilSimpleLine, title: p.title, href: `/writing/${p.slug}`, external: false })),
  ...postmortems.map((p) => ({ key: p.slug, at: contentDay(p.date), verb: "Postmortem", icon: Siren, title: p.title, href: `/postmortems/${p.slug}`, external: false })),
];

/**
 * The latest deploy. Once the server says it runs this build's own commit, that is the one (dated by
 * the build, minutes before it shipped, and linked to the commit: the changelog and the replay were
 * written before it shipped); until then, the newest deploy the pipeline knew of.
 */
function latestDeploy(live: boolean): Entry | null {
  if (live && built.head)
    return { key: built.head.sha, at: built.generated, verb: "Deployed", icon: RocketLaunch, title: built.head.title, where: "this site", href: `${REPO}/commit/${built.head.sha}`, external: true };
  const d = built.recent[0];
  return d ? { key: d.sha, at: d.ended, verb: "Deployed", icon: RocketLaunch, title: d.title, where: "this site", href: "/status#replay", external: false } : null;
}

const newest = (github: ActivityItem[], live: boolean) => {
  const deploy = latestDeploy(live);
  return [...fromGitHub(github), ...(deploy ? [deploy] : []), ...writing].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, SHOW);
};

/**
 * What I have done lately, newest first: pull requests merged or in review in public repositories,
 * releases, this site's latest deploy and new writing. The GitHub part is the build's snapshot until
 * the server's copy (refreshed from GitHub at most hourly) arrives, so the list renders without
 * JavaScript and stays current between deploys; when GitHub has not answered for hours, it says so.
 */
export function Recently() {
  const [feed, setFeed] = useState<{ items: ActivityItem[]; updated: string }>({ items: snapshot.items as ActivityItem[], updated: snapshot.updated });
  // When the server's copy was asked for (ms): the age note is worked out in the browser only.
  const [asked, setAsked] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  useEffect(() => {
    let alive = true;
    api
      .activity()
      .then((f) => {
        if (!alive) return;
        if (f.items.length > 0) setFeed({ items: f.items, updated: f.updated });
        setAsked(Date.now());
      })
      .catch(() => alive && setAsked(Date.now()));
    const head = built.head?.sha;
    if (head)
      api
        .status()
        .then((s) => alive && setLive(sameCommit(s.commit, head)))
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const entries = newest(feed.items, live);
  if (entries.length === 0) return null;
  const stale = asked !== null && asked - Date.parse(feed.updated) > STALE_MS;
  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 id="recently-title" className="font-mono text-xs text-ink-3">
        Recently
      </h3>
      <ol aria-labelledby="recently-title" className="mt-3 space-y-2.5">
        {entries.map((e) => (
          <li key={e.key}>
            <a
              href={e.href}
              {...(e.external ? { target: "_blank", rel: "noreferrer" } : {})}
              className="group grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-3 text-sm leading-relaxed sm:grid-cols-[3.75rem_7rem_minmax(0,1fr)]"
            >
              <time dateTime={e.at} className="pt-px font-mono text-xs leading-relaxed text-ink-3">
                {day(e.at)}
              </time>
              <span className="hidden items-center gap-1.5 self-start text-ink-2 sm:flex">
                <e.icon size={14} aria-hidden className="shrink-0" />
                {e.verb}
              </span>
              <span className="min-w-0">
                <span className="text-ink-2 sm:hidden">{e.verb}: </span>
                <span className="font-medium text-ink decoration-accent-ink decoration-2 underline-offset-4 group-hover:underline">{e.title}</span>
                {/* The repository and the arrow wrap as one, so neither is left alone on a line. */}
                {(e.where || e.external) && (
                  <span className="whitespace-nowrap text-ink-3">
                    {e.where && <> · {e.where}</>}
                    {e.external && (
                      <>
                        <ArrowUpRight size={12} aria-hidden className="ml-1 inline-block" />
                        <span className="sr-only"> (opens in a new tab)</span>
                      </>
                    )}
                  </span>
                )}
              </span>
            </a>
          </li>
        ))}
      </ol>
      {stale && <p className="mt-3 font-mono text-[11px] text-ink-3">GitHub entries as of {dayTime(feed.updated)} Singapore time</p>}
    </div>
  );
}
