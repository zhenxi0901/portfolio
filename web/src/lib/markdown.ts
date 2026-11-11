// Markdown copies of the site's pages, for AI agents and anyone who prefers text: /llms.txt indexes
// them (llmstxt.org) and each one is served under /md/. Built from the same content files as the
// pages, so they cannot drift apart.
import { cases, experience, education, profile, type CaseStudy } from "@/content/profile";
import { posts, type Post } from "@/content/writing";
import { postmortems, type Postmortem } from "@/content/postmortems";
import { decisions } from "@/content/decisions";
import { buildKnowledge } from "@/content/knowledge";
import { SITE_URL } from "@/lib/site";

const list = (items: string[]) => items.map((t) => `- ${t}`).join("\n");
const stats = (xs: { value: string; label: string }[]) => list(xs.map((s) => `**${s.value}**: ${s.label}`));
const abs = (href: string) => (href.startsWith("/") ? SITE_URL + href : href);

export function caseMd(c: CaseStudy) {
  return [
    `# ${c.title}`,
    `${c.org}, ${c.year}. Case study by ${profile.name}. Page: ${SITE_URL}/work/${c.id}`,
    `> ${c.summary}`,
    stats(c.numbers),
    `## The problem\n\n${c.problem}`,
    `## What I did\n\n${c.did.map((d, i) => `${i + 1}. ${d}`).join("\n")}`,
    `## Result\n\n${c.result}`,
    `Tools: ${c.stack.join(", ")}.`,
    `## Go further\n\n${list(c.deeper.map((d) => `[${d.label}](${abs(d.href)})`))}`,
  ].join("\n\n");
}

export function postMd(p: Post) {
  const body = p.body.map((b) => {
    switch (b.kind) {
      case "h2":
        return `## ${b.text}`;
      case "p":
        return b.text;
      case "code":
        return "```\n" + b.text + "\n```" + (b.caption ? `\n\n*${b.caption}*` : "");
      case "list":
        return list(b.items);
      case "callout":
        return `> ${b.text}`;
    }
  });
  return [
    `# ${p.title}`,
    `By ${profile.name}, ${p.date}. Page: ${SITE_URL}/writing/${p.slug}`,
    `> ${p.summary}`,
    stats(p.stats),
    ...body,
    `## Go further\n\n${list(p.links.map((l) => `[${l.label}](${abs(l.href)})`))}`,
  ].join("\n\n");
}

export function postmortemMd(p: Postmortem) {
  return [
    `# ${p.title}`,
    `Blameless postmortem (${p.kind.toLowerCase()}), ${p.date}, by ${profile.name}. Page: ${SITE_URL}/postmortems/${p.slug}`,
    `> ${p.summary}`,
    stats(p.stats),
    `## Impact\n\n${p.impact}`,
    `## Timeline\n\n${list(p.timeline.map((t) => `**${t.at}** (${t.tag}): ${t.what}`))}`,
    `## Root cause\n\n${p.rootCause.join("\n\n")}`,
    `## Contributing factors\n\n${list(p.contributing)}`,
    `## Detection\n\n${p.detection}`,
    `## What went well\n\n${list(p.wentWell)}`,
    `## Where we got lucky\n\n${p.lucky}`,
    `## Action items\n\n${list(p.actions.map((a) => `[${a.done ? "x" : " "}] ${a.what}${a.commit ? ` (commit ${a.commit})` : ""}${a.when ? ` (${a.when})` : ""}`))}`,
    `## Lesson\n\n${p.lesson}`,
  ].join("\n\n");
}

export function decisionsMd() {
  return [
    `# Why this site is built the way it is`,
    `Architecture decision records by ${profile.name}. Page: ${SITE_URL}/decisions`,
    ...decisions.map((d) =>
      [
        `## ${d.id}. ${d.title}`,
        `${d.status}, ${d.date}.`,
        `**Context.** ${d.context.join(" ")}`,
        `**Decision.** ${d.decision.join(" ")}`,
        `**What it buys.**\n\n${list([...d.good])}`,
        `**What it costs.**\n\n${list([...d.bad])}`,
      ].join("\n\n"),
    ),
  ].join("\n\n");
}

/** Every Markdown page, by its path under /md/. */
export const markdownPages: { path: string; title: string; summary: string; body: () => string }[] = [
  ...cases.map((c) => ({ path: `work/${c.id}.md`, title: c.title, summary: c.summary, body: () => caseMd(c) })),
  ...posts.map((p) => ({ path: `writing/${p.slug}.md`, title: p.title, summary: p.summary, body: () => postMd(p) })),
  ...postmortems.map((p) => ({ path: `postmortems/${p.slug}.md`, title: p.title, summary: p.summary, body: () => postmortemMd(p) })),
  { path: "decisions.md", title: "Architecture decision records", summary: "Why this site is built the way it is, and what each choice costs.", body: decisionsMd },
];

const link = (prefix: string) =>
  list(markdownPages.filter((p) => p.path.startsWith(prefix)).map((p) => `[${p.title}](${SITE_URL}/md/${p.path}): ${p.summary}`));

/** /llms.txt: what this site is and where its content lives as Markdown. */
export function llmsTxt() {
  const now = experience.filter((r) => r.period.endsWith("now")).map((r) => `${r.role} at ${r.org}`);
  return [
    `# ${profile.name}`,
    `> ${profile.role}. ${profile.intro} ${profile.availability}; based in ${profile.location}. This site is itself a small production service: a Go API on Cloud Run with its own SLO, signed releases and public postmortems.`,
    `Currently: ${now.join("; ")}. ${education.degree} at ${education.school}, ${education.period}. Contact: ${profile.email}.`,
    `Everything below is also available to an AI agent as tools: this site is a Model Context Protocol server at ${SITE_URL}/mcp (POST, Streamable HTTP, no authentication, read-only). Tools: ask, search_facts, list_topics, get_status, get_delivery.`,
    `## Work\n\n${link("work/")}`,
    `## Writing\n\n${link("writing/")}`,
    `## Postmortems\n\n${link("postmortems/")}`,
    `## How this site runs\n\n${list([
      `[Architecture decision records](${SITE_URL}/md/decisions.md): why it is built this way, and what each choice costs.`,
      `[Status](${SITE_URL}/status): live state, availability against a 99.9% SLO, and the incident history.`,
      `[Changelog](${SITE_URL}/changelog): every release to production and the commits it shipped.`,
      `[Live SLO as JSON](${SITE_URL}/api/slo): availability and error budget from Google Cloud uptime checks.`,
    ])}`,
    `## Optional\n\n${list([
      `[Every fact on the site in one file](${SITE_URL}/llms-full.txt): the text the site's own Ask console retrieves from.`,
      `[Source code](${profile.github}/portfolio): Next.js front end, Go API, Terraform and the GitHub Actions pipeline.`,
    ])}`,
    "",
  ].join("\n\n");
}

/** /llms-full.txt: every fact the Ask console and the MCP tools answer from. */
export function llmsFullTxt() {
  return [
    `# ${profile.name}: everything this site knows`,
    `> The facts behind ${SITE_URL}, one section each. The site's Ask console and its MCP server (${SITE_URL}/mcp) answer from exactly this text.`,
    ...buildKnowledge().map((f) => `## ${f.title}\n\n${f.lead ? f.lead + " " : ""}${f.text}`),
    "",
  ].join("\n\n");
}
