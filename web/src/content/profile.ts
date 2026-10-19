import type { ProductKey } from "@/content/products";

// Single source of truth for everything the site says about ZhenXi.
// Every number here traces to the CV, the Primustech PR history or the FYP results (docs/15).

export const profile = {
  name: "Li ZhenXi",
  role: "SRE, Cloud and AI Infrastructure",
  location: "Singapore",
  email: "zli057@e.ntu.edu.sg",
  github: "https://github.com/zhenxi0901",
  linkedin: "https://www.linkedin.com/in/zhenxi-li-lzx391/",
  availability: "Open to 2027 roles",
  intro:
    "I run cloud platforms in production and benchmark AI infrastructure. DevOps intern at Primustech, Computer Science at NTU.",
} as const;

export type Stat = { value: number; decimals?: number; prefix?: string; suffix?: string; label: string };

export const stats: Stat[] = [
  { value: 15, prefix: "~", suffix: "%", label: "cloud spend cut across monitoring, database and compute" },
  { value: 63, label: "pull requests merged into a production delivery pipeline" },
  { value: 320, label: "long-horizon LLM agent runs benchmarked for my final-year project" },
  { value: 3.02, decimals: 2, suffix: "x", label: "throughput from running four isolated agent tasks at once" },
];

export type CaseStudy = {
  id: string;
  /** Which product the work was for (see products.ts). */
  products: ProductKey[];
  org: string;
  year: string;
  title: string;
  summary: string;
  problem: string;
  did: string[];
  result: string;
  stack: string[];
  /** Headline numbers for the case's own page. Each restates a figure from the text above. */
  numbers: { value: string; label: string }[];
  /** Where the site goes further into this work. */
  deeper: { label: string; href: string }[];
};

