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
    id: "fyp",
    title: fyp.title,
    anchor: "research",
    text:
      `My final-year project at NTU HyScale Lab benchmarks long-horizon LLM agent workloads. I contributed a Go benchmark adapter to ARIES, ` +
      `the lab's open-source agent-serving framework, so Toolathlon tasks (109 tasks, 34 MCP servers) run with live applications in isolated containers. ` +
      `Findings: ${fyp.findings.map((f) => `${f.value} ${f.label}`).join("; ")}. ` +
      `Running 4 tasks at once gave ${fyp.concurrency[2].attempts} attempts per hour against ${fyp.concurrency[0].attempts} at 1, a 3.02x throughput, ` +
      `using ${fyp.concurrency[2].memGiB} GiB of memory. Self-hosted Qwen3-4B was served with SGLang on an NVIDIA A100 at NSCC. ` +
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
      "the contact form and the live status panel. It exposes Prometheus metrics, is built by GitHub Actions and deployed with Terraform.",
  });

  return facts;
}
