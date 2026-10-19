// DORA metrics for this site, from the repository's own history: commits on main and the deploy
// workflow's runs. Runs in CI on pushes to main, just before the image is built and tested (and by
// hand to refresh the committed snapshot), writing src/content/generated/delivery.json.
//
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name node scripts/delivery-stats.mjs
//
// Definitions (DORA's four keys, as applied here):
//   deploys              successful runs of deploy.yml in the window
//   lead time            commit time to the end of the first successful deploy that contains it
//   change failure rate  deploy runs (and earlier attempts of re-run ones) that failed after
//                        reaching Cloud Run, out of all that reached it; null when none did
//   time to restore      for each failed deploy, time until the next successful one
import { mkdir, writeFile } from "node:fs/promises";

const REPO = process.env.GITHUB_REPOSITORY ?? "zhenxi0901/portfolio";
const TOKEN = process.env.GITHUB_TOKEN;
const WINDOW_DAYS = 30;
const OUT = new URL("../src/content/generated/delivery.json", import.meta.url);

async function gh(path) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    headers: { Accept: "application/vnd.github+json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
  });
  if (!res.ok) throw new Error(`GitHub ${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

async function all(path, key) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const body = await gh(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    const items = key ? body[key] : body;
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const now = new Date();
const since = new Date(now.getTime() - WINDOW_DAYS * 864e5);

// Newest first, as the API returns them; main is linear, so index order is ancestry order.
const commits = (await all(`/commits?sha=main&since=${since.toISOString()}`)).map((c) => ({
  sha: c.sha,
  at: new Date(c.commit.committer.date),
  title: c.commit.message.split("\n")[0],
}));
const index = new Map(commits.map((c, i) => [c.sha, i]));

const candidates = (await all(`/actions/workflows/deploy.yml/runs?created=>=${since.toISOString().slice(0, 10)}`, "workflow_runs"))
  .filter((r) => r.status === "completed" && ["success", "failure"].includes(r.conclusion))
  .map((r) => ({
    id: r.id,
    attempt: r.run_attempt ?? 1,
    sha: r.head_sha,
    ok: r.conclusion === "success",
    started: new Date(r.run_started_at ?? r.created_at),
    ended: new Date(r.updated_at),
    url: r.html_url,
  }));

// A failed run only counts if it got as far as changing production: the deploy step succeeded and
// a later step (the live verification) failed. A run that failed while building changed nothing.
// (The step was renamed when deploys started promoting CI's image; both names count.)
const DEPLOY_STEPS = new Set(["Deploy the exact digest that was built", "Deploy the digest CI tested"]);
const reachedProduction = async (jobsPath) => {
  const { jobs } = await gh(jobsPath);
  return jobs.some((j) => j.steps?.some((st) => DEPLOY_STEPS.has(st.name) && st.conclusion === "success"));
};
const runs = [];
for (const r of candidates) {
  if (r.ok) runs.push(r);
  else if (await reachedProduction(`/actions/runs/${r.id}/jobs`)) runs.push(r);
  // A run that was re-run only shows its latest attempt; earlier attempts that failed after
  // deploying were failed changes too.
  for (let n = 1; n < r.attempt; n++) {
    const a = await gh(`/actions/runs/${r.id}/attempts/${n}`);
    if (a.conclusion === "failure" && (await reachedProduction(`/actions/runs/${r.id}/attempts/${n}/jobs`))) {
      runs.push({ ...r, ok: false, ended: new Date(a.updated_at), started: new Date(a.run_started_at ?? a.created_at) });
    }
  }
}
runs.sort((a, b) => a.ended - b.ended);

// Every successful deploy counts, including a redeploy of an older commit.
const deploys = runs.filter((r) => r.ok);

// Lead time: each commit in the window to the first successful deploy of it or a newer commit.
const leadMinutes = [];
const leadBySha = new Map();
for (const c of commits) {
  const i = index.get(c.sha);
  const d = deploys.find((r) => index.has(r.sha) && index.get(r.sha) <= i && r.ended >= c.at);
  if (!d) continue;
  const m = (d.ended - c.at) / 6e4;
  leadMinutes.push(m);
  leadBySha.set(c.sha, m);
}

// Failures and recovery: a failed run, then the next successful one.
const failed = runs.filter((r) => !r.ok);
const restoreMinutes = failed
  .map((f) => deploys.find((d) => d.ended > f.ended))
  .map((d, k) => (d ? (d.ended - failed[k].ended) / 6e4 : null))
  .filter((m) => m !== null);

// Calendar days in Singapore time (UTC+8), the oldest first, ending today.
const SGT = 8 * 36e5;
const dayOf = (t) => new Date(t.getTime() + SGT).toISOString().slice(0, 10);
const today = Date.parse(dayOf(now));
const perDay = Array.from({ length: WINDOW_DAYS }, (_, k) => {
  const date = new Date(today - (WINDOW_DAYS - 1 - k) * 864e5).toISOString().slice(0, 10);
  return { date, deploys: deploys.filter((d) => dayOf(d.ended) === date).length };
});

// Titles for deploys of commits older than the window (a redeploy), fetched one by one.
const titles = new Map(commits.map((c) => [c.sha, c.title]));
for (const d of deploys.slice(-6)) {
  if (!titles.has(d.sha)) titles.set(d.sha, (await gh(`/commits/${d.sha}`)).commit.message.split("\n")[0]);
}

const result = {
  generated: now.toISOString(),
  windowDays: WINDOW_DAYS,
  deploys: deploys.length,
  daysWithDeploys: perDay.filter((d) => d.deploys > 0).length,
  leadTimeMinutes: { median: median(leadMinutes), commits: leadMinutes.length },
  // null, not 0, when nothing deployed: "0% of nothing" is not a rate.
  changeFailureRate: runs.length ? failed.length / runs.length : null,
  failedDeploys: failed.length,
  restoreMinutes: { median: median(restoreMinutes), count: restoreMinutes.length },
  deployMinutes: { median: median(deploys.map((d) => (d.ended - d.started) / 6e4)) },
  perDay,
  recent: deploys
    .slice(-6)
    .reverse()
    .map((d) => ({
      sha: d.sha.slice(0, 7),
      title: titles.get(d.sha),
      ended: d.ended.toISOString(),
      minutes: Math.round(((d.ended - d.started) / 6e4) * 10) / 10,
      leadMinutes: leadBySha.has(d.sha) ? Math.round(leadBySha.get(d.sha) * 10) / 10 : null,
      url: d.url,
    })),
};

await mkdir(new URL(".", OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(result, null, 2) + "\n");
console.log(
  `delivery: ${result.deploys} deploys on ${result.daysWithDeploys} days, median lead ${result.leadTimeMinutes.median?.toFixed(1)} min, ` +
    `CFR ${result.changeFailureRate === null ? "n/a" : (result.changeFailureRate * 100).toFixed(1) + "%"} (${failed.length} of ${runs.length})`,
);
