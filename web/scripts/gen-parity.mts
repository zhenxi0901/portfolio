// Records what the browser's retrieval engine answers, so the Go engine can be tested against it.
// Run: node scripts/gen-parity.ts   (Node 24 strips the TypeScript types natively)
import { readFileSync, writeFileSync } from "node:fs";
import { retrieve } from "../src/lib/retrieval.ts";

const facts = JSON.parse(readFileSync(new URL("../out/knowledge.json", import.meta.url), "utf8")).facts;

const questions = [
  "How did ZhenXi cut the cloud bill?",
  "What did the final-year project find?",
  "Which GPUs has ZhenXi used?",
  "What happens when a build has a critical CVE?",
  "Tell me about the ICCV paper",
  "k8s migration",
  "Where did ZhenXi study?",
  "Does ZhenXi know Terraform?",
  "What is AiBE?",
  "ZooKeeper quorum alerts",
  "SCADA and PLC experience",
  "How does traffic reach the cluster?",
  "What do you monitor?",
  "How does a command reach the HVAC plant?",
  "zzqx plorf",
];

const cases = questions.map((question) => {
  const r = retrieve(question, facts);
  return { question, answer: r.answer, sources: r.sources.map((s: { id: string }) => s.id) };
});

writeFileSync(new URL("../../api/internal/ask/testdata/parity.json", import.meta.url), JSON.stringify(cases, null, 2) + "\n");
console.log(`wrote ${cases.length} parity cases`);
