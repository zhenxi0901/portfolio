import generated from "@/content/generated/delivery.json";
import { cn } from "@/lib/utils";

// Written by scripts/delivery-stats.mjs in CI on main, from this repository's commits and deploy
// runs, just before the image is built. The committed copy is only a snapshot for local builds.
//
// Typed explicitly: TypeScript infers a JSON import's types from whatever the file holds, so a month
// with no deploys ("recent": []) would type as never[] and fail the build, which would then block the
// very deploy that could fix it.
type Delivery = {
  generated: string;
  windowDays: number;
  deploys: number;
  daysWithDeploys: number;
  leadTimeMinutes: { median: number | null; commits: number };
  changeFailureRate: number | null;
  failedDeploys: number;
  restoreMinutes: { median: number | null; count: number };
  deployMinutes: { median: number | null };
  perDay: { date: string; deploys: number }[];
  recent: { sha: string; title: string; ended: string; minutes: number; leadMinutes: number | null; url: string }[];
};
const delivery = generated as Delivery;

function duration(min: number | null) {
  if (min === null) return "n/a";
  if (min < 60) return `${min.toFixed(1)} min`;
  if (min < 1440) return `${(min / 60).toFixed(1)} h`;
  return `${(min / 1440).toFixed(1)} days`;
}

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const asOf = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/** DORA's four keys for this site itself, plus the deploy timeline behind them. */
export function DeliveryPanel() {
  const d = delivery;
  const peak = Math.max(1, ...d.perDay.map((x) => x.deploys));
  const tiles = [
    { value: String(d.deploys), label: `deploys to production, on ${d.daysWithDeploys} of ${d.windowDays} days` },
    { value: duration(d.leadTimeMinutes.median), label: `median lead time, commit to live (${d.leadTimeMinutes.commits} commits)` },
    d.changeFailureRate === null
      ? { value: "n/a", label: "change failure rate: nothing deployed in the window" }
      : {
          value: `${(d.changeFailureRate * 100).toFixed(0)}%`,
          label: `change failure rate: ${d.failedDeploys} of ${d.deploys + d.failedDeploys} deploys failed their live checks`,
        },
    {
      value: d.restoreMinutes.count ? duration(d.restoreMinutes.median) : "n/a",
      // A failed deploy with no later success yet (or not yet counted) is not "nothing to recover from".
      label: d.restoreMinutes.count
        ? "median time to restore after a failed deploy"
        : d.failedDeploys
          ? "time to restore: the recovering deploy is counted on the next build"
          : "time to restore: no failed deploy to recover from",
    },
  ];

  return (
    <div className="mt-4 rounded-3xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="font-semibold">How this site ships, measured</p>
        <p className="font-mono text-xs text-ink-2">
          DORA metrics, last {d.windowDays} days, as of {asOf(d.generated)} UTC
        </p>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col-reverse justify-end">
            <dt className="mt-1 text-sm leading-snug text-ink-2">{t.label}</dt>
            <dd className="text-3xl font-semibold tracking-[-0.03em]">{t.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6">
        <div
          className="flex h-14 items-end gap-[3px]"
          role="img"
          aria-label={`Deploys per day for the last ${d.windowDays} days: ${d.deploys} in total, at most ${peak} in a day.`}
        >
          {d.perDay.map((day) => (
            <span
              key={day.date}
              title={`${dayLabel(day.date)}: ${day.deploys} deploy${day.deploys === 1 ? "" : "s"}`}
              className={cn("flex-1 rounded-[3px]", day.deploys ? "bg-accent-ink" : "bg-surface-2")}
              style={{ height: day.deploys ? `${Math.max(14, (day.deploys / peak) * 100)}%` : "4px" }}
            />
          ))}
        </div>
        <p className="mt-2 flex justify-between font-mono text-[11px] text-ink-3">
          <span>{d.windowDays} days ago</span>
          <span>deploys per day, Singapore time</span>
          <span>today</span>
        </p>
      </div>

      <ol className="mt-6 divide-y divide-line rounded-2xl border border-line" aria-label="Most recent deploys">
        {d.recent.map((r) => (
          <li key={r.sha} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm">
            <a href={r.url} target="_blank" rel="noreferrer" className="font-mono text-xs text-ink-2 underline-offset-4 hover:text-ink hover:underline">
              {r.sha}
            </a>
            <span className="min-w-0 flex-1 truncate">{r.title}</span>
            <span className="font-mono text-xs text-ink-3">
              {r.leadMinutes !== null && `lead ${duration(r.leadMinutes)} · `}deploy {duration(r.minutes)}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-xs leading-relaxed text-ink-3">
        Computed by the pipeline from this repository&apos;s commits and deploy runs as of the time above, before it built the
        image you are looking at. A deploy counts as failed only if it reached Cloud Run and then failed its live checks. Problems that did not come from
        a deploy are in the postmortems below.
      </p>
    </div>
  );
}
