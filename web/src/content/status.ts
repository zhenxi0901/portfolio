// The incident history behind /status and its Atom feed: every postmortem, plus any release that
// failed its live checks after taking traffic (from the changelog the pipeline writes).
import { postmortems } from "@/content/postmortems";
import generated from "@/content/generated/changelog.json";

export type Incident = {
  id: string;
  /** As shown, e.g. "1 Oct 2026". */
  date: string;
  /** ISO timestamp, for sorting and the feed. */
  iso: string;
  kind: string;
  title: string;
  summary: string;
  /** Site path of the write-up. */
  href: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1 Oct 2026" as midnight Singapore time, the timezone every postmortem uses. */
function isoOf(date: string) {
  const [d, m, y] = date.split(" ");
  const month = MONTHS.indexOf(m);
  if (month < 0) throw new Error(`postmortem date "${date}" is not like "1 Oct 2026"`);
  return new Date(Date.UTC(Number(y), month, Number(d)) - 8 * 36e5).toISOString();
}

type Failed = { kind: string; at: string; sha: string; title?: string; restoreSeconds?: number | null };
const failedReleases = (generated as { entries: Failed[] }).entries.filter((e) => e.kind === "failed");

export const incidents: Incident[] = [
  ...postmortems.map((p) => ({
    id: `postmortem-${p.slug}`,
    date: p.date,
    iso: isoOf(p.date),
    kind: p.kind,
    title: p.title,
    summary: p.summary,
    href: `/postmortems/${p.slug}`,
  })),
  ...failedReleases.map((e) => ({
    id: `release-${e.sha}-${e.at}`,
    date: new Date(e.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" }),
    iso: e.at,
    kind: "Failed release",
    title: `Release ${e.sha} failed its live checks`,
    summary:
      e.restoreSeconds != null
        ? `It took traffic, failed the live smoke test, and the pipeline put traffic back on the previous revision ${e.restoreSeconds} s later. ${e.title ?? ""}`.trim()
        : `It took traffic and failed the live smoke test. ${e.title ?? ""}`.trim(),
    href: "/changelog",
  })),
].sort((a, b) => b.iso.localeCompare(a.iso));
