// "You're on call": simulated incidents, one per platform, built from each platform's real design as
// this site describes it. The incidents are invented for practice; times are simulated and only
// move when you act. Each scenario says plainly which parts are real and which are made up.
import type { ProductKey } from "@/content/products";

/** What a look turns up, for the debrief. */
export type Evidence = "symptom" | "trace" | "cause" | "change" | "ruled-out" | "signal-ok" | "runbook";

export type Move = {
  id: string;
  kind: "look" | "act";
  label: string;
  /** Simulated minutes the move takes. */
  minutes: number;
  /** What you see. */
  result: string;
  evidence?: Evidence;
  /** Effect on the incident. */
  effect?: "mitigate" | "verify" | "silence" | "refused" | "nothing";
};

/** One line of the debrief, scored from the moves played. "{m}" is the minutes until mitigation. */
export type Check =
  | { kind: "before-mitigate"; evidence: Evidence; text: string }
  | { kind: "mitigated-within"; minutes: number; text: string }
  | { kind: "found"; evidence: Evidence[]; text: string }
  | { kind: "never"; effect: "silence" | "refused"; text: string }
  | { kind: "always"; text: string };

export type Scenario = {
  id: "iot" | "ai";
  product: ProductKey;
  /** For the picker: when the page fires and what is wrong, in a few words. */
  summary: string;
  /** The scene, shown above the drill while this scenario is chosen. */
  intro: string;
  /** What is real and what is made up, said before the drill starts. */
  honesty: string;
  start: string;
  page: { title: string; detail: string };
  /** Share of a 30-day budget spent per simulated minute: the burn rate over 43,200 minutes. */
  burnPerMinute: number;
  /** The focused path in a few words, and how long it takes. */
  focusedPath: string;
  goodPathMinutes: number;
  emptyHint: string;
  moves: Move[];
  checks: Check[];
  rootCause: string;
};

const perMinute = (burn: number) => burn / (30 * 24 * 60);

