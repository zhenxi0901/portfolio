// A minimal client for this site's own MCP server (POST /mcp), in the stateless form of the
// protocol: no handshake and no session, every request describes itself.
import { API_BASE } from "@/lib/api";
import { MCP_PROTOCOL } from "@/content/agents";

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

/** One JSON-RPC request. `name` is the tool, for tools/call: the protocol wants it in a header too. */
export async function mcpRequest(method: string, params: Record<string, unknown> = {}, name?: string): Promise<McpExchange> {
  const body = { jsonrpc: "2.0", id: ++seq, method, params: { ...params, _meta: META } };
  const headers: Record<string, string> = { "Content-Type": "application/json", "MCP-Protocol-Version": MCP_PROTOCOL, "Mcp-Method": method };
  if (name) headers["Mcp-Name"] = name;
  const t0 = performance.now();
  const res = await fetch(`${API_BASE}/mcp`, { method: "POST", headers, body: JSON.stringify(body) });
  const ms = performance.now() - t0;
  const json = (await res.json().catch(() => null)) as McpReply | null;
  return { headers, body, status: res.status, ms, json };
}
