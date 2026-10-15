// "The AI products I run": Primustech's operations agent and document assistant, from their
// READMEs, deployment docs and Terraform. Public page: no internal product names, customer names,
// repo names, project IDs, hostnames or configuration values. `mine` marks the parts ZhenXi built
// or runs; everything else is the platform he operates, described but not claimed. `product`
// colours each box by the product it belongs to (see products.ts); none means shared infrastructure.

import type { ProductKey } from "@/content/products";

export const aiIntro =
  "Primustech's AI agent platform gives facility teams two agents: an operations agent that answers from the IoT platform's live readings, and a document assistant that answers from company documents. I deploy and run it on Google Cloud.";

/** The two agents inside the AI agent platform. */
export const agents = [
  {
    id: "operator",
    name: "Operations agent",
    what: "Answers facility managers from live building readings. A manager agent plans; a data-engineer agent queries the IoT platform and crunches the numbers.",
    runs: "Agno team on Cloud Run, Gemini on Vertex AI",
  },
  {
    id: "documents",
    name: "Document assistant",
    what: "Answers from a company's own documents, with citations: multi-stage RAG over Milvus, with a reranker on a GPU.",
    runs: "Cloud Run API and job, Milvus, Gemini via OpenRouter",
  },
] as const;

/** The whole platform in a paragraph, for the Ask console. */
export const aiOverview =
  `${aiIntro} The operations agent is an Agno team on Cloud Run using Gemini on Vertex AI, with Grok through OpenRouter; ` +
  "it pulls live readings from the IoT platform over GraphQL and aggregates them in DuckDB. The document assistant is a RAG service: a Cloud Run API, " +
  "a Redis queue and a Cloud Run Job worker that turn documents into Gemini embeddings in Milvus, then a bge-reranker-v2-m3 " +
  "cross-encoder on a GPU and Gemini answers with citations. Langfuse traces every request with its tokens and cost. " +
  "My part: deploying and running the agent APIs and the worker across dev, staging and production, the per-environment " +
  "Cloud Build pipelines, service accounts, Secret Manager and the shared VPC, the IoT platform as the building-data source, and " +
  "benchmarking latency, token cost and models.";

export type NodeId =
  | "people"
  | "lb"
  | "operator"
  | "docs-api"
  | "worker"
  | "iot"
  | "mongo"
  | "milvus"
  | "queue"
  | "storage"
  | "vertex"
  | "openrouter"
  | "reranker"
  | "langfuse"
  | "github"
  | "build"
  | "registry"
  | "secrets"
  | "vpc";

export type MapNode = { id: NodeId; label: string; sub: string; x: number; y: number; w?: number; mine?: boolean; product?: ProductKey };

/**
 * Positions are centres in the map's 1000 x 640 viewBox, in columns: entry, services, then models and
 * data; delivery and network along the bottom. Every service-to-dependency line crosses the empty
 * gutter between columns, so no request line passes behind another box.
 */
export const mapNodes: MapNode[] = [
  { id: "people", label: "Facility team", sub: "chat, web, app", x: 95, y: 250 },
  { id: "lb", label: "Load balancer", sub: "Cloud Armor, TLS", x: 285, y: 250, mine: true },
  { id: "operator", label: "Operations agent", sub: "Agno team, Cloud Run", x: 480, y: 150, mine: true, product: "ai" },
  { id: "docs-api", label: "Document assistant", sub: "RAG API, Cloud Run", x: 480, y: 290, mine: true, product: "ai" },
  { id: "worker", label: "Document worker", sub: "Cloud Run Job", x: 480, y: 430, mine: true, product: "ai" },
  { id: "iot", label: "IoT platform", sub: "live readings, GraphQL", x: 795, y: 60, w: 200, mine: true, product: "iot" },
  { id: "vertex", label: "Vertex AI", sub: "Gemini", x: 795, y: 115, w: 200, product: "ai" },
  { id: "openrouter", label: "OpenRouter", sub: "Gemini, Grok, embeddings", x: 795, y: 170, w: 200 },
  { id: "reranker", label: "Reranker", sub: "bge-reranker-v2-m3 on a GPU", x: 795, y: 225, w: 200, product: "ai" },
  { id: "milvus", label: "Milvus", sub: "vector search", x: 795, y: 280, w: 200, product: "ai" },
  { id: "mongo", label: "MongoDB", sub: "sessions, metadata", x: 795, y: 335, w: 200 },
  { id: "queue", label: "Redis queue", sub: "document jobs", x: 795, y: 390, w: 200, product: "ai" },
  { id: "storage", label: "Cloud Storage", sub: "uploaded files", x: 795, y: 445, w: 200, product: "ai" },
  { id: "langfuse", label: "Langfuse", sub: "traces, tokens, cost", x: 795, y: 500, w: 200 },
  { id: "github", label: "GitHub", sub: "merge", x: 95, y: 595 },
  { id: "build", label: "Cloud Build", sub: "one per environment", x: 285, y: 595, mine: true },
  { id: "registry", label: "Artifact Registry", sub: "images", x: 480, y: 595, mine: true },
  { id: "secrets", label: "Secret Manager", sub: "keys, parameters", x: 690, y: 595, mine: true },
  { id: "vpc", label: "Shared VPC", sub: "firewall, NAT, DNS", x: 880, y: 595, w: 170, mine: true },
];

