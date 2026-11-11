// The machine-facing side of the site: the MCP server at /mcp and the plain-text ways in.
// The tools themselves are defined in the Go server (api/internal/server/mcptools.go); a test there
// fails if this list and that one name different tools.

/** The protocol revision the page's console speaks. The server also answers older clients. */
export const MCP_PROTOCOL = "2026-07-28";
export const MCP_SERVER_NAME = "zhenxi";

export type AgentTool = {
  name: string;
  /** One line for the page before the live descriptions load, and for llms.txt. */
  summary: string;
  /** Arguments the console starts with. */
  example: Record<string, string | number>;
};

export const agentTools: AgentTool[] = [
  { name: "ask", summary: "A short answer to a question about my work, with the sources it came from.", example: { question: "How did you cut the cloud bill?" } },
  { name: "search_facts", summary: "The most relevant facts, whole and ranked, each with a link.", example: { query: "rollback drill", limit: 2 } },
  { name: "list_topics", summary: "Everything the site can be asked about.", example: {} },
  { name: "get_status", summary: "The commit that is live and the site's SLO, measured from outside.", example: {} },
  { name: "get_delivery", summary: "How the site ships: deploys, lead time, change failure rate, last rollback drill.", example: {} },
];
