// DORA metrics and the changelog for this site, from the repository's own history: commits on main
// and the deploy workflow's runs. Runs in CI on pushes to main, just before the image is built and
// tested (and by hand to refresh the committed snapshots), writing src/content/generated/
// delivery.json (the last 30 days) and changelog.json (every release since the first).
//
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name node scripts/delivery-stats.mjs
//
// Definitions (DORA's four keys, as applied here):
//   deploys              successful runs of deploy.yml in the window
//   lead time            commit time to the end of the first successful deploy that contains it
//   change failure rate  deploy runs (and earlier attempts of re-run ones) that failed after their
//                        revision took traffic, out of all whose revision took traffic; null when none
//   time to restore      for a failed deploy that rolled itself back, traffic switch to rollback;
//                        otherwise, time until the next successful deploy
// Also counted: releases stopped before taking traffic (the candidate failed its checks), releases
// held by the error-budget gate, and rollback drills, which are rehearsals and never count as
// failed changes.
import { mkdir, writeFile } from "node:fs/promises";

const REPO = process.env.GITHUB_REPOSITORY ?? "zhenxi0901/portfolio";
const TOKEN = process.env.GITHUB_TOKEN;
const WINDOW_DAYS = 30;
const CHANGELOG_LIMIT = 100;
const GENERATED = new URL("../src/content/generated/", import.meta.url);

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
const round1 = (x) => Math.round(x * 10) / 10;

const now = new Date();
const since = new Date(now.getTime() - WINDOW_DAYS * 864e5);

// Every commit on main, newest first; main is linear, so index order is ancestry order.
const commits = (await all(`/commits?sha=main`)).map((c) => ({
  sha: c.sha,
  at: new Date(c.commit.committer.date),
  title: c.commit.message.split("\n")[0],
}));
const index = new Map(commits.map((c, i) => [c.sha, i]));

const candidates = (await all(`/actions/workflows/deploy.yml/runs`, "workflow_runs"))
  .filter((r) => r.status === "completed" && ["success", "failure"].includes(r.conclusion))
  .map((r) => ({
    id: r.id,
    attempt: r.run_attempt ?? 1,
    sha: r.head_sha,
    ok: r.conclusion === "success",
    started: new Date(r.run_started_at ?? r.created_at),
    ended: new Date(r.updated_at),
    url: r.html_url,
    drill: r.display_title === "Rollback drill",
  }));

// What a run did to production, from its steps. A revision "took traffic" when the step that sends
// users to it succeeded; earlier deploys switched traffic in the deploy step itself (both of the
// older names). A run that failed before that point changed nothing users could see.
const TRAFFIC_STEPS = new Set(["Deploy the exact digest that was built", "Deploy the digest CI tested", "Send traffic to the new revision"]);
const step = (steps, name) => steps.find((st) => st.name === name);
async function inspect(jobsPath) {
  const { jobs } = await gh(jobsPath);
  const steps = jobs.flatMap((j) => j.steps ?? []);
  const traffic = steps.find((st) => TRAFFIC_STEPS.has(st.name) && st.conclusion === "success");
  const rollback = step(steps, "Roll back to the previous revision");
  const rolledBack = rollback?.conclusion === "success";
  return {
    tookTraffic: Boolean(traffic),
    rolledBack,
    restoreMs: rolledBack && traffic ? Date.parse(rollback.completed_at) - Date.parse(traffic.completed_at) : null,
    stoppedBeforeTraffic: step(steps, "Check the new revision before it takes traffic")?.conclusion === "failure",
    heldByBudget: step(steps, "Check the error budget")?.conclusion === "failure",
  };
}

// One event per run, and per earlier failed attempt of a run that was re-run (the API only shows a
// run's latest attempt): what it did to production. Runs that failed before changing anything
// (no tested image, a failed build in the old pipeline) are not events.
const events = [];
async function record(r, jobsPath) {
  if (r.ok && !r.drill) return events.push({ ...r, kind: "deploy" });
  const s = await inspect(jobsPath);
  if (r.drill) {
    if (s.rolledBack) events.push({ ...r, kind: "drill", restoreMs: s.restoreMs });
  } else if (s.tookTraffic) events.push({ ...r, kind: "failed", rolledBack: s.rolledBack, restoreMs: s.restoreMs });
  else if (s.stoppedBeforeTraffic) events.push({ ...r, kind: "stopped" });
  else if (s.heldByBudget) events.push({ ...r, kind: "held" });
}
for (const r of candidates) {
  await record(r, `/actions/runs/${r.id}/jobs`);
  for (let n = 1; n < r.attempt; n++) {
    const a = await gh(`/actions/runs/${r.id}/attempts/${n}`);
    if (a.conclusion !== "failure") continue;
    const attempt = { ...r, ok: false, ended: new Date(a.updated_at), started: new Date(a.run_started_at ?? a.created_at) };
    await record(attempt, `/actions/runs/${r.id}/attempts/${n}/jobs`);
  }
}
events.sort((a, b) => a.ended - b.ended);

const allDeploys = events.filter((e) => e.kind === "deploy");
const recent = events.filter((e) => e.ended >= since);
const deploys = recent.filter((e) => e.kind === "deploy");
const failed = recent.filter((e) => e.kind === "failed");
const tookTraffic = deploys.length + failed.length;

// Lead time: each commit in the window to the first successful deploy of it or a newer commit.
const leadMinutes = [];
const leadBySha = new Map();
for (const c of commits.filter((c) => c.at >= since)) {
  const i = index.get(c.sha);
  const d = allDeploys.find((r) => index.has(r.sha) && index.get(r.sha) <= i && r.ended >= c.at);
  if (!d) continue;
  const m = (d.ended - c.at) / 6e4;
  leadMinutes.push(m);
  leadBySha.set(c.sha, m);
}