/**
 * A step lights up `node` (and `also`). The packet travels from `from`, or from the previous step's
 * node when `from` is omitted; `from: null` means no packet, for steps that describe a property
 * rather than a hop.
 */
export type Step = { node: NodeId; from?: NodeId | null; also?: NodeId[]; title: string; text: string; mine?: string };
export type Journey = { id: string; name: string; about: string; mine?: boolean; product?: ProductKey; steps: Step[] };

export const journeys: Journey[] = [
  {
    id: "ask-building",
    name: "Ask about the building",
    about: "The operations agent: a small team of AI agents that answers facility managers from live building data.",
    product: "ai",
    steps: [
      { node: "people", title: "A question", text: "A facility manager asks something like \"which floors ran warm this afternoon?\"" },
      {
        node: "lb",
        title: "One way in",
        text: "Public traffic enters through one shared load balancer with Cloud Armor, routed by path to the right environment.",
      },
      {
        node: "operator",
        title: "An agent team",
        text: "A FastAPI service running an Agno team on Cloud Run: a manager agent plans the answer and hands the data work to a data-engineer agent.",
        mine: "I deploy and run it in dev, staging and production.",
      },
      {
        node: "iot",
        title: "Live readings",
        text: "The data-engineer agent pulls occupancy, temperature, air quality and water readings over GraphQL, from the building IoT platform.",
        mine: "The IoT platform is the GKE system I run, shown in the section above.",
      },
      {
        node: "operator",
        title: "SQL, not a giant prompt",
        text: "Readings are loaded into in-memory DuckDB and aggregated with SQL, so the model reads a summary rather than thousands of raw points.",
      },
      { node: "vertex", title: "The answer", text: "Gemini on Vertex AI writes the reply. Grok models are also available through OpenRouter." },
      { node: "mongo", from: "operator", title: "Memory", text: "The conversation is saved, so a follow-up question keeps its context." },
      {
        node: "langfuse",
        from: "operator",
        title: "A trace per request",
        text: "Every model call is traced with its tokens and its cost.",
        mine: "I used these per-request numbers to compare models on latency and cost.",
      },
    ],
  },
  {
    id: "add-document",
    name: "Add a document",
    about: "The document assistant's pipeline: upload a PDF, spreadsheet, deck or image, and it becomes searchable for RAG.",
    product: "ai",
    steps: [
      { node: "people", title: "An upload", text: "Someone adds a document to a knowledge base: PDF, Word, PowerPoint, Excel, CSV or an image." },
      { node: "lb", title: "One way in", text: "Same front door: the shared load balancer and Cloud Armor." },
      {
        node: "docs-api",
        title: "Accept, don't wait",
        text: "The API stores the file and queues a job, then answers at once instead of holding the request open while it processes.",
        mine: "I deploy the API and the worker as separate services.",
      },
      { node: "storage", title: "The original", text: "The file itself lands in Cloud Storage." },
      { node: "queue", from: "docs-api", title: "A job", text: "A processing job goes onto a Redis queue, with progress the UI can show." },
      {
        node: "worker",
        title: "Heavy lifting, elsewhere",
        text: "A much larger image, with the document parsers, runs as a Cloud Run Job on a schedule and drains the queue. Keeping it out of the API keeps the API small and quick to start.",
      },
      {
        node: "openrouter",
        title: "Read, chunk, embed",
        text: "Files become Markdown, images are described by Gemini's vision model, an LLM splits the text into meaningful chunks, and each chunk is embedded.",
      },
      { node: "milvus", from: "worker", title: "Searchable", text: "The vectors go to Milvus and the document's metadata to MongoDB." },
    ],
  },
  {
    id: "ask-documents",
    name: "Ask the documents",
    about: "The document assistant's RAG, in stages: fetch broadly, rerank precisely, answer with sources.",
    product: "ai",
    steps: [
      { node: "people", title: "A question", text: "Say, a construction rate from a schedule of rates, or an HR policy." },
      { node: "lb", title: "One way in", text: "The shared load balancer and Cloud Armor." },
      {
        node: "docs-api",
        title: "The right specialist",
        text: "An agent is chosen by document category: one for HR documents, one for everything else.",
      },
      { node: "milvus", title: "Fetch broadly", text: "The question is embedded and the closest chunks come back from Milvus." },
      {
        node: "reranker",
        from: "docs-api",
        title: "Rerank precisely",
        text: "A cross-encoder, bge-reranker-v2-m3 served on a GPU, scores each candidate against the question, so only the best reach the model.",
      },
      { node: "openrouter", from: "docs-api", title: "Answer with sources", text: "Gemini writes the answer and cites the documents it came from." },
      { node: "mongo", from: "docs-api", title: "Memory", text: "The last ten turns are kept for follow-up questions." },
      { node: "langfuse", from: "docs-api", title: "Accounted for", text: "Tokens, cost and tenant are recorded for every request." },
    ],
  },
  {
    id: "release",
    name: "Ship a release",
    about: "How a change reaches dev, staging and production. This path is my work.",
    mine: true,
    steps: [
      { node: "github", title: "Merge", text: "A change is merged on GitHub." },
      {
        node: "build",
        title: "Its own pipeline",
        text: "The environment's Cloud Build trigger fires. Dev, staging and production each have their own project, GitHub connection and trigger, so a dev build holds no rights in production.",
        mine: "I set these up per environment.",
      },
      { node: "registry", title: "An image", text: "The image is pushed to that environment's Artifact Registry." },
      {
        node: "secrets",
        title: "Config from outside",
        text: "Keys come from Secret Manager and settings from Parameter Manager, never baked into the image.",
      },
      {
        node: "worker",
        from: "registry",
        also: ["operator", "docs-api"],
        title: "Roll out",
        text: "Both assistants' APIs roll out as new Cloud Run revisions, and the document worker's job is updated.",
      },
    ],
  },
  {
    id: "network",
    name: "Lock it down",
    about: "Identity, secrets and the network around every environment. This path is my work.",
    mine: true,
    steps: [
      {
        node: "vpc",
        from: null,
        title: "One network",
        text: "A shared VPC host project owns the network for every environment: subnets, firewall rules, Cloud NAT, DNS and peering live in one place.",
      },
      {
        node: "lb",
        from: null,
        title: "One front door",
        text: "Users come in through the shared load balancer: Google-managed certificates, path routing to each environment, and Cloud Armor in front.",
      },
      {
        node: "operator",
        from: null,
        also: ["docs-api", "worker"],
        title: "Private by default",
        text: "Cloud Run services send all outbound traffic into the shared VPC, which is how they reach services on the private network.",
      },
      { node: "secrets", from: null, title: "No keys in code", text: "Each service runs as its own service account and reads its API keys from Secret Manager." },
      { node: "langfuse", from: null, title: "Even the tooling", text: "The self-hosted Langfuse VM sits behind its own Cloud Armor policy." },
    ],
  },
];

