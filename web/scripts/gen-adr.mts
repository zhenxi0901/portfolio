// Writes the architecture decision records in src/content/decisions.ts to docs/adr/ as Markdown, so
// they read on GitHub as well as on the site. CI runs this and fails if the committed files differ.
// Run: node scripts/gen-adr.mts   (Node 24 strips the TypeScript types natively)
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { decisions, type Decision } from "../src/content/decisions.ts";

const DIR = new URL("../../docs/adr/", import.meta.url);
const SITE = "https://portfolio-emsghin2iq-as.a.run.app";
const NOTE = "<!-- Generated from web/src/content/decisions.ts by web/scripts/gen-adr.mts. Edit that file, not this one. -->";

const num = (d: Decision) => String(d.id).padStart(4, "0");
const file = (d: Decision) => `${num(d)}-${d.slug}.md`;
const list = (items: string[]) => items.map((t) => `- ${t}`).join("\n");

function record(d: Decision) {
  return [
    NOTE,
    "",
    `# ${d.id}. ${d.title}`,
    "",
    `- Status: ${d.status}`,
    `- Date: ${d.date}`,
    "",
    "## Context",
    "",
    d.context.join("\n\n"),
    "",
    "## Decision",
    "",
    d.decision.join("\n\n"),
    "",
    "## Consequences",
    "",
    "What it buys:",
    "",
    list(d.good),
    "",
    "What it costs:",
    "",
    list(d.bad),
    "",
    "## Evidence",
    "",
    d.evidence.map((e) => `- [${e.label}](../../${e.path})`).join("\n"),
    "",
  ].join("\n");
}

function index() {
  return [
    NOTE,
    "",
    "# Architecture decision records",
    "",
    `Why this site is built the way it is: each record gives the context, the decision, and what it buys and costs. Also on the site at [/decisions](${SITE}/decisions).`,
    "",
    "| # | Decision | Date | Status |",
    "|---|---|---|---|",
    ...decisions.map((d) => `| ${d.id} | [${d.title}](${file(d)}) | ${d.date} | ${d.status} |`),
    "",
  ].join("\n");
}

mkdirSync(DIR, { recursive: true });
// Start clean, so a renamed or removed record leaves no stale file behind.
for (const f of readdirSync(DIR)) if (f.endsWith(".md")) rmSync(new URL(f, DIR));
for (const d of decisions) writeFileSync(new URL(file(d), DIR), record(d));
writeFileSync(new URL("README.md", DIR), index());
console.log(`wrote ${decisions.length} decision records to docs/adr`);
