// Lighthouse budgets for CI: run a phone-profile audit of each URL and fail the build if a page
// drops below its budget. Accessibility and SEO must stay at 100; performance has a floor rather
// than a target, because shared CI runners are noisy.
//
//   node scripts/lighthouse-check.mjs http://localhost:8080/ http://localhost:8080/writing/...
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LIGHTHOUSE = "lighthouse@12.8.2";
// Performance is a floor against big regressions only: shared runners score about 25 points lower
// than a laptop on the same build.
const BUDGET = { accessibility: 1, seo: 1, "best-practices": 0.95, performance: 0.5 };
const REPORTS = process.env.LIGHTHOUSE_REPORTS;
const urls = process.argv.slice(2);
if (!urls.length) {
  console.error("usage: lighthouse-check.mjs <url>...");
  process.exit(2);
}

const dir = REPORTS ?? mkdtempSync(join(tmpdir(), "lh-"));
mkdirSync(dir, { recursive: true });
const rows = [];
let failed = false;
for (const [i, url] of urls.entries()) {
  const out = join(dir, `${i}.json`);
  const args = ["--yes", LIGHTHOUSE, url, "--output=json", `--output-path=${out}`, "--quiet", "--chrome-flags=--headless=new --no-sandbox"];
  // Windows can only run npx through a shell, which needs the spaced argument quoted.
  const win = process.platform === "win32";
  execFileSync("npx", win ? args.map((a) => (a.includes(" ") ? `"${a}"` : a)) : args, { stdio: "inherit", shell: win });
  const report = JSON.parse(readFileSync(out, "utf8"));
  const scores = Object.fromEntries(Object.keys(BUDGET).map((k) => [k, report.categories[k].score]));
  const misses = Object.entries(BUDGET).filter(([k, min]) => scores[k] < min);
  for (const [k] of misses) {
    // Name the failing audits, so the log says what to fix.
    const audits = report.categories[k].auditRefs
      .filter((r) => r.weight > 0 && report.audits[r.id].score !== null && report.audits[r.id].score < 1)
      .map((r) => r.id);
    console.error(`::error::${url}: ${k} ${Math.round(scores[k] * 100)} is under ${Math.round(BUDGET[k] * 100)} (${audits.join(", ")})`);
    // And the elements involved, so a failure can be fixed without reproducing it.
    for (const id of audits) {
      for (const item of (report.audits[id].details?.items ?? []).slice(0, 5)) {
        const why = (item.node?.explanation ?? "").split("\n")[1]?.trim() ?? "";
        if (item.node) console.error(`    ${id}: ${item.node.snippet.slice(0, 160)}  ${why}`);
      }
    }
  }
  failed ||= misses.length > 0;
  rows.push([url, ...Object.keys(BUDGET).map((k) => `${Math.round(scores[k] * 100)}${scores[k] < BUDGET[k] ? " ✗" : ""}`)]);
}

const table = [
  `| Page | ${Object.keys(BUDGET).join(" | ")} |`,
  `|---|${Object.keys(BUDGET).map(() => "---").join("|")}|`,
  `| Budget | ${Object.values(BUDGET).map((v) => (v === 1 ? "100" : `≥ ${v * 100}`)).join(" | ")} |`,
  ...rows.map((r) => `| ${r.join(" | ")} |`),
].join("\n");
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Lighthouse (phone profile)\n\n${table}\n`);
process.exit(failed ? 1 : 0);