export type Measure = { question: string; metrics: string[]; why: string };

/** How I benchmark and watch an LLM service: the questions, what answers them, and why. */
export const measures: Measure[] = [
  {
    question: "Is it fast enough to talk to?",
    metrics: ["end-to-end latency p50 / p95", "time per agent step", "model vs tool vs data time"],
    why: "An agent answer is several model calls and tool calls in a row. The trace shows which step is slow, so the fix lands in the right place.",
  },
  {
    question: "What does one answer cost?",
    metrics: ["input / output tokens per request", "cost per request", "cost per tenant"],
    why: "Cost scales with tokens, not requests. Prompt size and model choice move the bill far more than traffic does.",
  },
  {
    question: "Which model for which job?",
    metrics: ["latency per model", "cost per model", "same questions, side by side"],
    why: "Run the same questions through each model and compare. The cheapest model that answers well is the right one for that step.",
  },
  {
    question: "Does it hold up under load?",
    metrics: ["latency vs concurrency", "error rate", "provider 429s", "Cloud Run instances"],
    why: "Load tests find the knee before users do. A provider's rate limit fails differently from running out of your own capacity.",
  },
];

export const aiStats = [
  { value: "3", label: "environments deployed the same way: dev, staging and production" },
  { value: "2,014", label: "BMS devices in the 50-storey demo building I built for the agents to query" },
  { value: "96%", label: "of agent input tokens served from the prefix cache in my research" },
];

