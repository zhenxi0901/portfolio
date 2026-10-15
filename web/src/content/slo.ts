// "What I monitor" for the building IoT platform, framed the SRE way: SLIs measured from user
// outcomes, objectives with error budgets, burn-rate alerts on the budget, and cause alerts beneath.
// The platform's SLO page is still a design gate (objectives not yet agreed), so the targets here are
// labelled proposed and the dashboard shows sample data. The investigation route, rules and runbook
// are from the platform's Grafana SRE doc, without internal names.

export const sreTerms = [
  {
    term: "SLI",
    name: "Service level indicator",
    what: "A measure of what users experience, written as good events over valid events.",
    here: "The share of outside uptime probes that get an answer.",
  },
  {
    term: "SLO",
    name: "Service level objective",
    what: "The target for an SLI over a window. Whatever it leaves over is the error budget, to spend on change.",
    here: "99.9% over 30 days: about 43 minutes of budget a month.",
  },
  {
    term: "SLA",
    name: "Service level agreement",
    what: "The promise made to customers, with consequences if it is broken. It is set by the business.",
    here: "SLOs sit tighter than any SLA, so the team acts before a promise is at risk.",
  },
];

export type Slo = {
  id: string;
  name: string;
  sli: string;
  good: string;
  valid: string;
  target: number;
  /** Sample 30-day SLI, for the dashboard. */
  sample: number;
  why: string;
};

export const slos: Slo[] = [
  {
    id: "availability",
    name: "Reachable from outside",
    sli: "uptime probes answered, from every region",
    good: "probes answered without an error",
    valid: "all probes",
    target: 99.9,
    sample: 99.96,
    why: "Pods can be Ready while users get errors, so this SLI is measured from outside the cluster.",
  },
  {
    id: "kept",
    name: "Telemetry kept",
    sli: "messages received that end up persisted",
    good: "messages written to the database",
    valid: "messages the broker received",
    target: 99.9,
    sample: 99.95,
    why: "A message lost silently is worse than an outage: nothing will ever replay it.",
  },
  {
    id: "fresh",
    name: "Telemetry fresh",
    sli: "site-minutes whose newest reading is within two publish cycles",
    good: "site-minutes with a fresh reading",
    valid: "site-minutes a site is expected to publish",
    target: 99.5,
    sample: 99.81,
    why: "Dashboards and alarms are only as good as the newest reading. Freshness catches a stalled lane that error counts miss.",
  },
];

/** Multi-window, multi-burn-rate alerts on a 30-day budget (Google SRE workbook). */
export const burnRules = [
  { name: "Fast burn", long: "1 h", short: "5 min", rate: 14.4, spends: "2% of the budget in an hour", action: "page" },
  { name: "Slow burn", long: "6 h", short: "30 min", rate: 6, spends: "5% of the budget in six hours", action: "page" },
  { name: "Steady leak", long: "3 days", short: "6 h", rate: 1, spends: "10% of the budget in three days", action: "ticket" },
] as const;

export const budgetPolicy = [
  { when: "Budget left", then: "Ship as normal. The budget is there to be spent on change." },
  { when: "Burning fast", then: "Page. Mitigate first (roll back, shift traffic), investigate second." },
  { when: "Budget spent", then: "Risky changes wait, reliability work goes first, and the incident gets a blameless postmortem." },
];

export const investigation = {
  pages: [
    { page: "Overview", start: "Are users or telemetry affected? Can we still scrape?", narrow: "requests, errors and duration, queue trend, node memory" },
    { page: "Ingestion", start: "Which lane stopped advancing?", narrow: "broker receives and drops, then parser, transport, queue, persistence" },
    { page: "Dependencies", start: "A shared dependency, or one service?", narrow: "DB pool waiting, heap and RSS, Kafka, SQL CPU, connections and disk" },
    { page: "Capacity", start: "Resource pressure, or a scheduling constraint?", narrow: "usage against requests, throttling, Pending pods, HPA and node spread" },
    { page: "Changes", start: "What happened just before?", narrow: "GitHub, Cloud Build and image digest evidence" },
    { page: "Observability", start: "Can the signal itself be trusted?", narrow: "datasource auth, scrape failures, data age and gaps, ingestion volume" },
    { page: "SLO", start: "Are the agreed objectives met?", narrow: "objectives first: no invented reliability score" },
  ],
  rules: [
    "No data is unknown, never zero.",
    "A mean latency is not p99.",
    "Pod Ready is not telemetry persisted.",
    "Standing Kafka lag is not automatically a backlog.",
    "A high working set is not necessarily a leak.",
  ],
  runbook: [
    "Confirm the time range, and that monitoring itself is fresh. If Grafana and Cloud Monitoring both lack data, check the collector first.",
    "Find whether one lane or a shared dependency is affected: compare the publishers' expected cadence with what the broker received.",
    "Check parser outcomes apart from write errors: messages that parse to nothing lose data while every pod stays Ready.",
    "Check Kafka consumer groups, consumer errors and database waits, and line them up with recent deploys. A correlation is a hypothesis, not a cause.",
    "Record the incident: impact, evidence, hypothesis, mitigation or rollback, and recovery confirmed over several publish cycles.",
  ],
  guardrail: "Never replay physical commands, delete broker data or restart workloads just to make a graph look better.",
};