const iot: Scenario = {
  id: "iot",
  product: "iot",
  summary: "02:14, telemetry going stale",
  intro: "It is 02:14 and the pager goes off: readings from some of the platform's buildings have stopped arriving fresh.",
  // The platform's objectives are still proposals (see "What I monitor"), so the page is not called a real one.
  honesty:
    "The Grafana dashboards, the runbook and its guardrail are the platform's real ones. The freshness objective behind the page is a proposal, not yet agreed, and the incident is invented for practice.",
  start: "02:14",
  page: {
    title: "Telemetry fresh: fast burn",
    detail:
      "Burn rate above 14.4x over both the last hour and the last 5 minutes. At this rate the 30-day error budget lasts about two days.",
  },
  burnPerMinute: perMinute(15),
  /** Mitigate first, investigate second, as the budget policy says: check what changed, roll back, confirm. */
  focusedPath: "check what changed, roll back, confirm",
  goodPathMinutes: 10,
  emptyHint: "Nothing yet. Pick a dashboard, the logs or the runbook to start.",
  moves: [
    {
      id: "overview",
      kind: "look",
      label: "Overview dashboard",
      minutes: 2,
      evidence: "symptom",
      result:
        "Dashboards load and the API answers: no errors anywhere, latency normal. But the newest reading is going stale for 3 of 40 sites, and the queue trend is flat.",
    },
    {
      id: "ingestion",
      kind: "look",
      label: "Ingestion dashboard",
      minutes: 3,
      evidence: "cause",
      result:
        "The broker is receiving from all 40 sites at the usual cadence. After the parser, the 3 stale sites produce zero readings: their messages parse to nothing. No write errors, so nothing alerted on errors.",
    },
    {
      id: "logs",
      kind: "look",
      label: "Parser logs",
      minutes: 3,
      evidence: "cause",
      result:
        "At INFO, not ERROR: \"payload layout not recognised, 0 readings extracted\" for one gateway payload version, from 01:12 onwards. All 3 stale sites use that version.",
    },
    {
      id: "dependencies",
      kind: "look",
      label: "Dependencies dashboard",
      minutes: 3,
      evidence: "ruled-out",
      result: "Database pool waits, Kafka, SQL CPU, connections and disk all normal. Not a shared dependency.",
    },
    {
      id: "capacity",
      kind: "look",
      label: "Capacity dashboard",
      minutes: 2,
      evidence: "ruled-out",
      result: "No CPU throttling, no Pending pods, HPA at its usual replicas. Not resource pressure.",
    },
    {
      id: "changes",
      kind: "look",
      label: "Changes: recent deploys",
      minutes: 2,
      evidence: "change",
      result:
        "At 01:12 the pipeline promoted a new parser image by digest. Its change log mentions refactoring payload detection. The previous digest ran cleanly for nine days.",
    },
    {
      id: "observability",
      kind: "look",
      label: "Observability dashboard",
      minutes: 2,
      evidence: "signal-ok",
      result: "Scrapes are healthy and the metrics are fresh. The signal can be trusted: this is not a monitoring gap.",
    },
    {
      id: "runbook",
      kind: "look",
      label: "Read the runbook",
      minutes: 1,
      evidence: "runbook",
      result:
        "Check monitoring is fresh. Find the affected lane. Check parser outcomes apart from write errors: messages that parse to nothing lose data while every pod stays Ready. Line it up with recent deploys. Mitigate first, then investigate.",
    },
    {
      id: "rollback",
      kind: "act",
      label: "Roll back the parser to the previous digest",
      minutes: 5,
      effect: "mitigate",
      result: "The previous image is promoted by digest. Within a few minutes the 3 sites produce readings again and the burn rate starts to fall.",
    },
    {
      id: "restart",
      kind: "act",
      label: "Restart the parser pods",
      minutes: 2,
      effect: "nothing",
      result: "The pods come back Ready, running the same image. Nothing changes: the messages still parse to nothing.",
    },
    {
      id: "scale",
      kind: "act",
      label: "Add Kafka brokers",
      minutes: 6,
      effect: "nothing",
      result: "More capacity for a problem that is not about capacity. The broker was never the bottleneck.",
    },
    {
      id: "silence",
      kind: "act",
      label: "Silence the page for an hour",
      minutes: 1,
      effect: "silence",
      result: "The pager goes quiet. The budget keeps burning, and now nobody is being told.",
    },
    {
      id: "purge",
      kind: "act",
      label: "Purge the topic and replay from the gateways",
      minutes: 1,
      effect: "refused",
      result: "Refused by the runbook's guardrail: never delete broker data or replay physical commands. Nothing upstream can resend those messages.",
    },
    {
      id: "verify",
      kind: "act",
      label: "Confirm recovery over several publish cycles",
      minutes: 3,
      effect: "verify",
      result: "Three publish cycles in a row arrive fresh from all 40 sites. The fast-burn alert clears on its own.",
    },
  ],
  checks: [
    { kind: "before-mitigate", evidence: "change", text: "Checked what changed before rolling back, so the rollback was a decision, not a guess" },
    { kind: "mitigated-within", minutes: 12, text: "Stopped the burn within 12 minutes (took {m})" },
    { kind: "found", evidence: ["cause"], text: "Found why before closing: messages parsing to nothing while every pod stayed Ready" },
    { kind: "never", effect: "silence", text: "Never silenced the page" },
    { kind: "never", effect: "refused", text: "Stayed inside the guardrail: no deleting broker data" },
    { kind: "always", text: "Confirmed recovery over several publish cycles before closing" },
  ],
  rootCause:
    "Root cause: a parser release at 01:12 changed how payloads are detected, so one gateway version's messages parsed to nothing. Every pod stayed Ready and nothing errored, which is why the freshness SLO, not an error alert, caught it. With 3 of 40 sites stale the burn was about 15x, and a fast-burn page needs the whole last hour above 14.4x: that is why it fired an hour after the release.",
};

