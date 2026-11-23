// One test per claim on /evidence that can be checked from outside, under the claim's id. Each is given the claim's
// own numbers, as the live site publishes them, and compares them with a record the site does not keep: its API as
// any visitor gets it, GitHub's record of the runs and releases, other people's repositories, a conference's page.
// A test says whether the claim holds and what it saw; it throws CannotTell when the record cannot be read.
import { CannotTell } from "./harness.mjs";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SINGAPORE = 8 * HOUR;
// GitHub keeps run records for 90 days; a few days short of that, so a run never half expires under a test.
const RUNS_KEPT = 85 * DAY;

const number = (n) => n.toLocaleString("en-GB");
const percent = (x) => `${Number((x * 100).toFixed(4))}%`;
const age = (iso) => Date.now() - Date.parse(iso);
const minutes = (iso) => `${Math.round(age(iso) / 60_000)} min ago`;
/** "10 Nov 2026" in Singapore, as the site writes a merge date. */
const day = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" });

/** A pull request given as owner/repo#number. */
async function pull(world, ref) {
  const [repo, n] = ref.split("#");
  const pr = await world.github(`/repos/${repo}/pulls/${n}`);
  if (!pr) throw new CannotTell(`${ref} is not there any more`);
  return pr;
}
const mine = (world, pr) => pr.user.login === world.owner;
const stepsOf = async (world, run) => {
  const answer = await world.github(`/repos/${world.repo}/actions/runs/${run}/jobs?per_page=100`);
  return answer?.jobs ?? null;
};

