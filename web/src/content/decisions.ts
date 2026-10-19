// Architecture decision records for this site: what was chosen, what it costs, and the evidence in
// the repository. The /decisions page renders them, and scripts/gen-adr.mts writes the same records
// to docs/adr/ as Markdown (CI fails if those files are stale). No imports: the script runs under
// plain Node.

export type Decision = {
  id: number;
  slug: string;
  title: string;
  /** ISO date the decision was made. */
  date: string;
  status: "Accepted" | "Superseded";
  context: string[];
  decision: string[];
  good: string[];
  bad: string[];
  evidence: { label: string; path: string }[];
};

export const REPO_BLOB = "https://github.com/zhenxi0901/portfolio/blob/main/";

export const decisions: Decision[] = [
  {
    id: 1,
    slug: "cloud-run-not-gke",
    title: "Run the site on Cloud Run, not GKE",
    date: "2026-10-01",
    status: "Accepted",
    context: [
      "A personal site gets little traffic, in bursts, and has to cost close to nothing: the project's budget alert is set at S$1 a month.",
      "I run GKE at work, so a cluster would have been the familiar choice. It would also have meant a control plane, node pools and upgrades for one small service.",
    ],
    decision: [
      "Cloud Run, scaling to zero, at most three instances of one CPU and 256 MiB, billed per request (CPU idles between requests).",
    ],
    good: [
      "Near-zero cost, HTTPS and immutable revisions built in, and nothing to patch.",
      "Revisions and traffic tags are what make releasing with no traffic, and rolling back in seconds, cheap (ADR 3).",
    ],
    bad: [
      "Cold starts. The status section says when a visitor woke the server up; the uptime checks keep an instance warm most of the time.",
      "No CPU once the response is written, so work cannot be left running afterwards. The contact form learned this the hard way: see its postmortem.",
      "Memory is per instance, so rate limits and caches are per instance too. At three instances that is an acceptable approximation.",
    ],
    evidence: [
      { label: "infra/main.tf: the service, scaling and limits", path: "infra/main.tf" },
      { label: "api/internal/server/timing.go: telling a visitor they woke it up", path: "api/internal/server/timing.go" },
    ],
  },
  {
    id: 2,
    slug: "one-binary-one-origin",
    title: "One Go binary serves the static site and the API",
    date: "2026-10-01",
    status: "Accepted",
    context: [
      "The front end is a Next.js static export; the API answers questions, takes contact messages and reports status.",
      "Hosting the pages and the API separately means two deploys and cross-origin requests; running Next.js as a server means a Node runtime in the image and CPU on every page view.",
    ],
    decision: [
      "A Go server built on the standard library serves the export and /api/* from one origin and one image: distroless, non-root, about 30 MB.",
      "Pages are compressed with brotli and gzip at build time and served as-is; hashed assets are cached as immutable.",
    ],
    good: [
      "One origin, so the site needs no CORS and the content security policy stays strict.",
      "One image to build, test, attest and release (ADR 3); no compression work per request.",
      "Four direct Go dependencies: Prometheus' client and three OpenTelemetry modules.",
    ],
    bad: [
      "No server rendering: changing content means a rebuild, which every push to main does in minutes anyway.",
      "The Ask console's retrieval exists twice, in Go and in TypeScript (the browser's offline fallback). A parity test in CI keeps them giving the same answers.",
    ],
    evidence: [
      { label: "Dockerfile", path: "Dockerfile" },
      { label: "api/internal/server/static.go", path: "api/internal/server/static.go" },
      { label: "web/scripts/gen-parity.mts: the parity fixtures", path: "web/scripts/gen-parity.mts" },
    ],
  },
  {
    id: 3,
    slug: "build-once-check-before-traffic",
    title: "Build once, release that digest, check it before it takes traffic",
    date: "2026-10-19",
    status: "Accepted",
    context: [
      "The first pipeline rebuilt the image at deploy time, so what reached production was not the image CI had tested, and traffic moved to a new revision before anything checked it.",
      "A filter on the branch name alone would also have let a fork's pull request from its own main reach the deploy credentials.",
    ],
    decision: [
      "CI builds the image once, smoke-tests it, holds it to Lighthouse budgets and a critical-CVE gate, and only then pushes it with an SBOM and build-provenance attestation.",
      "The deploy releases that digest without rebuilding: it verifies the attestations, applies the error-budget gate (ADR 7), starts the revision with no traffic, smoke-tests it at its own URL, pins traffic to it and checks again. If that fails, traffic goes back to the previous revision on its own.",
      "Only pushes to main in this repository deploy. A manual rollback drill rehearses the whole path in production.",
    ],
    good: [
      "What was tested is what runs, and the release says so with signed evidence attached.",
      "A failed release either never takes traffic or is rolled back: the first drill had traffic back on the old revision 20 seconds after the switch.",
      "Every release is a GitHub release listing the commits it shipped.",
    ],
    bad: [
      "Traffic is pinned to the revision the pipeline checked, so a Terraform change to the service goes live only with the next release.",
      "gcloud names the revision it tags in the service's template, which Terraform has to clear on its next apply; that costs a revision that takes no traffic.",
    ],
    evidence: [
      { label: ".github/workflows/ci.yml", path: ".github/workflows/ci.yml" },
      { label: ".github/workflows/deploy.yml", path: ".github/workflows/deploy.yml" },
    ],
  },
  {
    id: 4,
    slug: "slo-from-outside",
    title: "Measure the site's SLO from outside",
    date: "2026-10-19",
    status: "Accepted",
    context: [
      "The service scales to zero and Prometheus does not run on Cloud Run, so request metrics only exist while an instance does.",
      "Server-side numbers also miss the front door: the health check that only worked from inside returned 200 to the container and 404 to the world.",
    ],
    decision: [
      "SLI: the share of Cloud Monitoring uptime checks, run every minute from Singapore, Belgium and Oregon, that get a 2xx from /api/health within 10 seconds. SLO: 99.9% over 30 days, a budget of 43.2 minutes.",
      "The API reads the results back from Cloud Monitoring and the status section shows availability, downtime and budget left.",
    ],
    good: [
      "It measures what a visitor gets, through the same front door, from three continents.",
      "About 130,000 checks a month fits in Cloud Monitoring's free allowance.",
    ],
    bad: [
      "One endpoint, sampled once a minute: a failure that lasts seconds, or that only breaks one page, can be missed.",
      "Monitoring stores several samples per probe, so the counts mean something only as a ratio.",
      "The probes keep an instance warm, so cold starts are rarer than real traffic alone would make them.",
    ],
    evidence: [
      { label: "infra/slo.tf", path: "infra/slo.tf" },
      { label: "api/internal/slo/slo.go", path: "api/internal/slo/slo.go" },
    ],
  },
  {
    id: 5,
    slug: "plain-rest-for-google-apis",
    title: "Call Google Cloud with plain REST, not client libraries",
    date: "2026-10-19",
    status: "Accepted",
    context: [
      "The API reads uptime results from Cloud Monitoring and exports OpenTelemetry spans to Cloud Trace. Google's Go client libraries for both bring gRPC and a large dependency tree.",
    ],
    decision: [
      "Take the project ID and an access token from the metadata server and call the REST APIs directly: Monitoring's timeSeries query, and a small span exporter for Cloud Trace's traces:batchWrite.",
    ],
    good: [
      "The dependency tree stays small (ADR 2), and both clients are tested against fake servers, metadata server included.",
      "Each Ask answer can show its own spans, because the spans pass through a recorder the API owns.",
    ],
    bad: [
      "I own the exporter: batching, timeouts and any change in the API are mine to handle.",
      "Only the calls the site needs exist; anything new is another hand-written request.",
    ],
    evidence: [
      { label: "api/internal/gcp: the metadata server client", path: "api/internal/gcp/metadata.go" },
      { label: "api/internal/tracing/cloudtrace.go: the exporter", path: "api/internal/tracing/cloudtrace.go" },
    ],
  },
  {
    id: 6,
    slug: "retrieval-first-ask",
    title: "Answer questions by retrieval first; an LLM is optional",
    date: "2026-10-01",
    status: "Accepted",
    context: [
      "The Ask console answers questions about me on a public site. Wrong answers, prompt injection and an open-ended model bill are all real risks.",
    ],
    decision: [
      "BM25 retrieval over the site's own facts, generated at build time from the same content files as the pages, picks the answer. An OpenAI-compatible model can phrase it, fenced against injected instructions, rate limited and cached.",
      "The browser carries the same retrieval, so the console still answers if the API is down.",
    ],
    good: [
      "Every answer comes from something the site already says, at no model cost by default.",
      "Answers are deterministic, so they can be tested: Go and TypeScript are checked against the same 23 questions in CI.",
    ],
    bad: [
      "Retrieval quotes rather than converses, and a question the facts do not cover gets the closest fact, not a new answer.",
    ],
    evidence: [
      { label: "api/internal/ask/retrieval.go", path: "api/internal/ask/retrieval.go" },
      { label: "web/src/lib/retrieval.ts", path: "web/src/lib/retrieval.ts" },
    ],
  },
  {
    id: 7,
    slug: "error-budget-gates-releases",
    title: "The error budget gates releases, in code",
    date: "2026-10-19",
    status: "Accepted",
    context: [
      "An SLO with no consequence is a dashboard. Error-budget policies usually live in a document that someone has to remember during an incident.",
    ],
    decision: [
      "/api/slo reports whether releases are open or frozen. Once the 30-day budget is spent, the deploy holds every release except a commit marked with a Reliability-fix line, or a manual run that states an override; the reason goes in the run summary.",
      "If the SLO cannot be read, the gate stays open and says so: losing the measurement should not stop a fix.",
    ],
    good: [
      "The policy is enforced and auditable rather than remembered; the page shows its state live.",
    ],
    bad: [
      "With a 43-minute budget, one bad hour freezes feature releases until the window rolls past it, which can take weeks. That is the point, but it is strict for a one-person site.",
      "Failing open means a broken measurement and a spent budget would let a release through.",
    ],
    evidence: [
      { label: "scripts/budget-gate.sh", path: "scripts/budget-gate.sh" },
      { label: "api/internal/slo/slo.go: the releases field", path: "api/internal/slo/slo.go" },
    ],
  },
  {
    id: 8,
    slug: "scheduled-checks-not-alert-policies",
    title: "Page with scheduled checks, not Cloud Monitoring alert policies",
    date: "2026-10-19",
    status: "Accepted",
    context: [
      "The contact-form postmortem left two actions open: alert when a message goes undelivered, and check the path end to end.",
      "Cloud Monitoring alert policies are billed per condition, and the project's budget is S$1 a month.",
    ],
    decision: [
      "A GitHub Actions schedule searches Cloud Run's logs hourly for undelivered messages since the previous search, as a read-only identity, and twice a day sends a message marked by a secret token through the live form and the real webhook, posted silently. A failed check fails the workflow, and GitHub emails me.",
    ],
    good: [
      "Free, versioned with the code, and it tests the real path rather than a proxy for it.",
    ],
    bad: [
      "GitHub starts scheduled runs late when it is busy, sometimes by hours, so the email can lag the failure; each search covers the time since the last, so nothing is missed, only delayed. And email is not a pager.",
      "GitHub turns off schedules in a public repository after 60 days without activity.",
    ],
    evidence: [
      { label: ".github/workflows/synthetic.yml", path: ".github/workflows/synthetic.yml" },
      { label: "infra/watch.tf", path: "infra/watch.tf" },
    ],
  },
  {
    id: 9,
    slug: "no-long-lived-credentials",
    title: "No long-lived credentials anywhere",
    date: "2026-10-01",
    status: "Accepted",
    context: [
      "A public repository's workflows deploy to a real project. A leaked service-account key, or a secret in Terraform state or a log, would be a standing risk.",
    ],
    decision: [
      "GitHub's OIDC token is exchanged through Workload Identity Federation for short-lived credentials, limited to this repository's main branch. Separate identities deploy and read logs, each with only the roles it needs.",
      "Secrets live in Secret Manager. Terraform creates them empty and never sees the values; the project and service accounts are repository secrets so the public logs mask them.",
    ],
    good: ["There is no key to leak or rotate, and every credential expires within the hour."],
    bad: ["Setting a secret is a manual step, on purpose, and the README has to say how."],
    evidence: [
      { label: "infra/github.tf", path: "infra/github.tf" },
      { label: "SECURITY.md", path: "SECURITY.md" },
    ],
  },
];
