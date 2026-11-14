// The home page's "Recently" list as the build sees it, written to src/content/generated/
// activity.json: pull requests by the site's owner in public repositories (merged, or open and in
// review) and releases of their own projects, newest first. Runs in CI on pushes to main, just before
// the image is built (and by hand to refresh the committed snapshot). On Cloud Run the Go server
// refreshes the same list from GitHub at most hourly (api/internal/activity) and serves this snapshot
// until then; the two apply the same rules, so keep them in step.
//
//   node scripts/activity.mjs            (GITHUB_TOKEN raises the rate limit; public data either way)
import { writeFile } from "node:fs/promises";

const USER = "zhenxi0901";
// Where pull requests may come from (owner/name, or owner/* for all of an owner's): the list goes on
// the home page unread, so nothing from anywhere else appears by itself. The server's config
// (api/internal/server) lists the same, and a Go test holds the two to it.
const REPOS = ["zhenxi0901/*", "hyscale-lab/ARIES", "whupdido/mdp", "maeganliew/LTU_VIE", "anAcc22/SC1015_Group_Project"];
const RELEASES = ["zhenxi0901/dora-card"];
const KEEP = 8;
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = new URL("../src/content/generated/activity.json", import.meta.url);

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "portfolio-activity",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${path.split("?")[0]}: HTTP ${res.status}`);
  return res.json();
}

const onGitHub = (link) => {
  try {
    const u = new URL(link);
    return u.protocol === "https:" && u.host === "github.com";
  } catch {
    return false;
  }
};
const repoName = (apiUrl) => {
  const rest = apiUrl.split("/repos/")[1] ?? "";
  return rest.split("/").length === 2 ? rest : "";
};
const utc = (iso) => new Date(iso).toISOString().replace(".000Z", "Z");
const allowed = (repo) => {
  const parts = repo.toLowerCase().split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  return REPOS.some((r) => [parts.join("/"), `${parts[0]}/*`].includes(r.toLowerCase()));
};

const items = [];
const q = encodeURIComponent(`author:${USER} is:pr is:public`);
const search = await gh(`/search/issues?q=${q}&sort=updated&order=desc&per_page=30`);
for (const it of search.items) {
  const repo = repoName(it.repository_url);
  if (!it.pull_request || !repo || !allowed(repo) || !onGitHub(it.html_url)) continue;
  const base = { title: it.title.trim(), repo, number: it.number, url: it.html_url };
  if (it.pull_request.merged_at) items.push({ kind: "merged", ...base, at: utc(it.pull_request.merged_at) });
  else if (it.state === "open" && !it.draft) items.push({ kind: "review", ...base, at: utc(it.created_at) });
}
for (const repo of RELEASES) {
  const name = repo.split("/")[1];
  for (const r of await gh(`/repos/${repo}/releases?per_page=5`)) {
    if (r.draft || r.prerelease || !r.published_at || !onGitHub(r.html_url)) continue;
    items.push({ kind: "release", title: `${name} ${r.tag_name}`, repo, url: r.html_url, at: utc(r.published_at) });
  }
}

// Newest first, one entry per link, the first KEEP (as activity.Newest does).
items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
const seen = new Set();
const feed = items.filter((it) => !seen.has(it.url) && seen.add(it.url)).slice(0, KEEP);

await writeFile(OUT, JSON.stringify({ items: feed, updated: utc(new Date().toISOString()), source: "snapshot" }, null, 2) + "\n");
console.log(`activity.json: ${feed.length} items, newest ${feed[0]?.at ?? "none"}`);
