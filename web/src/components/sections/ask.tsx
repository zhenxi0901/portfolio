"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, Lightning, Sparkle, Database, WarningCircle } from "@phosphor-icons/react";
import { api, type AskResult } from "@/lib/api";
import { retrieve } from "@/lib/retrieval";
import type { Fact } from "@/content/knowledge";
import { scrollToId } from "@/lib/utils";
import { SectionHeading } from "@/components/site/section-heading";

const SUGGESTIONS = [
  "How did you cut the cloud bill?",
  "What did your final-year project find?",
  "Which GPUs have you used?",
  "What happens when a build has a critical CVE?",
];

type Answer = AskResult & { question: string; offline?: boolean; anchors: Record<string, string> };

let knowledge: Promise<Fact[]> | null = null;
function loadKnowledge() {
  knowledge ??= fetch("/knowledge.json")
    .then((r) => r.json())
    .then((j: { facts: Fact[] }) => j.facts);
  return knowledge;
}

export function Ask() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setQ(text);
    const facts = await loadKnowledge().catch(() => [] as Fact[]);
    const anchors = Object.fromEntries(facts.map((f) => [f.id, f.anchor]));
    try {
      const res = await api.ask(text);
      setAnswer({ ...res, question: text, anchors });
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 429 || status === 400) {
        setError((e as Error).message);
      } else {
        // API unreachable (static hosting or offline): answer from the same facts in the browser.
        const t0 = performance.now();
        const r = retrieve(text, facts);
        setAnswer({
          answer: r.answer,
          sources: r.sources.map((s) => ({ id: s.id, title: s.title })),
          mode: "retrieval",
          latency_ms: Math.round(performance.now() - t0),
          cached: false,
          question: text,
          offline: true,
          anchors,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="ask" className="scroll-mt-20 border-t border-line bg-surface-2/40">
      <div className="mx-auto max-w-[1320px] px-4 py-24 sm:px-8 sm:py-32">
        <SectionHeading
          title="Ask about my experience"
          lead="A small retrieval service over everything on this page, with an optional LLM on top. It answers only from these facts and shows its sources."
        />
        <div className="mt-12 overflow-hidden rounded-3xl border border-line bg-surface shadow-soft">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(q);
            }}
            className="flex items-center gap-3 border-b border-line p-3 pl-5"
          >
            <Sparkle size={20} weight="fill" className="shrink-0 text-accent-ink" />
            <label htmlFor="ask-input" className="sr-only">
              Your question
            </label>
            <input
              id="ask-input"
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={300}
              placeholder="Ask anything about my work, research or skills"
              className="h-12 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-3"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={busy || !q.trim()}
              aria-label="Ask"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-transform active:scale-95 disabled:opacity-40"
            >
              <ArrowUp size={18} weight="bold" />
            </button>
          </form>

          <div className="min-h-64 p-5 sm:p-7" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              {busy ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                  {[92, 80, 64].map((w) => (
                    <div key={w} className="h-4 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
                  ))}
                </motion.div>
              ) : error ? (
                <motion.p key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-sm text-critical">
                  <WarningCircle size={18} weight="fill" /> {error}
                </motion.p>
              ) : answer ? (
                <AnswerView key={answer.question + answer.latency_ms} a={answer} />
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <p className="text-sm text-ink-3">Try one of these</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => ask(s)}
                        className="rounded-full border border-line-strong px-4 py-2 text-sm text-ink-2 transition-colors hover:border-accent-ink hover:text-ink"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

function AnswerView({ a }: { a: Answer }) {
  const reduce = useReducedMotion();
  const words = a.answer.split(" ");
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <p className="text-sm text-ink-3">{a.question}</p>
      <p className="mt-3 max-w-[70ch] text-lg leading-relaxed">
        {words.map((w, i) => (
          <motion.span
            key={i}
            initial={reduce ? false : { opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ delay: Math.min(i * 0.018, 1.2), duration: 0.25 }}
          >
            {w}{" "}
          </motion.span>
        ))}
      </p>
      {a.sources.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-3">Sources</span>
          {a.sources.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollToId(a.anchors[s.id] ?? "top")}
              className="rounded-full border border-line px-3 py-1 text-xs text-ink-2 transition-colors hover:border-accent-ink hover:text-ink"
            >
              {s.title}
            </button>
          ))}
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 font-mono text-[11px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          {a.mode === "llm" ? <Sparkle size={13} /> : <Database size={13} />}
          {a.mode === "llm" ? "LLM, grounded in retrieved facts" : a.offline ? "retrieval in your browser (API offline)" : "retrieval (BM25)"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Lightning size={13} /> {a.latency_ms} ms{a.cached ? ", from cache" : ""}
        </span>
      </div>
    </motion.div>
  );
}