/** The AI infrastructure layer by layer: what is used, what it does, and which parts are mine. */
export type Layer = { name: string; tools: string[]; does: string; mine?: string };

export const stack: Layer[] = [
  {
    name: "Models",
    tools: ["Gemini on Vertex AI", "OpenRouter: Gemini, Grok", "Gemini embeddings"],
    does: "Managed models behind two gateways: Vertex AI for the operations agent, OpenRouter for multi-provider access and the document assistant.",
    mine: "Service-account access to Vertex AI; provider keys kept in Secret Manager.",
  },
  {
    name: "GPU inference",
    tools: ["bge-reranker-v2-m3", "Infinity server"],
    does: "A cross-encoder reranker on its own accelerator. It re-scores retrieved chunks against the question, so only the best reach the model.",
  },
  {
    name: "Retrieval",
    tools: ["Milvus", "MongoDB", "LLM chunking", "Gemini vision for images"],
    does: "Documents become Markdown, then meaningful chunks, then vectors in Milvus. Metadata and conversation history sit beside them in MongoDB.",
  },
  {
    name: "Orchestration",
    tools: ["Agno agent teams", "Redis queue", "Cloud Run Jobs", "Cloud Scheduler"],
    does: "Agents answer on the request path. Heavy document processing goes onto a queue for a scheduled job, so uploads never block an answer.",
  },
  {
    name: "Serving",
    tools: ["Cloud Run services", "Cloud Run Jobs", "dev, staging, production"],
    does: "The agent APIs scale as Cloud Run services; the document worker, a much larger image, runs as a job.",
    mine: "I deploy and run both, in three environments.",
  },
  {
    name: "Observability",
    tools: ["Langfuse, self-hosted", "OpenTelemetry", "tokens, cost, tenant per request"],
    does: "Every request is a trace: each model call and tool call, with its latency, tokens and cost.",
    mine: "I used these traces to benchmark latency and cost, and to compare models.",
  },
  {
    name: "Delivery and security",
    tools: ["Cloud Build", "Artifact Registry", "Secret Manager", "Parameter Manager", "shared VPC", "Cloud Armor"],
    does: "A pipeline per environment, no keys in images, private networking, and one front door.",
    mine: "Mine, end to end.",
  },
];

/**
 * A sample trace of one operations-agent request, in the shape Langfuse shows it. The structure is
 * the real one (manager agent, data-engineer agent, GraphQL, DuckDB, session store); the timings and
 * token counts are illustrative, and the page says so.
 */
export type TraceSpan = {
  name: string;
  kind: "request" | "agent" | "llm" | "tool" | "store";
  start: number;
  dur: number;
  depth: number;
  tokensIn?: number;
  tokensOut?: number;
  note: string;
};

export const sampleTrace: { question: string; spans: TraceSpan[] } = {
  question: "Which floors ran warm this afternoon?",
  spans: [
    { name: "POST /query", kind: "request", start: 0, dur: 6.4, depth: 0, note: "The whole answer, from request to reply." },
    { name: "Manager agent: plan", kind: "llm", start: 0.1, dur: 1.2, depth: 1, tokensIn: 2900, tokensOut: 160, note: "Gemini decides what it needs and hands the data work to the data engineer." },
    { name: "Data-engineer agent", kind: "agent", start: 1.35, dur: 2.4, depth: 1, note: "A second agent with its own tools and its own model calls." },
    { name: "Plan the query", kind: "llm", start: 1.4, dur: 0.9, depth: 2, tokensIn: 3200, tokensOut: 210, note: "Writes the GraphQL query for the floors and the time range." },
    { name: "GraphQL: sensor readings", kind: "tool", start: 2.35, dur: 0.7, depth: 2, note: "Live temperature readings from the IoT platform." },
    { name: "DuckDB: aggregate by floor", kind: "tool", start: 3.1, dur: 0.05, depth: 2, note: "SQL over thousands of readings, so the model reads a summary instead of raw points." },
    { name: "Summarise the result", kind: "llm", start: 3.2, dur: 0.5, depth: 2, tokensIn: 1300, tokensOut: 120, note: "Turns the aggregate into a few lines for the manager." },
    { name: "Manager agent: answer", kind: "llm", start: 3.8, dur: 2.5, depth: 1, tokensIn: 4100, tokensOut: 380, note: "The reply. It carries the conversation so far, so its input is the largest." },
    { name: "Save session", kind: "store", start: 6.32, dur: 0.05, depth: 1, note: "The conversation goes to MongoDB for follow-up questions." },
  ],
};