const ai: Scenario = {
  id: "ai",
  product: "ai",
  summary: "10:42, answers crawling",
  intro:
    "It is 10:42 and the pager goes off: facility managers are asking the document assistant about their buildings, and its answers have slowed to a crawl.",
  honesty:
    "The services, traces and dashboards are the platform's, as this site describes them. The objective, the alert, the runbook and the incident are invented for practice.",
  start: "10:42",
  page: {
    title: "Document assistant: slow answers, fast burn",
    detail:
      "The practice objective: 95% of answers within 15 seconds. Almost every answer now misses it, so the budget burns at about 20x. The last hour has averaged over 14.4x, and at this rate a month's budget lasts a day and a half.",
  },
  burnPerMinute: perMinute(20),
  focusedPath: "read a slow trace, skip the slow stage, restore it",
  goodPathMinutes: 9,
  emptyHint: "Nothing yet. Pick a trace, a dashboard or the runbook to start.",
  moves: [
    {
      id: "latency",
      kind: "look",
      label: "Latency dashboard",
      minutes: 2,
      evidence: "symptom",
      result:
        "The document assistant slowed at 09:58: the median answer went from 7 s to 30 s and p95 from 11 s to 45 s, and 1% now hit the API's 60 s timeout. The operations agent is unaffected.",
    },
    {
      id: "trace",
      kind: "look",
      label: "One slow request's trace",
      minutes: 3,
      evidence: "trace",
      result:
        "A 31 s answer, and 24 s of it is the reranker scoring 40 candidates. Embedding the question and searching Milvus took 0.3 s, the model 4.1 s. Yesterday the reranker's span took under a second.",
    },
    {
      id: "reranker",
      kind: "look",
      label: "Reranker service",
      minutes: 3,
      evidence: "cause",
      result:
        "It restarted at 09:57 and came back on CPU: it could not reach its GPU, and the server falls back to CPU when it finds none. Same cross-encoder, about 30 times slower, and its health check only asks whether it answers, so it reports healthy.",
    },
    {
      id: "changes",
      kind: "look",
      label: "Changes: deploys and events",
      minutes: 2,
      evidence: "change",
      result: "No release for two days. One event, at 09:57: host maintenance restarted the reranker's machine, and its GPU driver did not load on the way back up.",
    },
    {
      id: "provider",
      kind: "look",
      label: "Model provider dashboard",
      minutes: 2,
      evidence: "ruled-out",
      result: "Answer times, error rate and rate limits at the model provider are all normal: no 429s. The model is not the problem.",
    },
    {
      id: "vectors",
      kind: "look",
      label: "Vector search",
      minutes: 2,
      evidence: "ruled-out",
      result: "Milvus answers in 120 ms at p95, and the collection has not grown. Retrieval is fine.",
    },
    {
      id: "cost",
      kind: "look",
      label: "Token cost dashboard",
      minutes: 1,
      evidence: "signal-ok",
      result: "Tokens and cost per answer are flat: nothing is looping or retrying against the model, and the traces are arriving, so they can be trusted.",
    },
    {
      id: "runbook",
      kind: "look",
      label: "Read the runbook",
      minutes: 1,
      evidence: "runbook",
      result:
        "Find the slow span in a trace before touching anything. If one stage is slow and an answer still works without it, switch that stage off to stop the burn, then restore it. Never delete or rebuild the vector index during an incident.",
    },
    {
      id: "skip-rerank",
      kind: "act",
      label: "Skip reranking: answer in vector-search order",
      minutes: 2,
      effect: "mitigate",
      result:
        "A flag sends the top vector-search results straight to the model. Answers fall back under 10 s at p95; the ranking is a little rougher, but every answer still cites its sources. The burn stops.",
    },
    {
      id: "scale",
      kind: "act",
      label: "Raise the API's maximum instances",
      minutes: 2,
      effect: "nothing",
      result: "More API instances, all waiting on the one slow reranker, which now gets more work at once. Latency does not improve, and the bill goes up.",
    },
    {
      id: "timeout",
      kind: "act",
      label: "Raise the API timeout to 120 s",
      minutes: 1,
      effect: "nothing",
      result: "Fewer timeouts and slower answers: people now wait up to two minutes. The objective is about how long they wait, so the burn goes on.",
    },
    {
      id: "model",
      kind: "act",
      label: "Switch to a faster answer model",
      minutes: 3,
      effect: "nothing",
      result: "The model is 4 of the 31 seconds. A faster one saves 2 of them, and the answers get worse.",
    },
    {
      id: "silence",
      kind: "act",
      label: "Silence the page for an hour",
      minutes: 1,
      effect: "silence",
      result: "The pager goes quiet. Answers stay slow, the budget keeps burning, and now nobody is being told.",
    },
    {
      id: "reindex",
      kind: "act",
      label: "Rebuild the vector index from the documents",
      minutes: 1,
      effect: "refused",
      result:
        "Refused by the runbook: never delete or rebuild the index during an incident. It takes hours, pays for every document's embeddings again, and retrieval was never the problem.",
    },
    {
      id: "restore",
      kind: "act",
      label: "Get the reranker back on its GPU, then turn reranking on",
      minutes: 4,
      effect: "verify",
      result:
        "Reinstalling the driver and restarting the server puts the reranker back on its GPU: 40 candidates in 0.8 s again. With reranking back on, the median is back to 7 s and p95 to 11 s, and the page has cleared.",
    },
  ],
  checks: [
    { kind: "before-mitigate", evidence: "trace", text: "Read a slow request's trace before acting, so the fix aimed at the slow stage" },
    { kind: "mitigated-within", minutes: 12, text: "Stopped the slow answers within 12 minutes (took {m})" },
    { kind: "found", evidence: ["cause", "change"], text: "Found why before closing: the reranker lost its GPU and kept answering, slowly, on CPU" },
    { kind: "never", effect: "silence", text: "Never silenced the page" },
    { kind: "never", effect: "refused", text: "Stayed inside the runbook: the vector index was never touched" },
    { kind: "always", text: "Restored full quality and watched latency hold before closing" },
  ],
  rootCause:
    "Root cause: host maintenance restarted the reranker's machine at 09:57, and its GPU driver did not load on the way back up. The server fell back to CPU without complaint, about 30 times slower, and its health check only asked whether it answered, so nothing was down and nothing errored. One slow stage made every answer slow, and one trace showed which. Almost every answer missed the objective, a burn of about 20x, and a fast-burn page waits until the last hour averages over 14.4x: 43 minutes at 20x, which is why it came at 10:42. That wait is the price of a loose objective: at 95%, even a total failure burns at only 20x. The follow-ups a real postmortem would carry: alert on the reranker's own latency, not only on whether it answers, and refuse to start it without a GPU.",
};

export const scenarios: Scenario[] = [iot, ai];
