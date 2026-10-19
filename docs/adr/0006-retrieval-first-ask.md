<!-- Generated from web/src/content/decisions.ts by web/scripts/gen-adr.mts. Edit that file, not this one. -->

# 6. Answer questions by retrieval first; an LLM is optional

- Status: Accepted
- Date: 2026-10-01

## Context

The Ask console answers questions about me on a public site. Wrong answers, prompt injection and an open-ended model bill are all real risks.

## Decision

BM25 retrieval over the site's own facts, generated at build time from the same content files as the pages, picks the answer. An OpenAI-compatible model can phrase it, fenced against injected instructions, rate limited and cached.

The browser carries the same retrieval, so the console still answers if the API is down.

## Consequences

What it buys:

- Every answer comes from something the site already says, at no model cost by default.
- Answers are deterministic, so they can be tested: Go and TypeScript are checked against the same 23 questions in CI.

What it costs:

- Retrieval quotes rather than converses, and a question the facts do not cover gets the closest fact, not a new answer.

## Evidence

- [api/internal/ask/retrieval.go](../../api/internal/ask/retrieval.go)
- [web/src/lib/retrieval.ts](../../web/src/lib/retrieval.ts)