export const cases: CaseStudy[] = [
  {
    id: "gke",
    products: ["iot"],
    org: "Primustech",
    year: "2026",
    title: "One VM to a GKE platform",
    summary: "Moved a live building-operations platform off a single Docker Compose VM and onto Kubernetes.",
    problem:
      "The IoT platform behind the company's facility-management product ran on one Docker Compose VM: one failure domain, hand-run deploys and no autoscaling.",
    did: [
      "Split it into GKE microservices: a three-broker Kafka cluster, Cloud SQL PostgreSQL, EMQX MQTT and Redis.",
      "Provisioned everything with Terraform, behind Cloud Armor WAF and Google-managed TLS, with pod and node autoscaling.",
      "Migrated the production database, cut the public domain over, then turned on deletion protection and passed a restore drill.",
    ],
    result: "The platform now runs on autoscaling GKE with a WAF in front, and every change goes through code review.",
    stack: ["GKE", "Terraform", "Kafka", "Cloud SQL", "EMQX", "Redis", "Cloud Armor"],
    numbers: [
      { value: "1 VM", label: "before: one Docker Compose host, one failure domain" },
      { value: "3", label: "Kafka brokers, beside Cloud SQL, EMQX and Redis" },
      { value: "1", label: "restore drill passed before deletion protection went on" },
    ],
    deeper: [
      { label: "How traffic, telemetry and commands move through the platform", href: "/#platform-paths" },
      { label: "What I alert on there, and the SLOs", href: "/#platform-signals" },
    ],
  },
  {
    id: "pipeline",
    products: ["iot"],
    org: "Primustech",
    year: "2026",
    title: "A pipeline where failed merges never deploy",
    summary: "I own the Cloud Build delivery pipeline: build once, promote by digest, approve before release.",
    problem:
      "Builds and deploys were coupled, so what reached production was not always the image that had been tested, and infrastructure drifted from Terraform.",
    did: [
      "Split build from deploy so a release promotes the exact image digest that passed its checks.",
      "Added pull-request, post-merge and Terraform drift gates, a CRITICAL-CVE image gate and weekly base-image rebuilds.",
      "Made releases and Terraform applies approval-gated and serialised per component, then moved the repository from Bitbucket to GitHub with full history.",
    ],
    result: "63 merged pull requests so far. A red merge never reaches production.",
    stack: ["Cloud Build", "Artifact Registry", "Artifact Analysis", "GitHub", "Terraform"],
    numbers: [
      { value: "63", label: "pull requests merged into the pipeline so far" },
      { value: "1", label: "image digest per release: built once, then promoted" },
      { value: "0", label: "red merges that reached production" },
    ],
    deeper: [
      { label: "The same habit on this site: the smoke test that gates every deploy, and its postmortem", href: "/postmortems/smoke-test" },
    ],
  },
  {
    id: "reaper",
    products: ["iot"],
    org: "Primustech",
    year: "2026",
    title: "Cutting cloud spend by ~15%",
    summary: "Measured first, then cut monitoring, database and compute, with every trade-off written down.",
    problem:
      "Nobody had measured where the money went. Managed Prometheus alone was about US$106 a month, the third-largest line item, and climbing with no matching growth in traffic.",
    did: [
      "Traced the metric bill to 914 orphaned Kafka topics, 86% of all topics, and shipped a scheduled reaper. Samples per scrape from Kafka fell from 10,386 to 2,891.",
      "Dropped three metric packages that no alert or dashboard used, a 40% cut in samples per scrape, and kept cAdvisor because three memory alerts depend on it.",
      "Right-sized Cloud SQL from 4 vCPU/16 GiB to 2 vCPU/12 GiB and moved it from regional HA to zonal, with the recovery trade-off documented.",
      "Cut Core API pod requests from 1 CPU/4 GiB to 0.5 CPU/3 GiB so pods pack onto fewer nodes, and retired a replaced ingestion lane end to end.",
    ],
    result: "Cut cloud spend by about 15%, without dropping a single alert.",
    stack: ["Managed Prometheus", "Kafka", "Kubernetes CronJob", "Cloud SQL", "GKE autoscaling", "Terraform"],
    numbers: [
      { value: "~15%", label: "cloud spend cut, with no alert dropped" },
      { value: "914", label: "orphaned Kafka topics reaped, 86% of all topics" },
      { value: "10,386 → 2,891", label: "samples per scrape from the Kafka exporter" },
    ],
    deeper: [{ label: "The full cost review, one move at a time", href: "/#platform-cost" }],
  },
  {
    id: "observability",
    products: ["iot"],
    org: "Primustech",
    year: "2026",
    title: "Alerts that mean something",
    summary: "Dashboards and alerts built around how this system actually fails.",
    problem: "The cluster could lose ZooKeeper quorum, stall consumers or silently drop telemetry without anyone being told.",
    did: [
      "Versioned Grafana SRE dashboards and Cloud Monitoring alerts for ZooKeeper quorum loss, stalled consumers and crash loops.",
      "Chose signals by failure mode: absence alerts for ingestion, silent-loss detection, consumer lag checked against throughput, HPA headroom, and Kafka memory on RSS rather than working set.",
      "Fixed a ZooKeeper leader-election livelock that appeared after a node was replaced, and kept every alert and dashboard in Terraform with zero drift.",
    ],
    result: "Failures that used to be silent now page someone, and the metrics bill went down, not up.",
    stack: ["Grafana", "Prometheus", "PromQL", "Cloud Monitoring", "ZooKeeper"],
    numbers: [
      { value: "28", label: "alert policies, all in Terraform" },
      { value: "40", label: "tiles on the platform dashboard" },
      { value: "0", label: "drift between Terraform and what is live" },
    ],
    deeper: [
      { label: "SLOs, error budgets and burn-rate alerts, on a Grafana-style board", href: "/#platform-signals" },
      { label: "Postmortems I wrote for this site", href: "/#postmortems" },
    ],
  },
  {
    id: "ai-platform",
    products: ["ai"],
    org: "Primustech",
    year: "2026",
    title: "Running an agentic AI platform",
    summary: "Infrastructure for the company's two AI products: an operations agent that answers from live building data, and a document assistant.",
    problem: "The agent and RAG services needed repeatable deploys, locked-down secrets and numbers on speed and cost.",
    did: [
      "Deployed and operated the multi-agent API and the RAG services on Cloud Run with models on Vertex AI.",
      "Set up per-environment Cloud Build CI/CD, IAM service accounts, Secret Manager and shared-VPC networking for dev, staging and production.",
      "Benchmarked the stack: load and latency tests of the agent API, per-request token cost tracking, and model comparisons on latency and cost.",
    ],
    result: "Three environments deployed the same way, with building telemetry from the IoT platform feeding the agents.",
    stack: ["Cloud Run", "Vertex AI", "Cloud Build", "Secret Manager", "IAM", "VPC"],
    numbers: [
      { value: "2", label: "AI products: an operations agent and a document assistant" },
      { value: "3", label: "environments deployed the same way: dev, staging and production" },
      { value: "2,014", label: "BMS devices in the demo building I built for the agents to query" },
    ],
    deeper: [
      { label: "Follow a request through the platform", href: "/#ai-map" },
      { label: "The AI infra stack, layer by layer", href: "/#ai-stack" },
      { label: "Inside one traced request", href: "/#ai-trace" },
    ],
  },
];

