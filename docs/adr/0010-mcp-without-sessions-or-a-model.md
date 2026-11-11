<!-- Generated from web/src/content/decisions.ts by web/scripts/gen-adr.mts. Edit that file, not this one. -->

# 10. An MCP server with no sessions and no model

- Status: Accepted
- Date: 2026-11-11

## Context

People increasingly look things up through an AI agent, and that includes looking up a candidate. The site already had a file of facts and a retrieval index behind its Ask console; the Model Context Protocol (MCP) is how an agent reaches something like that as tools.

The protocol changed shape in 2026. The 2026-07-28 revision is stateless: no handshake, every request describes itself. Clients written before it still open with an initialize request and expect an answer.

## Decision

Serve MCP at /mcp from the same Go binary, written against the standard library. Speak the stateless revision, and also answer the older handshake, without keeping a session for either.

Five read-only tools over what the site already publishes: its facts, its SLO and its delivery numbers. Retrieval only: the tools return text and numbers, and the calling agent's model does the reasoning.

## Consequences

What it buys:

- It fits Cloud Run: any instance can answer any request, and scaling to zero loses nothing.
- No model bill and no prompt for a stranger to attack on my side. The LLM in the loop is the caller's own.
- One set of facts. The Ask console, /llms-full.txt and the tools all read the same file, so they cannot disagree.

What it costs:

- Two protocol eras to keep working. Each has its own tests, and every release calls a tool in both before it takes traffic.
- No SDK, so when the specification moves again the changes are mine to make by hand.
- Tools only: no resources, prompts or streaming. A portfolio does not need them, and each would be more surface to keep correct.
- It is open to anyone, so it is rate limited per client, and the limit is per instance (ADR 1).

## Evidence

- [api/internal/mcp/mcp.go: the protocol, both eras](../../api/internal/mcp/mcp.go)
- [api/internal/server/mcptools.go: the tools](../../api/internal/server/mcptools.go)
- [scripts/smoke.sh: both eras checked on every release](../../scripts/smoke.sh)
