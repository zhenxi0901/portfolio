// Longer write-ups. Every number here already appears elsewhere on the site (research, cost review),
// from the FYP report and the platform's own measurements; nothing is new or modelled.

export type Block =
  | { kind: "p"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "code"; text: string; caption?: string }
  | { kind: "list"; items: string[] }
  | { kind: "callout"; text: string };

export type Post = {
  slug: string;
  title: string;
  summary: string;
  date: string;
  /** Which part of the work it comes from, for the tag and the card colour. */
  product: "iot" | "aries";
  stats: { value: string; label: string }[];
  body: Block[];
  links: { label: string; href: string }[];
};

export const posts: Post[] = [
  {
    slug: "serving-llm-agents",
    title: "What 320 agent runs taught me about serving LLM agents",
    summary:
      "Tool calls were 2.7% of an agent's time, 96% of its input tokens came from the prefix cache, and the GPU sat idle most of the time it was held.",
    date: "19 Oct 2026",
    product: "aries",
    stats: [
      { value: "2.7%", label: "of agent time spent inside tool calls" },
      { value: "96%", label: "of input tokens served from the prefix cache" },
      { value: "~7x", label: "more A100 time held than the agents used" },
    ],
    body: [
      {
        kind: "p",
        text: "For my final-year project at NTU's HyScale Lab I made ARIES, the lab's open-source agent-serving framework, run long-horizon tasks from the Toolathlon benchmark: an agent works for many turns against live apps (mail, a shop, an LMS) running in its own sandbox. Then I measured 320 runs, on a hosted model API and on Qwen3-4B served with SGLang on an A100. The question was simple: what does an agent actually cost to run, and where does the time go?",
      },
      { kind: "h2", text: "Tool calls are cheap. Setting up the world is not." },
      {
        kind: "p",
        text: "Inside the agent phase, tool calls took only 2.7% of the time. The bigger surprise was outside the agent: 23% of each run's wall clock went to setting up the environment, against 2% for tasks that need a single service. A task that touches mail, a shop and an LMS has to bring all of them up and prepare them before the agent starts.",
      },
      {
        kind: "callout",
        text: "If you want agent runs to go faster, look at environment provisioning before you look at tools.",
      },
      { kind: "h2", text: "Every turn resends the conversation, and the cache absorbs it" },
      {
        kind: "p",
        text: "An agent's prompt grows every turn: the whole history goes back to the model each time. Across the 320 runs, 96% of input tokens were served from the prefix cache, on the hosted API and on self-hosted SGLang alike. So most of a long run's prompt is work the server has already done; what costs compute each turn is the part that is new, as long as the cache keeps hitting.",
      },
      {
        kind: "p",
        text: "That changes what matters in serving. A cache hit rate that drops, because requests land on a replica that has not seen the conversation or the cache is too small, turns cheap turns back into full recomputes.",
      },
      { kind: "h2", text: "Four at once on one VM: 3.02x" },
      {
        kind: "p",
        text: "Each run gets its own sandbox with its own copies of the apps, so runs can share a machine without seeing each other. On one 8-vCPU VM, throughput went from 13.7 runs an hour at one at a time to 23.8 at two and 41.5 at four: 1.73x and 3.02x. Successful runs scaled a little less, 2.71x at four. Along the way CPU rose from 15% to 48% and memory from 2.6 to 6.4 GiB.",
      },
      { kind: "h2", text: "A reserved GPU that sits idle" },
      {
        kind: "p",
        text: "The model ran on an A100 at NSCC, Singapore's national supercomputer, and the agents ran on a Google Cloud VM, joined by an SSH tunnel through IAP. Serving jobs reserve the GPU for their whole lifetime. They held the A100 for about seven times as long as the agent runs actually used it.",
      },
      {
        kind: "callout",
        text: "An idle reserved accelerator is the AI version of an oversized pod: the waste is in the reservation, not the work.",
      },
      { kind: "h2", text: "What I would measure next" },
      {
        kind: "list",
        items: [
          "How much of the 23% setup time prepared app snapshots would remove.",
          "Prefix-cache hit rate across several serving replicas, with and without routing a conversation back to the same one.",
          "How many agent runs one GPU reservation can serve before the idle share stops dominating.",
        ],
      },
    ],
    links: [
      { label: "The research section, with the charts", href: "/#research" },
      { label: "ARIES on GitHub", href: "https://github.com/hyscale-lab/ARIES" },
      { label: "The Toolathlon adapter pull request", href: "https://github.com/hyscale-lab/ARIES/pull/55" },
    ],
  },
  {
    slug: "metrics-bill-kafka-topics",
    title: "Finding a metrics bill in 914 orphaned Kafka topics",
    summary:
      "Managed Prometheus was the third-largest line item and nobody had measured why. Attribution first, then a reaper, then dropping what nobody read.",
    date: "19 Oct 2026",
    product: "iot",
    stats: [
      { value: "914", label: "orphaned Kafka topics, 86% of all topics" },
      { value: "-40%", label: "samples per scrape from dropping unread metrics" },
      { value: "~15%", label: "cloud spend cut, with no alert dropped" },
    ],
    body: [
      {
        kind: "p",
        text: "The building IoT platform I run at Primustech is on GKE, monitored with Google Cloud Managed Service for Prometheus. In the bill, Managed Prometheus was about US$106 a month: the third-largest line item, climbing, with no matching growth in traffic. Nobody had measured where it came from.",
      },
      { kind: "h2", text: "Measure before cutting" },
      {
        kind: "p",
        text: "Managed Prometheus bills by samples ingested, so the first job was attribution: which scrape job produces the samples? One query answers it.",
      },
      { kind: "code", text: "sort_desc(sum by (job) (scrape_samples_scraped))", caption: "Samples per scrape, by job" },
      {
        kind: "p",
        text: "The Kafka exporter alone produced 10,386 of 43,580 samples per scrape, about a quarter of everything, while traffic had not grown to match.",
      },
      { kind: "h2", text: "914 topics for pods that no longer existed" },
      {
        kind: "p",
        text: "The exporter emits seven metric families per topic, so the topic count drives the bill. 914 of the 1,066 topics were named after pods that no longer existed. Deleting them took the exporter from 10,386 to 2,891 samples per scrape, and broker memory fell from 2.4 to 1.8 GiB as a side effect.",
      },
      {
        kind: "p",
        text: "Five days later the orphaned topics were back to 191. A one-off clean-up would have quietly undone itself, so the reaper runs as a Kubernetes CronJob.",
      },
      {
        kind: "callout",
        text: "If waste regrows, the fix is a schedule, not a clean-up.",
      },
      { kind: "h2", text: "Drop what nobody reads, and check first" },
      {
        kind: "p",
        text: "Three of GKE's built-in metric packages were on. Before turning anything off I checked every consumer: 0 of the 27 alerts then in place and 0 of 40 dashboard tiles used them. Turning them off cut all samples per scrape by 40%, from 43,580 to 26,150. cAdvisor stayed, even though it is the biggest remaining source, because three memory alerts depend on it.",
      },
      { kind: "h2", text: "The rest of the review" },
      {
        kind: "list",
        items: [
          "Cloud SQL from 4 vCPU/16 GiB to 2 vCPU/12 GiB, sized from measured use, and regional HA to zonal. The trade-off is written down: no automatic failover, so recovery is 7 backups plus 7-day point-in-time recovery, and reverting is one line of Terraform.",
          "Core API pod requests from 1 CPU/4 GiB to 0.5 CPU/3 GiB so pods pack tighter, with the HPA and cluster autoscaler keeping 3 nodes at the floor and up to 9 under load.",
          "An ingestion lane that had been replaced, retired end to end: six resources, removed only after the new lane carried production.",
        ],
      },
      {
        kind: "p",
        text: "Together that cut cloud spend by about 15%, and no alert was dropped. Another US$29 or so a month (an unused VPN gateway and one more Cloud SQL step) is going through a reviewed Terraform plan.",
      },
      { kind: "h2", text: "What I took from it" },
      {
        kind: "list",
        items: [
          "Attribute the cost before you cut anything; the biggest line was not where I would have guessed.",
          "A signal with no consumer is a cost with no benefit, but check the consumers, because some are not obvious.",
          "Write the trade-off down next to the change, so the next person knows what was given up and how to undo it.",
        ],
      },
    ],
    links: [
      { label: "The cost review, one move at a time", href: "/#platform-cost" },
      { label: "The case study", href: "/work/reaper" },
    ],
  },
];