export type Role = {
  org: string;
  role: string;
  period: string;
  place: string;
  points: string[];
  tags: string[];
};

export const experience: Role[] = [
  {
    org: "Primustech",
    role: "DevOps Engineer Intern",
    period: "May 2026 - now",
    place: "Singapore",
    points: [
      "Own the Cloud Build CI/CD pipeline for an IoT platform on GKE: 63 merged PRs.",
      "Migrated the platform from one VM to GKE microservices with Terraform.",
      "Deployed, operated and benchmarked the company's LLM services on Cloud Run.",
    ],
    tags: ["GKE", "Terraform", "Cloud Build", "Cloud Run", "Grafana"],
  },
  {
    org: "NTU HyScale Lab",
    role: "Final-year research",
    period: "Aug 2026 - now",
    place: "Singapore",
    points: [
      "Contributed a Go benchmark adapter to ARIES, the lab's open-source agent-serving framework.",
      "Benchmarked 320 LLM agent runs on a hosted API and self-hosted SGLang on an A100.",
      "Found and fixed a Docker race that dropped runs under load.",
    ],
    tags: ["Go", "Docker", "SGLang", "MCP", "NSCC HPC"],
  },
  {
    org: "ENGIE South East Asia",
    role: "Control Systems Intern",
    period: "May 2025 - Jan 2026",
    place: "Singapore",
    points: [
      "Configured BMS-room networks and firewalls for multi-building projects across sites.",
      "Mapped and validated 800+ BACnet/OPC points from DDCs and PLCs into SCADA.",
      "Programmed Siemens S7-1200 PLC logic and linked site data to central monitoring.",
    ],
    tags: ["SCADA", "BACnet", "OPC", "PLC", "Networking"],
  },
  {
    org: "Shanghai Jiao Tong University",
    role: "Research Intern",
    period: "May 2024 - Aug 2024",
    place: "Shanghai",
    points: ["Cut NeRF rendering time by 40% and raised image fidelity by 30% with CUDA and PyTorch."],
    tags: ["CUDA", "PyTorch", "NeRF"],
  },
];

export const education = {
  school: "Nanyang Technological University",
  degree: "Bachelor of Computer Science",
  period: "Jul 2023 - Jun 2027",
  exchanges: ["Tsinghua University", "Luleå University of Technology"],
};

// FYP results, docs/15 section 17.3 (three blocks of 45 occurrences) and section 16.
// Speed-ups are the report's: each block against its own level 1, then averaged, which is
// why they differ slightly from dividing the mean rates.
export const fyp = {
  title: "Benchmarking long-horizon LLM agents",
  aries: "https://github.com/hyscale-lab/ARIES",
  concurrency: [
    { level: 1, attempts: 13.7, lo: 13.5, hi: 14.1, successes: 10.7, speedup: 1.0, passSpeedup: 1.0, cpu: 15, memGiB: 2.6 },
    { level: 2, attempts: 23.8, lo: 22.4, hi: 25.1, successes: 17.3, speedup: 1.73, passSpeedup: 1.62, cpu: 26, memGiB: 3.9 },
    { level: 4, attempts: 41.5, lo: 36.3, hi: 45.7, successes: 29.0, speedup: 3.02, passSpeedup: 2.71, cpu: 48, memGiB: 6.4 },
  ],
  wallClock: [
    { key: "prep", label: "Environment setup", share: 23 },
    { key: "agent", label: "Agent working", share: 72 },
    { key: "grade", label: "Grading", share: 4 },
  ],
  findings: [
    { value: "2.7%", label: "of agent time is spent inside tool calls" },
    { value: "23%", label: "of wall clock goes to setup, vs 2% for single-service tasks" },
    { value: "96%", label: "of input tokens served from the prefix cache" },
    { value: "~7x", label: "more A100 time held by serving jobs than the agents used" },
  ],
};

