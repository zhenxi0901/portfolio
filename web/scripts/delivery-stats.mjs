// DORA metrics for this site, from the repository's own history: commits on main and the deploy
// workflow's runs. Runs in the deploy job just before the image is built (and by hand to refresh
// the committed snapshot), writing src/content/generated/delivery.json.
//
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name node scripts/delivery-stats.mjs
//
// Definitions (DORA's four keys, as applied here):
//   deploys              successful runs of deploy.yml in the window
//   lead time            commit time to the end of the first successful deploy that contains it
//   change failure rate  deploy runs that failed after reaching Cloud Run, out of all that did
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
    sha: r.head_sha,
    ok: r.conclusion === "success",
    started: new Date(r.run_started_at ?? r.created_at),
    ended: new Date(r.updated_at),
    url: r.html_url,
  }))
  .filter((r) => index.has(r.sha))
  .sort((a, b) => a.ended - b.ended);

// A failed run only counts if it got as far as changing production: the deploy step succeeded and
// a later step (the live verification) failed. A run that failed while building changed nothing.
const DEPLOY_STEP = "Deploy the exact digest that was built";
const runs = [];
for (const r of candidates) {
  if (r.ok) {
    runs.push(r);
    continue;
  }
  const { jobs } = await gh(`/actions/runs/${r.id}/jobs`);
  const reached = jobs.some((j) => j.steps?.some((st) => st.name === DEPLOY_STEP && st.conclusion === "success"));
  if (reached) runs.push(r);
}

const deploys = runs.filter((r) => r.ok);

// Lead time: each commit to the first successful deploy of it or a newer commit.
const leadMinutes = [];
const leadBySha = new Map();
for (const c of commits) {
  const i = index.get(c.sha);
  const d = deploys.find((r) => index.get(r.sha) <= i && r.ended >= c.at);
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

const perDay = Array.from({ length: WINDOW_DAYS }, (_, k) => {
  const end = new Date(now.getTime() - (WINDOW_DAYS - 1 - k) * 864e5);
  const start = new Date(end.getTime() - 864e5);
  return { end: end.toISOString(), deploys: deploys.filter((d) => d.ended > start && d.ended <= end).length };
});

const result = {
  generated: now.toISOString(),
  windowDays: WINDOW_DAYS,
  deploys: deploys.length,
  daysWithDeploys: perDay.filter((d) => d.deploys > 0).length,
  leadTimeMinutes: { median: median(leadMinutes), commits: leadMinutes.length },
  changeFailureRate: runs.length ? failed.length / runs.length : 0,
  failedDeploys: failed.length,
  restoreMinutes: { median: median(restoreMinutes), count: restoreMinutes.length },
  deployMinutes: { median: median(deploys.map((d) => (d.ended - d.started) / 6e4)) },
  perDay,
  recent: deploys
    .slice(-6)
    .reverse()
    .map((d) => ({
      sha: d.sha.slice(0, 7),
      title: commits[index.get(d.sha)].title,
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
    `CFR ${(result.changeFailureRate * 100).toFixed(1)}% (${failed.length} of ${runs.length})`,
);
