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
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "19 Oct 2026", as the content files write dates, at midnight UTC: parsed by hand, since browsers differ. */
function contentDay(s: string): string {
  const [d, m, y] = s.split(" ");
  return new Date(Date.UTC(Number(y), MONTHS.indexOf(m), Number(d))).toISOString();
}

/** "13 Nov", in UTC, so the server's render and the browser's agree. */
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

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

// What only this site knows, fixed when it was built: its latest deploy, and what I have written.
// The pipeline's list of recent deploys, newest first, each with the subject of the commit it shipped.
const deploy = (delivery as { recent: { sha: string; title: string; ended: string }[] }).recent[0];
const local: Entry[] = [
  ...(deploy ? [{ key: deploy.sha, at: deploy.ended, verb: "Deployed", icon: RocketLaunch, title: deploy.title, where: "this site", href: "/status#replay", external: false }] : []),
  ...posts.map((p) => ({ key: p.slug, at: contentDay(p.date), verb: "Wrote", icon: PencilSimpleLine, title: p.title, href: `/writing/${p.slug}`, external: false })),
  ...postmortems.map((p) => ({ key: p.slug, at: contentDay(p.date), verb: "Postmortem", icon: Siren, title: p.title, href: `/postmortems/${p.slug}`, external: false })),
];

const newest = (github: ActivityItem[]) =>
  [...fromGitHub(github), ...local].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, SHOW);

/**
 * What I have done lately, newest first: pull requests merged or in review in public repositories,
 * releases, this site's latest deploy and new writing. The GitHub part is the build's snapshot until
 * the server's copy (refreshed from GitHub at most hourly) arrives, so the list renders without
 * JavaScript and stays current between deploys.
 */
export function Recently() {
  const [github, setGitHub] = useState<ActivityItem[]>(snapshot.items as ActivityItem[]);
  useEffect(() => {
    let alive = true;
    api
      .activity()
      .then((f) => alive && f.items.length > 0 && setGitHub(f.items))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const entries = newest(github);
  if (entries.length === 0) return null;
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
    </div>
  );
}
