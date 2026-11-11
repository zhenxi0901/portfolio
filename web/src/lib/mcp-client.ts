// A minimal client for this site's own MCP server (POST /mcp), in the stateless form of the
// protocol: no handshake and no session, every request describes itself.
import { API_BASE } from "@/lib/api";
import { MCP_PROTOCOL } from "@/content/agents";
import { withTimeout } from "@/lib/signal";

export type McpField = { type?: string; description?: string; minimum?: number; maximum?: number; maxLength?: number };
export type McpSchema = { properties?: Record<string, McpField>; required?: string[] };
export type McpTool = { name: string; title?: string; description?: string; inputSchema?: McpSchema };
export type McpReply = {
  result?: { tools?: McpTool[]; content?: { type: string; text?: string }[]; isError?: boolean };
  error?: { code: number; message: string };
};
export type McpExchange = { headers: Record<string, string>; body: unknown; status: number; ms: number; json: McpReply | null };

const META = { "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL, "io.modelcontextprotocol/clientCapabilities": {} };

let seq = 0;

/** Header values must be printable ASCII; the transport's Base64 sentinel carries anything else. */
function headerValue(v: string): string {
  if (/^[\x20-\x7e]*$/.test(v)) return v;
  let bin = "";
  for (const b of new TextEncoder().encode(v)) bin += String.fromCharCode(b);
  return `=?base64?${btoa(bin)}?=`;
}

/**
 * Any error answer reads as a JSON-RPC error object, whatever produced it: a body like
 * {"error": "Too many requests"} from something in front of the server still shows its message.
 */
function normalise(raw: unknown, status: number): McpReply | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { error?: unknown };
  if (typeof r.error === "string") return { error: { code: status, message: r.error } };
  return raw as McpReply;
}

/**
 * One JSON-RPC request. `name` is the tool, for tools/call: the protocol wants it in a header too.
 * It gives up after WAIT_MS, or when `signal` aborts.
 */
export async function mcpRequest(method: string, params: Record<string, unknown> = {}, name?: string, signal?: AbortSignal): Promise<McpExchange> {
  const body = { jsonrpc: "2.0", id: ++seq, method, params: { ...params, _meta: META } };
  const headers: Record<string, string> = { "Content-Type": "application/json", "MCP-Protocol-Version": MCP_PROTOCOL, "Mcp-Method": method };
  if (name) headers["Mcp-Name"] = headerValue(name);
  const t0 = performance.now();
  const res = await fetch(`${API_BASE}/mcp`, { method: "POST", headers, body: JSON.stringify(body), signal: withTimeout(signal) });
  const ms = performance.now() - t0;
  const json = normalise(await res.json().catch(() => null), res.status);
  return { headers, body, status: res.status, ms, json };
}
