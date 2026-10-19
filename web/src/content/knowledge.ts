import {
  cases,
  costReview,
  education,
  experience,
  flows,
  fyp,
  monitoringFacts,
  profile,
  publication,
  signals,
} from "@/content/profile";
import { aiOverview, journeys, measures, stack } from "@/content/ai-platform";
import { budgetPolicy, burnRules, investigation, slos, sreTerms } from "@/content/slo";
import { productOrder, products } from "@/content/products";
import { postmortems } from "@/content/postmortems";
import { posts } from "@/content/writing";

// Facts the "Ask" console retrieves from. Built from profile.ts so there is one source of truth;
// exported at build time as /knowledge.json, which the Go API loads too.

// `lead` opens a retrieval answer; "Tools used:" sentences are never picked (see retrieval.ts).
export type Fact = { id: string; title: string; text: string; anchor: string; lead?: string };

export function buildKnowledge(): Fact[] {
  const facts: Fact[] = [];

  facts.push({
    id: "about",
    title: "About ZhenXi",
    anchor: "top",
    text: `I'm ${profile.name}, based in ${profile.location}, and I'm ${profile.availability.toLowerCase()} in SRE, DevOps, cloud and AI infrastructure. ${profile.intro} Email me at ${profile.email}.`,
  });

  for (const c of cases) {
    facts.push({
      id: `case-${c.id}`,
      title: c.title,
      anchor: `case-${c.id}`,
      lead: `${c.title} (${c.org}, ${c.year}).`,
      text: `${c.summary} ${c.problem} ${c.did.join(" ")} ${c.result} Tools used: ${c.stack.join(", ")}.`,
    });
  }

  for (const r of experience) {
    facts.push({
      id: `role-${r.org.toLowerCase().replace(/[^a-z]+/g, "-")}`,
      title: `${r.role} at ${r.org}`,
      anchor: "experience",
      lead: `${r.role} at ${r.org}, ${r.period}.`,
      text: `${r.points.join(" ")} Based in ${r.place}. Tools used: ${r.tags.join(", ")}.`,
    });
  }

  for (const f of flows) {
    facts.push({
      id: `path-${f.id}`,
      title: f.name,
      anchor: "platform",
      lead: f.about,
      text: `${f.about} ` + f.hops.map((h) => `${h.at} (${h.tag}): ${h.text}`).join(" "),
    });
  }

  facts.push({
    id: "monitoring",
    title: "What I monitor and why",
    anchor: "platform",
    lead: "The signals I alert on, chosen by failure mode:",
    text:
      signals.map((s) => `${s.question} I watch ${s.metrics.join(" and ")}. ${s.why}`).join(" ") +
      ` ${monitoringFacts.join(". ")}.`,
  });

  facts.push({
    id: "cost-review",
    title: "Cost review",
    anchor: "platform",
    lead: "How I cut cloud spend by about 15%:",
    text: costReview.levers
      .map((l) => `${l.title} (${l.area}, ${l.status}): ${l.detail} ${l.guardrail.startsWith("sort_desc") ? "" : l.guardrail}`)
      .join(" "),
  });

  facts.push({
    id: "products",
    title: "Products I work on",
    anchor: "work",
    lead: "The products I run and build:",
    // The organisation without its note, so "final-year project" questions reach the project itself.
    text: productOrder.map((k) => `${products[k].name}, ${products[k].org.split(",")[0]} (${products[k].runs}): ${products[k].what}`).join(" "),
  });

  facts.push({
    id: "slos",
    title: "SLIs, SLOs and error budgets for the IoT platform",
    anchor: "platform",
    lead: "How I monitor the IoT platform the SRE way:",
    text:
      "I measure SLIs from what users feel, set SLOs with an error budget for each, and alert when a budget burns too fast. " +
      sreTerms.map((t) => `${t.term} (${t.name}): ${t.what} ${t.here}`).join(" ") +
      " Proposed SLOs: " +
      slos.map((o) => `${o.name}, ${o.target}% over 30 days, measured as ${o.good} over ${o.valid}. ${o.why}`).join(" ") +
      " Burn-rate alerts: " +
      burnRules.map((r) => `${r.name} above ${r.rate}x over ${r.long} and ${r.short} means ${r.spends}, so it is a ${r.action}.`).join(" ") +
      " Error budget policy: " +
      budgetPolicy.map((p) => `${p.when}: ${p.then}`).join(" "),
  });

  facts.push({
    id: "investigation",
    title: "How I investigate an incident",
    anchor: "platform",
    lead: "Seven Grafana pages, each starting from a question:",
    text:
      investigation.pages.map((p) => `${p.page}: ${p.start} Narrow using ${p.narrow}.`).join(" ") +
      " Rules I monitor by: " +
      investigation.rules.join(" ") +
      " Runbook for late telemetry: " +
      investigation.runbook.join(" "),
  });

  facts.push({
    id: "ai-stack",
    title: "The AI infrastructure stack I run",
    anchor: "ai",
    lead: "The AI agent platform, layer by layer:",
    text: stack.map((l) => `${l.name} (${l.tools.join(", ")}): ${l.does}${l.mine ? ` My part: ${l.mine}` : ""}`).join(" "),
  });

  facts.push({
    id: "ai-products",
    title: "The AI agent platform I run",
    anchor: "ai",
    text: aiOverview,
  });

  // The lead already opens the answer, so the text is the steps alone (a repeated lead would be
  // quoted twice when it is more than one sentence).
  for (const j of journeys) {
    facts.push({
      id: `ai-${j.id}`,
      title: j.name,
      anchor: "ai",
      lead: j.about,
      text: j.steps.map((st) => `${st.title}: ${st.text}${st.mine ? ` ${st.mine}` : ""}`).join(" "),
    });
  }

  facts.push({
    id: "llm-measures",
    title: "How I benchmark and watch an LLM service",
    anchor: "ai",
    lead: "What I measure on an LLM service, and why:",
    text: measures.map((m) => `${m.question} I measure ${m.metrics.join(", ")}. ${m.why}`).join(" "),
  });

  facts.push({
    id: "fyp",
    title: fyp.title,
    anchor: "research",
    text:
      `My final-year project at NTU HyScale Lab benchmarks long-horizon LLM agent workloads. I contributed a Go benchmark adapter to ARIES, ` +
      `the lab's open-source agent-serving framework, so Toolathlon tasks (109 tasks, 34 MCP servers) run with live applications in isolated containers. ` +
      `Findings: ${fyp.findings.map((f) => `${f.value} ${f.label}`).join("; ")}. ` +
      `Running 4 tasks at once gave ${fyp.concurrency[2].attempts} attempts per hour against ${fyp.concurrency[0].attempts} at 1, a 3.02x throughput, ` +
      `using ${fyp.concurrency[2].memGiB} GiB of memory. Self-hosted Qwen3-4B was served with SGLang on an NVIDIA A100 at NSCC, reached from the Google Cloud benchmark VM over an SSH tunnel through IAP. ` +
      `I also found and fixed a Docker exec race condition in ARIES that dropped runs under load.`,
  });

  facts.push({
    id: "pvchat",
    title: publication.title,
    anchor: "research",
    text: `${publication.role} of ${publication.title}, published at ${publication.venue}. ${publication.summary}`,
  });

  facts.push({
    id: "education",
    title: "Education",
    anchor: "experience",
    text: `${education.degree} at ${education.school}, ${education.period}. Exchange semesters at ${education.exchanges.join(" and ")}.`,
  });

  facts.push({
    id: "skills",
    title: "Skills",
    anchor: "experience",
    text:
      "Cloud: Google Cloud (GKE, Cloud Run, Cloud Build, Cloud SQL, IAM), AWS (EKS, EC2), Kubernetes, Docker, Terraform, Pulumi, Linux. " +
      "CI/CD: GitHub Actions, Jenkins, Cloud Build. Observability: Prometheus, Grafana, PromQL, Cloud Monitoring, alerting, load testing. " +
      "AI infrastructure: LLM serving with SGLang, LLM benchmarking, A100 GPUs, Vertex AI, RAG, MCP, PyTorch. " +
      "Data: Kafka, ZooKeeper, PostgreSQL, Redis, MQTT. Languages: Python, Java, Bash, Go, C and C++. " +
      "Industrial: BMS, SCADA, BACnet, OPC, PLCs.",
  });

  facts.push({
    id: "site",
    title: "How this site is built",
    anchor: "status",
    text:
      "This site is a Next.js static export served by a small Go server on Cloud Run, which also runs the API behind the Ask console, " +
      "the contact form and the live status panel. It exposes Prometheus metrics; GitHub Actions builds and deploys it, and its infrastructure is in Terraform. " +
      "Its own SLO is 99.9% availability over 30 days, measured from outside: Google Cloud uptime checks request /api/health every minute " +
      "from Singapore, Belgium and Oregon, and the status section shows the real availability and error budget left.",
  });

  facts.push({
    id: "postmortems",
    title: "Postmortems from this site",
    anchor: "postmortems",
    lead: "What went wrong while I built and ran this site, written up as blameless postmortems (incident reviews).",
    text:
      postmortems.map((p) => `${p.title}: ${p.summary} The lesson: ${p.lesson}`).join(" ") +
      " Each one has a timeline, the root cause, how it was detected and action items linked to the commits that fixed it.",
  });

  facts.push({
    id: "writing",
    title: "Writing",
    anchor: "writing",
    lead: "Things I have written up at length:",
    // Titles only: the summaries' numbers already belong to other facts and would compete with them.
    text: posts.map((p) => `"${p.title}".`).join(" ") + " Both are in the Writing section, with the measurements behind them.",
  });

  return facts;
}
