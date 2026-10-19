// "You're on call": a simulated incident on the building IoT platform, built from its real alerting
// design (SLOs, burn rules, the seven Grafana pages, the runbook and its guardrail in slo.ts). The
// incident itself is invented for practice; times are simulated and only move when you act.

export type Move = {
  id: string;
  kind: "look" | "act";
  label: string;
  /** Simulated minutes the move takes. */
  minutes: number;
  /** What you see. */
  result: string;
  /** Evidence this move turns up (for the debrief). */
  evidence?: "symptom" | "parser" | "change" | "ruled-out" | "signal-ok" | "runbook";
  /** Effect on the incident. */
  effect?: "mitigate" | "verify" | "silence" | "refused" | "nothing";
};

export const scenario = {
  start: "02:14",
  page: {
    title: "Telemetry fresh: fast burn",
    detail: "Burn rate 14.4x over both 1 hour and 5 minutes. At this rate the 30-day error budget lasts about two days.",
  },
  /** Budget spent per simulated minute at 14.4x on a 30-day window: 14.4 / 43,200. */
  burnPerMinute: 14.4 / (30 * 24 * 60),
  /** A focused path, as the budget policy says (mitigate first, investigate second): check what
   * changed, roll back, confirm recovery. Root cause comes after, before closing. */
  goodPathMinutes: 10,
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
      evidence: "parser",
      result:
        "The broker is receiving from all 40 sites at the usual cadence. After the parser, the 3 stale sites produce zero readings: their messages parse to nothing. No write errors, so nothing alerted on errors.",
    },
    {
      id: "logs",
      kind: "look",
      label: "Parser logs",
      minutes: 3,
      evidence: "parser",
      result:
        "At INFO, not ERROR: \"payload layout not recognised, 0 readings extracted\" for one gateway payload version, from 02:01 onwards. All 3 stale sites use that version.",
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
        "At 02:01 the pipeline promoted a new parser image by digest. Its change log mentions refactoring payload detection. The previous digest ran cleanly for nine days.",
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
  ] satisfies Move[],
};