// Failures and recovery: an automatic rollback if there was one, else the next successful deploy.
const restoreMinutes = failed
  .map((f) => {
    if (f.restoreMs != null) return f.restoreMs / 6e4;
    const next = allDeploys.find((d) => d.ended > f.ended);
    return next ? (next.ended - f.ended) / 6e4 : null;
  })
  .filter((m) => m !== null);

// Calendar days in Singapore time (UTC+8), the oldest first, ending today.
const SGT = 8 * 36e5;
const dayOf = (t) => new Date(t.getTime() + SGT).toISOString().slice(0, 10);
const today = Date.parse(dayOf(now));
const perDay = Array.from({ length: WINDOW_DAYS }, (_, k) => {
  const date = new Date(today - (WINDOW_DAYS - 1 - k) * 864e5).toISOString().slice(0, 10);
  return { date, deploys: deploys.filter((d) => dayOf(d.ended) === date).length };
});

const titles = new Map(commits.map((c) => [c.sha, c.title]));
const titleOf = async (sha) => {
  if (!titles.has(sha)) titles.set(sha, (await gh(`/commits/${sha}`)).commit.message.split("\n")[0]);
  return titles.get(sha);
};
const lastDrill = events.filter((e) => e.kind === "drill").at(-1);

// The commit this image is being built from (CI sets GITHUB_SHA), for the live card on the profile.
const head = commits.find((c) => c.sha === process.env.GITHUB_SHA) ?? commits[0];

const delivery = {
  generated: now.toISOString(),
  windowDays: WINDOW_DAYS,
  deploys: deploys.length,
  daysWithDeploys: perDay.filter((d) => d.deploys > 0).length,
  leadTimeMinutes: { median: median(leadMinutes), commits: leadMinutes.length },
  // null, not 0, when nothing deployed: "0% of nothing" is not a rate.
  changeFailureRate: tookTraffic ? failed.length / tookTraffic : null,
  failedDeploys: failed.length,
  restoreMinutes: { median: median(restoreMinutes), count: restoreMinutes.length },
  deployMinutes: { median: median(deploys.map((d) => (d.ended - d.started) / 6e4)) },
  safeguards: {
    stoppedBeforeTraffic: recent.filter((e) => e.kind === "stopped").length,
    heldByBudget: recent.filter((e) => e.kind === "held").length,
    rollbacks: failed.filter((f) => f.rolledBack).length,
    lastDrill: lastDrill
      ? { ended: lastDrill.ended.toISOString(), restoreSeconds: Math.round(lastDrill.restoreMs / 1000), url: lastDrill.url }
      : null,
  },
  head: head ? { sha: head.sha.slice(0, 7), title: head.title, committed: head.at.toISOString() } : null,
  perDay,
  recent: await Promise.all(
    deploys
      .slice(-6)
      .reverse()
      .map(async (d) => ({
        sha: d.sha.slice(0, 7),
        title: await titleOf(d.sha),
        ended: d.ended.toISOString(),
        minutes: round1((d.ended - d.started) / 6e4),
        leadMinutes: leadBySha.has(d.sha) ? round1(leadBySha.get(d.sha)) : null,
        url: d.url,
      })),
  ),
};

// The changelog: what each deploy shipped (the commits since the previous successful deploy, newest
// first), the GitHub release it became, and the runs that stopped, were held, rolled back or were drills.
const tagBySha = new Map();
for (const r of await all(`/releases`)) {
  if (/^[0-9a-f]{40}$/.test(r.target_commitish)) tagBySha.set(r.target_commitish, r.tag_name);
}
const entries = [];
let shippedTo = commits.length; // index of the oldest commit not yet shipped, plus one
for (const e of events) {
  const base = { kind: e.kind, at: e.ended.toISOString(), sha: e.sha.slice(0, 7), url: e.url };
  if (e.kind !== "deploy") {
    entries.push({ ...base, title: await titleOf(e.sha), restoreSeconds: e.restoreMs != null ? Math.round(e.restoreMs / 1000) : null });
    continue;
  }
  const i = index.get(e.sha);
  const shipped = i !== undefined && i < shippedTo ? commits.slice(i, shippedTo) : [];
  if (shipped.length) shippedTo = i;
  entries.push({
    ...base,
    release: tagBySha.get(e.sha) ?? null,
    minutes: round1((e.ended - e.started) / 6e4),
    commits: shipped.map((c) => ({ sha: c.sha.slice(0, 7), title: c.title })),
  });
}
const changelog = { generated: now.toISOString(), entries: entries.reverse().slice(0, CHANGELOG_LIMIT) };

await mkdir(GENERATED, { recursive: true });
await writeFile(new URL("delivery.json", GENERATED), JSON.stringify(delivery, null, 2) + "\n");
await writeFile(new URL("changelog.json", GENERATED), JSON.stringify(changelog, null, 2) + "\n");
console.log(
  `delivery: ${delivery.deploys} deploys on ${delivery.daysWithDeploys} days, median lead ${delivery.leadTimeMinutes.median?.toFixed(1)} min, ` +
    `CFR ${delivery.changeFailureRate === null ? "n/a" : (delivery.changeFailureRate * 100).toFixed(1) + "%"} (${failed.length} of ${tookTraffic}); ` +
    `changelog: ${changelog.entries.length} entries`,
);
