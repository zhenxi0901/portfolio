// The checks /evidence can run from the visitor's browser. Apart from evidence.ts, so the browser loads these few
// names and not the claims and everything they are drawn from.

/** A check the page can run from the visitor's browser against this site's own API. */
export type LiveCheck = "slo" | "status" | "mcp" | "cost" | "lab";

/** What each check reads, for the accessible names of its buttons: the page has several of each. */
export const checkName: Record<LiveCheck, string> = {
  slo: "the availability",
  status: "the running commit",
  mcp: "the MCP server",
  cost: "this month's bill",
  lab: "the fault-injection lab",
};
