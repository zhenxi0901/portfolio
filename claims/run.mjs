// Tests what the live site claims. `node claims/run.mjs [address]`; GITHUB_TOKEN raises GitHub's limit from 60 requests
// an hour. In the workflow it also writes check.json, the check run that the site reads its own results from.
import { appendFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { CannotTell, headline, table, testClaims } from "./harness.mjs";
import { tests } from "./tests.mjs";

const REPO = "zhenxi0901/portfolio";
const base = (process.argv[2] ?? "https://portfolio-emsghin2iq-as.a.run.app").replace(/\/$/, "");
const { GITHUB_TOKEN, GITHUB_STEP_SUMMARY, GITHUB_SERVER_URL, GITHUB_RUN_ID } = process.env;

/** One request. What the other side does wrong (nothing, 429, 5xx) is not evidence about a claim. */
async function ask(url, { allow = [], ...init } = {}) {
  const { host } = new URL(url);
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000), ...init, headers: { "User-Agent": "portfolio-claims", ...init.headers } });
  } catch {
    throw new CannotTell(`${host} did not answer`);
  }
  const limited = res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0";
  if (!allow.includes(res.status) && (res.status === 429 || res.status >= 500 || limited)) throw new CannotTell(`${host} answered ${res.status}`);
  return res;
}

async function github(path, accept = "application/vnd.github+json") {
  const res = await ask(`https://api.github.com${path}`, {
    headers: { Accept: accept, "X-GitHub-Api-Version": "2022-11-28", ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}) },
  });
  if (res.status === 404 || res.status === 422) return null;
  if (!res.ok) throw new CannotTell(`GitHub answered ${res.status}`);
  return accept.includes("raw") ? res.text() : res.json();
}

const world = {
  repo: REPO,
  owner: REPO.split("/")[0],
  site: async (path, init) => ask(base + path, init),
  json: async (path, init) => {
    const res = await ask(base + path, init);
    if (!res.ok) throw new Error(`${path} answered ${res.status}`);
    return res.json();
  },
  page: async (url) => {
    const res = await ask(url);
    if (!res.ok) throw new CannotTell(`${new URL(url).host} answered ${res.status}`);
    return res.text();
  },
  github,
  /** A list that comes in pages, whole. */
  pages: async (path, key) => {
    const all = [];
    for (let page = 1; ; page++) {
      const body = await github(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      const items = (key ? body?.[key] : body) ?? [];
      all.push(...items);
      if (items.length < 100) return all;
    }
  },
  /** A file on main. */
  file: async (path) => {
    const text = await github(`/repos/${REPO}/contents/${path}`, "application/vnd.github.raw+json");
    if (text === null) throw new CannotTell(`${path} is not in the repository`);
    return text;
  },
};

// A deploy under way changes what is running between one request and the next: let it finish.
for (let i = 0; i < 20; i++) {
  const busy = await github(`/repos/${REPO}/actions/workflows/deploy.yml/runs?status=in_progress&per_page=1`).catch(() => null);
  if (!busy?.total_count) break;
  console.log("A deploy is under way; waiting for it.");
  await sleep(20_000);
}

const evidence = await world.json("/evidence.json");
const { commit } = await world.json("/api/status");
const textOf = (id) => [...evidence.claims, evidence.false_claim].find((c) => c.id === id)?.claim ?? id;
console.log(`Testing ${evidence.claims.length} claims of ${base}, commit ${commit}\n`);
const mark = { holds: "holds  ", fails: "FAILS  ", unknown: "unknown" };
const v = await testClaims({
  claims: evidence.claims,
  falseClaim: evidence.false_claim,
  tests,
  world,
  report: (r) => console.log(`${mark[r.verdict]}  ${r.id.padEnd(13)} ${r.saw}`),
});
console.log(`\n${headline(v)}`);

const summary = `${headline(v)}. Tested on commit ${commit} of ${base}.\n\n${table(v, textOf)}\n`;
if (GITHUB_STEP_SUMMARY) await appendFile(GITHUB_STEP_SUMMARY, summary);
if (process.env.GITHUB_ACTIONS === "true") {
  // The check goes on the release that was tested, so the server of any release can find its own results.
  const release = await github(`/repos/${REPO}/commits/${commit}`);
  const result = { commit, tested: new Date().toISOString(), trustworthy: v.trustworthy, claims: v.claims, false_claim: v.false_claim };
  await writeFile(
    "check.json",
    JSON.stringify({
      name: "claims",
      head_sha: release?.sha ?? process.env.GITHUB_SHA,
      status: "completed",
      conclusion: !v.ok ? "failure" : v.holding ? "success" : "neutral",
      details_url: `${GITHUB_SERVER_URL}/${REPO}/actions/runs/${GITHUB_RUN_ID}`,
      output: { title: headline(v), summary, text: JSON.stringify(result) },
    }),
  );
}
process.exitCode = v.ok ? 0 : 1;