export const tests = {
  /** The readings are fresh, against the objective the page names, from as many places as the page says. */
  async availability(world, f) {
    const r = await world.json("/api/slo");
    if (!r.available) throw new CannotTell(`the site has no reading: ${r.reason}`);
    const infra = await world.file("infra/slo.tf");
    const regions = /selected_regions\s*=\s*\[([^\]]+)\]/.exec(infra)?.[1].split(",").length ?? 0;
    const everyMinute = /period\s*=\s*"60s"/.test(infra);
    const last = r.days.at(-1);
    return {
      holds:
        r.target === f.objective && r.window_days === f.windowDays && r.days.length === f.windowDays && regions === f.regions && everyMinute &&
        last.checks > 0 && age(last.end) < 4 * HOUR && age(r.updated) < 3 * HOUR,
      saw: `${percent(r.availability)} of ${number(r.checks)} results passed over ${r.days.filter((d) => d.checks).length} days, against ${percent(r.target)}; ${regions} regions, ${everyMinute ? "every minute" : "not every minute"}; read ${minutes(r.updated)}.`,
    };
  },

  /** What says it is running is the newest release, and it is on main. */
  async commit(world) {
    const { commit } = await world.json("/api/status");
    const release = await world.github(`/repos/${world.repo}/releases/latest`);
    if (!release) throw new CannotTell("there is no release to compare with");
    const main = await world.github(`/repos/${world.repo}/compare/${commit}...main`);
    const released = release.target_commitish.startsWith(commit);
    const onMain = ["identical", "ahead"].includes(main?.status);
    return {
      holds: /^[0-9a-f]{7,}$/.test(commit) && released && onMain,
      saw: `${commit} is running; the newest release, ${release.tag_name}, is ${released ? "that commit" : release.target_commitish.slice(0, 7)}; it is ${onMain ? "" : "not "}on main.`,
    };
  },

  /** An agent's two calls: which tools there are, and one of them. */
  async mcp(world) {
    const call = (method, params) =>
      world.json("/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", "MCP-Protocol-Version": "2025-06-18" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
    const tools = (await call("tools/list", {})).result.tools.map((t) => t.name);
    const status = (await call("tools/call", { name: "get_status", arguments: {} })).result.structuredContent;
    const { commit } = await world.json("/api/status");
    return {
      holds: tools.length > 0 && status.commit === commit,
      saw: `${tools.length} tools (${tools.join(", ")}); get_status says ${status.commit} is running, and so does the site.`,
    };
  },

  /** This month's, read lately, and the lines make the total. */
  async cost(world) {
    const r = await world.json("/api/cost");
    if (!r.available) throw new CannotTell(`the site has no reading: ${r.reason}`);
    const now = new Date();
    const thisMonth = Date.parse(r.start) === Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const sum = r.lines.reduce((t, l) => t + l.cost, 0);
    const adds = Math.abs(sum - r.list_price) < 1e-9 && Math.abs(r.list_price - r.free_tier - r.bill) < 1e-9;
    return {
      holds: thisMonth && adds && age(r.updated) < 5 * HOUR,
      saw: `US$${r.list_price.toFixed(4)} at list price over ${r.days.toFixed(1)} days from ${r.start.slice(0, 10)}, ${adds ? "and the lines add up" : "but the lines do not add up"}; read ${minutes(r.updated)}.`,
    };
  },

  /** Asked to hold a request it holds it, and asked to fail some it fails some. */
  async lab(world) {
    const t0 = performance.now();
    const held = await world.site("/api/lab/echo?slow=1&delay=500");
    await held.arrayBuffer();
    const ms = Math.round(performance.now() - t0);
    let failed = 0;
    const asked = 12;
    for (let i = 0; i < asked; i++) {
      const r = await world.site("/api/lab/echo?fail=0.6", { allow: [503] });
      await r.arrayBuffer();
      if (r.status === 503 && r.headers.get("x-fault") === "error" && r.headers.has("retry-after")) failed++;
    }
    return {
      holds: ms >= 500 && (held.headers.get("x-fault") ?? "").startsWith("slow") && failed > 0,
      saw: `Held a request for ${ms} ms when asked for 500; answered ${failed} of ${asked} with a 503 and Retry-After when asked to fail at 60%.`,
    };
  },

  /** The count and the failures, again, from GitHub's record of the runs in the same days. */
  async deploys(world, f) {
    const end = Date.parse(f.generated);
    const start = (Math.floor((end + SINGAPORE) / DAY) - (f.windowDays - 1)) * DAY - SINGAPORE;
    if (Date.now() - start > RUNS_KEPT) throw new CannotTell("GitHub no longer keeps the runs of those days");
    const iso = (t) => new Date(t).toISOString().slice(0, 19) + "Z";
    const runs = await world.pages(
      `/repos/${world.repo}/actions/workflows/deploy.yml/runs?status=completed&created=${iso(start - DAY)}..${iso(end)}`,
      "workflow_runs",
    );
    let deploys = 0;
    let failed = 0;
    for (const r of runs) {
      const ended = Date.parse(r.updated_at);
      if (ended < start || ended > end || r.display_title === "Rollback drill") continue;
      if (r.conclusion === "success") deploys++;
      if (r.conclusion !== "failure") continue;
      const jobs = (await stepsOf(world, r.id)) ?? [];
      const job = jobs.find((j) => j.name === "deploy");
      if (job?.conclusion === "success") deploys++;
      else if (job?.steps?.some((s) => s.name === "Send traffic to the new revision" && s.conclusion === "success")) failed++;
    }
    return {
      holds: deploys === f.deploys && failed === f.failed,
      saw: `GitHub's record has ${deploys} deploys and ${failed} that failed after taking traffic, in the ${f.windowDays} days to ${day(f.generated)}; the site says ${f.deploys} and ${f.failed}.`,
    };
  },

  /** The seconds between the two steps in the drill's own run. */
  async drill(world, f) {
    const jobs = f.run ? await stepsOf(world, f.run) : null;
    if (!jobs) throw new CannotTell("GitHub keeps run records for 90 days, and the drill's is gone");
    const steps = jobs.flatMap((j) => j.steps ?? []);
    const at = (name) => Date.parse(steps.find((s) => s.name === name && s.conclusion === "success")?.completed_at);
    const seconds = (at("Roll back to the previous revision") - at("Send traffic to the new revision")) / 1000;
    return { holds: seconds === f.seconds, saw: `The drill's run has the rollback done ${seconds} s after the switch; the site says ${f.seconds}.` };
  },

  /** Every release has both files, and the newest ones' images have their attestations. */
  async releases(world) {
    const releases = await world.pages(`/repos/${world.repo}/releases`);
    if (releases.length === 0) throw new CannotTell("there are no releases");
    const has = (r, name) => r.assets.some((a) => a.name === name);
    const without = releases.filter((r) => !has(r, "sbom.spdx.json") || !has(r, "provenance.sigstore.json"));
    let unsigned = 0;
    for (const r of releases.slice(0, 3)) {
      const digest = /sha256:[0-9a-f]{64}/.exec(r.body ?? "")?.[0];
      if (!digest) continue;
      const found = await world.github(`/repos/${world.repo}/attestations/${digest}`);
      if ((found?.attestations?.length ?? 0) < 2) unsigned++;
    }
    const names = without.slice(0, 3).map((r) => r.tag_name).join(", ");
    return {
      holds: without.length === 0 && unsigned === 0,
      saw: `${releases.length - without.length} of ${releases.length} releases carry an SBOM and a provenance bundle${names ? ` (not ${names})` : ""}; ${unsigned ? `${unsigned} of the newest three lack attestations` : "the newest three have both attestations"}.`,
    };
  },

  /** The step that holds releases to the score passed for each of the last ten, and the score it holds them to. */
  async lighthouse(world, f) {
    const gate = await world.file("scripts/lighthouse-check.mjs");
    const floor = (k) => Number(new RegExp(`\\b${k}: ([\\d.]+)`).exec(gate)?.[1]) * 100;
    const recent = (await world.github(`/repos/${world.repo}/releases?per_page=10`)).filter((r) => age(r.published_at) < RUNS_KEPT);
    if (recent.length === 0) throw new CannotTell("GitHub no longer keeps the runs of the last releases");
    let passed = 0;
    for (const r of recent) {
      const runs = await world.github(`/repos/${world.repo}/actions/workflows/ci.yml/runs?event=push&head_sha=${r.target_commitish}&per_page=5`);
      const run = runs?.workflow_runs.find((x) => x.conclusion === "success");
      const steps = run ? ((await stepsOf(world, run.id)) ?? []).flatMap((j) => j.steps ?? []) : [];
      if (steps.some((s) => s.name === "Lighthouse budgets" && s.conclusion === "success")) passed++;
    }
    return {
      holds: passed === recent.length && floor("accessibility") === f.score && floor("seo") === f.score,
      saw: `The gate is ${floor("accessibility")} for accessibility and ${floor("seo")} for SEO, and it passed for ${passed} of the last ${recent.length} releases.`,
    };
  },

  /** Each is there with a root cause, and the commits it cites exist. */
  async postmortems(world, f) {
    let there = 0;
    for (const path of f.pages) {
      const r = await world.site(path, { allow: [404], headers: { Accept: "text/html" } });
      if (r.status === 200 && (await r.text()).includes("Root cause")) there++;
    }
    let commits = 0;
    for (const sha of f.commits) if (await world.github(`/repos/${world.repo}/commits/${sha}`)) commits++;
    return {
      holds: there === f.pages.length && commits === f.commits.length,
      saw: `${there} of ${f.pages.length} write-ups are there with a root cause; ${commits} of the ${f.commits.length} commits they cite are in the repository.`,
    };
  },

  async toolathlon(world, f) {
    const pr = await pull(world, f.pr);
    return {
      holds: mine(world, pr) && (pr.merged_at ?? "").startsWith(f.merged),
      saw: `${f.pr} is by ${pr.user.login}, ${pr.merged_at ? `merged on ${day(pr.merged_at)}` : "not merged"}: ${number(pr.additions)} lines added in ${pr.changed_files} files.`,
    };
  },

  async apptainer(world, f) {
    const pr = await pull(world, f.pr);
    return {
      holds: mine(world, pr) && Boolean(pr.merged_at) && day(pr.merged_at) === f.merged && pr.additions === f.lines && pr.changed_files === f.files,
      saw: `${f.pr} is by ${pr.user.login}, ${pr.merged_at ? `merged on ${day(pr.merged_at)}` : "not merged"}: ${number(pr.additions)} lines added in ${pr.changed_files} files.`,
    };
  },

  /** Says "open and in review, not merged", so it stops holding the day it merges. */
  async plugins(world, f) {
    const pr = await pull(world, f.pr);
    const state = pr.merged_at ? `merged on ${day(pr.merged_at)}` : pr.draft ? "a draft" : pr.state;
    return { holds: mine(world, pr) && pr.state === "open" && !pr.draft, saw: `${f.pr} is by ${pr.user.login} and is ${state}.` };
  },

  async iccv(world, f) {
    const page = await world.page(f.paper);
    const author = page.includes(`content="${f.author}"`);
    const venue = page.includes(`(${f.venue}), ${f.year}`);
    return {
      holds: author && venue,
      saw: `The paper's page ${author ? "lists" : "does not list"} ${f.author} as an author, ${venue ? "in" : "but not in"} the proceedings of ${f.venue} ${f.year}.`,
    };
  },

  async android(world, f) {
    const found = await world.github(`/search/issues?q=${encodeURIComponent(`repo:${f.repo} author:${world.owner} is:pr is:merged`)}&per_page=1`);
    if (!found) throw new CannotTell("GitHub's search did not answer");
    return { holds: found.total_count === f.merged, saw: `GitHub counts ${found.total_count} merged pull requests by ${world.owner} in ${f.repo}; the site says ${f.merged}.` };
  },

  /** The false one. */
  async php(world) {
    const { go_version } = await world.json("/api/status");
    return { holds: /^php/i.test(go_version), saw: `The server says it runs ${go_version}.` };
  },
};