export const publication = {
  title: "PVChat: Personalized Video Chat with One-Shot Learning",
  venue: "ICCV 2025",
  role: "Co-author",
  code: "https://github.com/DavidYan2001/PVChat",
  summary:
    "The first video LLM that learns a person from a single reference video, so it can answer identity-aware questions about them.",
};

// "Inside the platform": the GKE platform at Primustech, from its architecture, monitoring and
// resource-review docs. Public page: no customer names, IPs, project IDs or hostnames.
export type Hop = { at: string; tag: string; text: string };
export type Flow = { id: string; name: string; about: string; hops: Hop[] };

export const flows: Flow[] = [
  {
    id: "user",
    about: "How internet traffic reaches the cluster: load balancer, WAF, ingress, Services, pods and the database.",
    name: "Someone opens the dashboard",
    hops: [
      { at: "Browser", tag: "HTTPS 443", text: "One public hostname. Any other host, or the raw IP, gets a 404 by design." },
      { at: "Global HTTPS load balancer", tag: "anycast IP", text: "TLS ends here on a reserved global IP with a Google-managed certificate." },
      { at: "Cloud Armor", tag: "WAF", text: "OWASP CRS rules plus a login throttle. Routes that legitimately carry rich bodies skip body inspection but stay behind auth and rate limits." },
      { at: "GKE Ingress", tag: "L7 paths", text: "Path routing sends the device API, the REST and WebSocket API, and the web UI to separate Services." },
      { at: "Service to pods", tag: "ClusterIP", text: "Core API pods are spread across three zones and across nodes, so losing a zone costs a third of capacity, not all of it." },
      { at: "Core API to Cloud SQL", tag: "private IP", text: "A Cloud SQL Auth Proxy sidecar connects over private service access using Workload Identity: no key files, no password on the wire." },
    ],
  },
  {
    id: "gateway",
    about: "How device telemetry reaches the cluster over MQTT and lands in the database exactly once.",
    name: "A site gateway sends telemetry",
    hops: [
      { at: "Site gateway", tag: "MQTT/TLS 8883", text: "Dials out to a public TCP load balancer. Site IPs change, so identity is the boundary: TLS, one credential per gateway, a topic ACL per site, default deny." },
      { at: "MQTT broker", tag: "own node pool", text: "EMQX runs on a tainted node pool of its own, so ingestion and the application cannot starve each other." },
      { at: "Bridge", tag: "QoS 1", text: "Holds a durable subscription and acknowledges a message only after the write succeeds, so a crash replays instead of losing data." },
      { at: "Device API", tag: "Service DNS", text: "In-cluster calls go by Service name; no internal load balancer is needed." },
      { at: "Kafka", tag: "RF 3", text: "Three brokers with replication factor 3. Rule-engine pods split the partitions, coordinated through ZooKeeper, so each message is processed once." },
      { at: "Cloud SQL", tag: "idempotent", text: "Time series are keyed by entity, key and timestamp, so a redelivered message overwrites instead of duplicating." },
    ],
  },
  {
    id: "partner",
    about: "How private cluster nodes reach a broker outside the network through Cloud NAT.",
    name: "Pulling from a partner's broker",
    hops: [
      { at: "Private nodes", tag: "no public IP", text: "Cluster nodes have no external addresses at all." },
      { at: "Cloud NAT", tag: "egress", text: "Outbound connections leave through Cloud NAT on one fixed address the partner can allowlist." },
      { at: "Partner broker", tag: "MQTT/TLS 8883", text: "Exactly one bridge replica on purpose: it uses a fixed client ID, and two replicas would fight over the session." },
      { at: "Same write path", tag: "device API", text: "From here it joins the device API, Kafka and Cloud SQL path above." },
    ],
  },
  {
    id: "command",
    about: "How a start or stop command reaches HVAC equipment safely.",
    name: "A command goes to HVAC plant",
    hops: [
      { at: "Operator action", tag: "server RPC", text: "Starting or stopping plant becomes a server-side RPC inside the platform." },
      { at: "Device MQTT transport", tag: "ClusterIP only", text: "Never exposed outside the cluster. It can push the RPC because the control bridge holds a persistent MQTT session; request-response HTTP structurally cannot push." },
      { at: "Control bridge", tag: "Gateway API", text: "Resolves the target through a curated point map instead of guessing names, then validates, rate-limits and logs, behind a dry-run switch and a kill switch." },
      { at: "Control broker", tag: "internal only", text: "A dedicated broker with no external load balancer, kept separate from telemetry brokers for fault isolation." },
    ],
  },
  {
    id: "tunnels",
    about: "How engineers and devices reach private networks through tunnels: IAP, a WireGuard overlay and reverse SSH.",
    name: "Tunnels into private places",
    hops: [
      { at: "Engineer to a private VM", tag: "IAP TCP", text: "No public SSH port. The firewall admits only Google's IAP range to tagged VMs, and every connection is checked against IAM." },
      { at: "Cloud VM to an on-site controller", tag: "WireGuard", text: "A NetBird overlay: both ends dial out and nothing opens inbound. Explicit access groups replace the default all-to-all rule." },
      { at: "The catch", tag: "isolation", text: "That VM sits in its own subnet with egress to the cluster denied, but WireGuard is encapsulated UDP, so the VPC firewall cannot see inner traffic. The overlay's policy carries half the containment." },
      { at: "GPU to benchmark VM", tag: "reverse SSH", text: "For my FYP, SGLang on an NSCC A100 reached a GCP VM through a reconnecting SSH tunnel and a reverse forward over IAP, exposed locally with socat." },
    ],
  },
];

