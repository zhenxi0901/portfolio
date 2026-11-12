import { ArrowUpRight, Rss } from "@phosphor-icons/react/dist/ssr";
import { ArticleShell, Part } from "@/components/article/article-shell";
import { LiveInstance } from "@/components/status/live-instance";
import { LiveState } from "@/components/status/live-state";
import { SloPanel } from "@/components/sections/slo-panel";
import { DeliveryPanel } from "@/components/sections/delivery-panel";
import { VisitTrace } from "@/components/sections/visit-trace";
import { incidents } from "@/content/status";
import { decisions } from "@/content/decisions";
import { pageMetadata } from "@/lib/page-metadata";
import { SITE_URL } from "@/lib/site";

const base = pageMetadata({
  title: "Status: is this site up?",
  description:
    "Live state, 30 days of availability against a 99.9% SLO, how the site is watched, and its incident history, with a feed to subscribe to.",
  path: "/status",
});
// Feed readers find the incident feed from the page itself.
export const metadata = { ...base, alternates: { ...base.alternates, types: { "application/atom+xml": "/status/feed.xml" } } };

const REPO = "https://github.com/zhenxi0901/portfolio";

const watches = [
  { what: "Availability", how: "Google Cloud uptime checks on /api/health every minute from Singapore, Belgium and Oregon. They are the SLO above.", href: null },
  { what: "Every release", how: "Smoke-tested at its own URL before it takes traffic, again after, and rolled back on its own if that fails.", href: `${REPO}/actions/workflows/deploy.yml` },
  { what: "Contact messages", how: "Cloud Run's logs are searched hourly for any message that could not be delivered, each search picking up where the last one stopped (GitHub sometimes starts scheduled runs late).", href: `${REPO}/actions/workflows/synthetic.yml` },
  { what: "Contact form, end to end", how: "Twice a day a marked message goes through the live form and the real webhook.", href: `${REPO}/actions/workflows/synthetic.yml` },
  { what: "Supply chain", how: "OpenSSF Scorecard and CodeQL on every push to main; Dependabot each month.", href: `${REPO}/security` },
];

const more = [
  { href: "/cost", title: "What it costs", text: "This month's usage at list prices, where the money goes, and what caps the bill." },
  { href: "/changelog", title: "Changelog", text: "Every release to production and the commits it shipped, written by the pipeline." },
  { href: "/decisions", title: "Decisions", text: `Why it is built this way: ${decisions.length} architecture decision records and what each one costs.` },
  { href: "/evidence", title: "Evidence", text: "Where each number on the site comes from, and which ones you can check yourself." },
  { href: "/agents", title: "For agents", text: "The site as an MCP server: point your own AI agent at it, or curl it." },
];

export default function StatusPage() {
  return (
    <ArticleShell back={{ href: "/", label: "Home" }} wide>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs text-ink-3">{new URL(SITE_URL).host} · Cloud Run, asia-southeast1</p>
        <a href="/status/feed.xml" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
          <Rss size={14} aria-hidden /> Subscribe to incidents
        </a>
      </div>
      <h1 id="status" className="mt-4 scroll-mt-28 text-[clamp(2.25rem,5.5vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
        Status
      </h1>
      <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-ink-2">
        The Go server that sent you this page reports on itself: its live state, the latency of its last requests and its SLO,
        how it ships, the trace of your own visit, how it is watched, and every incident so far.
      </p>
      <LiveState />
      <LiveInstance commit={false} />
      <SloPanel />
      <DeliveryPanel />
      <VisitTrace />

      <Part title="How it is watched">
        <ul className="divide-y divide-line rounded-3xl border border-line bg-surface">
          {watches.map((w) => (
            <li key={w.what} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-baseline sm:gap-6 sm:p-5">
              <span className="w-48 shrink-0 font-medium">{w.what}</span>
              <span className="flex-1 text-[15px] leading-relaxed text-ink-2">
                {w.how}{" "}
                {w.href && (
                  <a href={w.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-ink-3 underline underline-offset-4 hover:text-ink">
                    runs
                    <ArrowUpRight size={12} aria-hidden />
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Part>

      <Part title="Incident history" aside={`${incidents.length} so far, all resolved`}>
        <ol className="space-y-3">
          {incidents.map((i) => (
            <li key={i.id}>
              <a href={i.href} className="group block rounded-3xl border border-line bg-surface p-5 transition-colors hover:border-ink-3">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-ink-3">
                  <span>{i.date}</span>
                  <span className="rounded-full border border-line px-2 py-0.5">{i.kind}</span>
                  <span className="inline-flex items-center gap-1.5 text-ink-2">
                    <span className="size-1.5 rounded-full bg-good" aria-hidden />
                    Resolved
                  </span>
                </span>
                <span className="mt-2 block font-semibold leading-snug group-hover:underline group-hover:underline-offset-4">{i.title}</span>
                <span className="mt-1 block text-[15px] leading-relaxed text-ink-2">{i.summary}</span>
              </a>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-ink-3">
          Each links to its blameless write-up. Releases, rollbacks and drills are in the{" "}
          <a href="/changelog" className="underline underline-offset-4 hover:text-ink">
            changelog
          </a>
          .
        </p>
      </Part>

      <Part title="More on how it runs">
        <ul className="grid gap-3 sm:grid-cols-2">
          {more.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="group block h-full rounded-3xl border border-line bg-surface p-5 transition-colors hover:border-ink-3">
                <span className="font-semibold group-hover:underline group-hover:underline-offset-4">{l.title}</span>
                <span className="mt-1 block text-[15px] leading-relaxed text-ink-2">{l.text}</span>
              </a>
            </li>
          ))}
        </ul>
      </Part>
    </ArticleShell>
  );
}
