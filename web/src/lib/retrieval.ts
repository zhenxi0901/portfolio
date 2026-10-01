import type { Fact } from "@/content/knowledge";

// Keep in sync with api/internal/ask/retrieval.go: same tokenizer, aliases, BM25 and sentence pick.

const STOP = new Set(
  "a an and are as at be by did do does for from has have he her his how i in is it its me my of on or she so that the their them they this to was what when where which who why with you your zhenxi zhenxi's li about tell know please can could give describe explain".split(
    " ",
  ),
);

const ALIASES: Record<string, string[]> = {
  k8s: ["kubernetes"],
  gcp: ["google", "cloud"],
  cost: ["spend", "bill"],
  money: ["spend", "bill"],
  save: ["spend", "cut"],
  saved: ["spend", "cut"],
  gpu: ["a100", "nvidia"],
  gpus: ["a100", "nvidia"],
  llm: ["agent", "llm"],
  ai: ["agent", "llm", "ai"],
  fyp: ["final-year", "project"],
  thesis: ["final-year", "project"],
  school: ["education", "university"],
  study: ["education", "university"],
  studied: ["education", "university"],
  job: ["intern", "role"],
  ci: ["pipeline", "build"],
  cd: ["pipeline", "deploy"],
  paper: ["iccv", "publication"],
  monitoring: ["alerts", "grafana", "monitoring"],
  sre: ["reliability", "alerts", "sre"],
};

const TITLE_WEIGHT = 1.5;
const MAX_SENTENCES = 3;
const SUFFIXES = ["ations", "ation", "ating", "ated", "ates", "ings", "ing", "ions", "ion", "ed", "s"];

/** Light suffix stripping so "migrated", "migrating" and "migration" meet at "migr". */
export function stem(w: string): string {
  if (/\d/.test(w)) return w;
  // English "-es" plurals: reaches, passes, boxes.
  if (/(ches|shes|xes|sses)$/.test(w) && w.length >= 6) return w.slice(0, -2);
  for (const suf of SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= 3 && !(suf === "s" && w.endsWith("ss"))) {
      return w.slice(0, -suf.length);
    }
  }
  return w;
}

export function tokenize(s: string): string[] {
  const words = s.toLowerCase().match(/[a-z0-9][a-z0-9.+-]*/g) ?? [];
  const out: string[] = [];
  const add = (w: string) => {
    if (!w || STOP.has(w)) return;
    out.push(stem(w));
    ALIASES[w]?.forEach((a) => out.push(stem(a)));
  };
  for (const raw of words) {
    const w = raw.replace(/[.]+$/, "");
    add(w);
    // "critical-cve" also counts as "critical" and "cve".
    if (w.includes("-")) w.split("-").forEach(add);
  }
  return out;
}

function bm25(query: string[], docs: string[][], k1 = 1.4, b = 0.75) {
  const N = docs.length;
  const avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(N, 1);
  const df = new Map<string, number>();
  docs.forEach((d) => new Set(d).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)));
  return docs.map((d) => {
    const tf = new Map<string, number>();
    d.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + 1));
    let score = 0;
    for (const q of new Set(query)) {
      const f = tf.get(q);
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(q) ?? 0) + 0.5) / ((df.get(q) ?? 0) + 0.5));
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg));
    }
    return score;
  });
}

export function retrieve(question: string, facts: Fact[]) {
  const q = tokenize(question);
  // Title is scored as its own field (BM25F-style): a match there says more than one buried
  // in a long text, which BM25's length normalisation would otherwise discount.
  const body = bm25(q, facts.map((f) => tokenize(`${f.title} ${f.text}`)));
  const titles = bm25(q, facts.map((f) => tokenize(`${f.title} ${f.lead ?? ""}`)));
  const scores = body.map((s, i) => s + TITLE_WEIGHT * titles[i]);
  const sorted = facts
    .map((f, i) => ({ f, s: scores[i] }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  // A second fact only joins the answer when it is nearly as relevant as the first.
  const ranked = sorted.slice(0, 2).filter((x, i) => i === 0 || x.s >= 0.6 * sorted[0].s);
  if (!ranked.length) {
    return {
      answer:
        "I couldn't find that in what this site knows. Try asking about Primustech, the GKE migration, the cloud bill, the final-year project or the ICCV paper.",
      sources: [] as Fact[],
    };
  }
  const qs = new Set(q);
  // The answer is written from the best fact only, so it stays on one topic; the runner-up is
  // still returned as a source the visitor can open.
  const sentences = ranked.slice(0, 1).flatMap(({ f }, rank) =>
    f.text
      .split(/(?<=[.!?])\s+/)
      .filter((text) => !text.startsWith("Tools used:"))
      .map((text, pos) => ({ text, rank, pos, hits: tokenize(text).filter((t) => qs.has(t)).length })),
  );
  const best = sentences
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.rank - b.rank || a.pos - b.pos)
    .slice(0, MAX_SENTENCES);
  // Thin match: fill with the top fact's next sentences, in order, so the answer has substance.
  for (const s of sentences) {
    if (best.length >= MAX_SENTENCES) break;
    if (s.rank === 0 && !best.includes(s)) best.push(s);
  }
  const picked = best.sort((a, b) => a.rank - b.rank || a.pos - b.pos).map((s) => s.text);
  const lead = ranked[0].f.lead;
  const answer = (lead && !picked.includes(lead) ? [lead, ...picked] : picked).join(" ");
  return { answer, sources: ranked.map((r) => r.f) };
}