/**
 * A toy model of one alert, for the "what I monitor" playground. Each tick is one simulated minute.
 * The line moves towards `normal` or, once broken, `broken`; the alert fires after the condition
 * holds for `forTicks`. `noise` is relative to the level, so a zero level stays exactly zero.
 * `context` is a second line drawn for comparison, never alerted on.
 */
export type SignalSim = {
  metric: string;
  normal: number;
  broken: number;
  noise: number;
  max: number;
  threshold: number;
  above: boolean;
  thresholdLabel: string;
  forTicks: number;
  action: string;
  outcome: string;
  context?: { metric: string; normal: number; broken: number; max: number };
};

export type Signal = { question: string; metrics: string[]; why: string; sim: SignalSim };

export const signals: Signal[] = [
  {
    question: "Is data still arriving?",
    metrics: ["rate(bridge_writes) ~ 0 for 10 min", "missing data counts as breaching"],
    why: "A dead bridge emits nothing at all, so silence itself has to page.",
    sim: { metric: "bridge writes per second", normal: 120, broken: 0, noise: 0.08, max: 160, threshold: 1, above: false, thresholdLabel: "≈ 0 for 10 min", forTicks: 10, action: "Kill the bridge", outcome: "Paged after ten silent minutes. Nothing errored: the line just stopped, which is why missing data counts as breaching." },
  },
  {
    question: "Is anything being lost silently?",
    metrics: ["rate(bridge_zero_device_parses) > 0"],
    why: "Failed writes are never acknowledged, so the broker replays them. A message that parses to nothing is acknowledged, so nothing will ever replay it. That one pages.",
    sim: { metric: "messages that parse to zero devices, per second", normal: 0, broken: 0.6, noise: 0.35, max: 1.2, threshold: 0, above: true, thresholdLabel: "> 0", forTicks: 1, action: "Send a payload that parses to nothing", outcome: "Paged at once. The broker saw the message acknowledged, so nothing would ever have replayed it." },
  },
  {
    question: "Is the broker healthy?",
    metrics: ["emqx_messages_dropped > 0", "emqx_durable_subscriptions_count < 1", "up == 0, grouped by job"],
    why: "Grouping by job means a new broker inherits every alert without anyone editing them.",
    sim: { metric: "broker messages dropped per second", normal: 0, broken: 40, noise: 0.3, max: 60, threshold: 0, above: true, thresholdLabel: "> 0", forTicks: 2, action: "Overload the broker", outcome: "Paged: the broker is dropping messages. The rule is grouped by job, so a new broker gets it without anyone editing it." },
  },
  {
    question: "Is the queue keeping up?",
    metrics: ['sum by (topic) (kafka_consumergroup_lag{topic!~".*notifications.*"})', "under-replicated partitions > 0"],
    why: "Lag with matching throughput is in-flight depth, not a backlog. Check throughput before scaling anything.",
    sim: { metric: "consumer lag, messages", normal: 400, broken: 9000, noise: 0.15, max: 10000, threshold: 5000, above: true, thresholdLabel: "backlog", forTicks: 4, action: "Stall the consumers", outcome: "Paged: lag climbing while throughput fell to zero is a real backlog. The same lag with matching throughput would only be messages in flight.", context: { metric: "throughput, messages per second", normal: 900, broken: 0, max: 1200 } },
  },
  {
    question: "Are we near a ceiling?",
    metrics: ["HPA headroom = max - current replicas", "pods Pending > 15 min", "memory working set / request"],
    why: "ScalingLimited also fires at the floor, and the HPA scales on CPU only, so headroom and memory need their own signals.",
    sim: { metric: "HPA headroom, replicas left", normal: 4, broken: 0, noise: 0, max: 6, threshold: 1, above: false, thresholdLabel: "no headroom", forTicks: 3, action: "Send a traffic spike", outcome: "Fired: the HPA is at its maximum and pods are Pending. The cluster autoscaler adds nodes; this tells a person it is happening.", context: { metric: "pods Pending", normal: 0, broken: 2, max: 6 } },
  },
  {
    question: "Is memory pressure real?",
    metrics: ['container_memory_rss{container="kafka"}'],
    why: "Working set includes page cache, which Kafka fills by design. The old alert fired on healthy brokers: 84% working set, 58% actually used, no restarts in 27 days.",
    sim: { metric: "Kafka RSS, % of limit (alerted)", normal: 58, broken: 60, noise: 0.03, max: 100, threshold: 90, above: true, thresholdLabel: "RSS near the limit", forTicks: 3, action: "Replay a large topic", outcome: "Quiet, correctly. Working set rose to 84% because Kafka fills the page cache by design; the old alert watched that line and would have paged. RSS stayed near 58%.", context: { metric: "working set, % of limit (old alert)", normal: 70, broken: 84, max: 100 } },
  },
  {
    question: "Is the database the wall?",
    metrics: ["Cloud SQL CPU > 80%", "connections > 80% of max", "disk > 80%", "deadlocks > 0"],
    why: "The database is the one tier that cannot scale out, so it is watched closest to its limits.",
    sim: { metric: "Cloud SQL CPU, %", normal: 35, broken: 93, noise: 0.06, max: 100, threshold: 80, above: true, thresholdLabel: "> 80%", forTicks: 2, action: "Run a heavy report", outcome: "Paged at 80%. The database is the one tier that cannot scale out, so it is watched closest to its limit." },
  },
  {
    question: "Can users actually reach it?",
    metrics: ["uptime check failing from 2+ regions", "rate(http 5xx) on the device API"],
    why: "Pods can be Ready while users get errors, so the check runs from outside the cluster.",
    sim: { metric: "regions failing the uptime check", normal: 0, broken: 4, noise: 0, max: 6, threshold: 1.5, above: true, thresholdLabel: "2+ regions", forTicks: 2, action: "Break the ingress", outcome: "Paged from outside. Every pod stayed Ready the whole time, so only a check from outside the cluster could see users failing.", context: { metric: "pods Ready", normal: 3, broken: 3, max: 6 } },
  },
];

export const monitoringFacts = [
  "28 alert policies and a 40-tile dashboard, all in Terraform with zero drift",
  "Grafana SRE pages: overview, ingestion, dependencies, capacity, changes, observability, SLO",
  "Managed Prometheus via PodMonitoring, plus log-based metrics where there is nothing to scrape",
];

/** How the cost review draws one lever. Every number is from the review; nothing is modelled. */
export type CostVisual =
  | { kind: "share"; total: number; part: number; partLabel: string; restLabel: string; unit: string }
  | { kind: "reap"; total: number; removed: number; unit: string }
  | { kind: "bars"; rows: { label: string; before: number; after: number }[] }
  | { kind: "removed"; items: string[] }
  | { kind: "planned"; items: string[] };

export type Lever = {
  area: string;
  title: string;
  detail: string;
  guardrail: string;
  status: "done" | "in review";
  headline: string;
  headlineNote: string;
  visual: CostVisual;
};

export const costReview = {
  levers: [
    {
      area: "Visibility",
      title: "Measure before cutting",
      headline: "US$106/mo",
      headlineNote: "Managed Prometheus: the third-largest line item, and never measured",
      visual: { kind: "share", total: 43580, part: 10386, partLabel: "Kafka exporter", restLabel: "everything else", unit: "samples per scrape" },
      detail: "Managed Prometheus was about US$106 a month, the third-largest line item, and had never been measured. I attributed it per exporter before touching anything.",
      guardrail: "sort_desc(sum by (job) (scrape_samples_scraped))",
      status: "done",
    },
    {
      area: "Monitoring",
      title: "Reap orphaned Kafka topics",
      headline: "914",
      headlineNote: "of 1,066 Kafka topics belonged to pods that no longer existed. Exporter samples fell from 10,386 to 2,891 per scrape",
      visual: { kind: "reap", total: 1066, removed: 914, unit: "topics" },
      detail: "914 of 1,066 topics named pods that no longer existed, each emitting 7 metric families. A scheduled reaper keeps it clean; broker memory fell from 2.4 to 1.8 GiB too.",
      guardrail: "Topics regrew to 191 in five days, which is why it is a CronJob, not a one-off.",
      status: "done",
    },
    {
      area: "Monitoring",
      title: "Drop metrics nobody reads",
      headline: "-40%",
      headlineNote: "samples per scrape, after turning off three unused metric packages",
      visual: { kind: "bars", rows: [{ label: "All samples per scrape", before: 43580, after: 26150 }] },
      detail: "Turned off three GKE metric packages after confirming 0 of 27 alerts and 0 of 40 dashboard tiles used them: a 40% cut in samples per scrape.",
      guardrail: "Kept cAdvisor, the biggest remaining source, because three memory alerts depend on it.",
      status: "done",
    },
    {
      area: "Database",
      title: "Right-size Cloud SQL",
      headline: "-50%",
      headlineNote: "database vCPUs, sized from measured use, and regional to zonal",
      visual: { kind: "bars", rows: [{ label: "vCPU", before: 4, after: 2 }, { label: "Memory, GiB", before: 16, after: 12 }] },
      detail: "4 vCPU/16 GiB down to 2 vCPU/12 GiB from measured utilization, and regional HA moved to zonal.",
      guardrail: "Trade-off on record: no automatic failover, so recovery is 7 backups plus 7-day point-in-time recovery, and reverting is one line of Terraform.",
      status: "done",
    },
    {
      area: "Compute",
      title: "Size pods to need, scale nodes to load",
      headline: "-50%",
      headlineNote: "CPU requested per core API pod, so pods pack tighter",
      visual: { kind: "bars", rows: [{ label: "CPU request, cores", before: 1, after: 0.5 }, { label: "Memory request, GiB", before: 4, after: 3 }] },
      detail: "Core API requests cut from 1 CPU/4 GiB to 0.5 CPU/3 GiB so pods pack tighter. The HPA and cluster autoscaler keep 3 nodes at the floor and add up to 9 only under load.",
      guardrail: "Consolidate nodes only on seven days of working set against requests. CPU alone is not evidence.",
      status: "done",
    },
    {
      area: "Decommission",
      title: "Retire a replaced lane end to end",
      headline: "6",
      headlineNote: "resources removed once the new ingestion lane carried production",
      visual: { kind: "removed", items: ["Pub/Sub topic", "Cloud Run importer", "Firestore database", "Storage bucket", "Internal load balancer", "Internal load balancer"] },
      detail: "After ingestion moved in-cluster, removed the old Pub/Sub topic, Cloud Run importer, Firestore database, bucket and two internal load balancers.",
      guardrail: "Removed only after the new lane carried production traffic.",
      status: "done",
    },
    {
      area: "Next",
      title: "Unused VPN and a smaller SQL tier",
      headline: "~US$29/mo",
      headlineNote: "more to come, through a reviewed Terraform plan",
      visual: { kind: "planned", items: ["Classic VPN gateway: five resources, zero tunnels", "Cloud SQL: one memory step down"] },
      detail: "An unused Classic VPN gateway (five resources, zero tunnels) and a Cloud SQL memory step down, worth about US$29 a month.",
      guardrail: "Each goes through a reviewed, saved Terraform plan before it is applied.",
      status: "in review",
    },
  ] satisfies Lever[],
};

// Simple Icons slugs for the tool marquee. Logos only, names live in aria-labels.
export const toolSlugs = [
  "googlecloud",
  "kubernetes",
  "docker",
  "terraform",
  "prometheus",
  "grafana",
  "apachekafka",
  "postgresql",
  "redis",
  "go",
  "python",
  "githubactions",
  "jenkins",
  "nvidia",
  "pytorch",
  "linux",
  "pulumi",
  "nextdotjs",
];
