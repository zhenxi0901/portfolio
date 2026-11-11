"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CircleNotch } from "@phosphor-icons/react";
import { API_BASE } from "@/lib/api";
import { agentTools, MCP_PROTOCOL } from "@/content/agents";
import { cn } from "@/lib/utils";

type Field = { type?: string; description?: string; minimum?: number; maximum?: number; maxLength?: number };
type Schema = { properties?: Record<string, Field>; required?: string[] };
type LiveTool = { name: string; title?: string; description?: string; inputSchema?: Schema };
type Reply = {
  result?: { tools?: LiveTool[]; content?: { type: string; text?: string }[]; isError?: boolean };
  error?: { code: number; message: string };
};
type Exchange = { headers: Record<string, string>; body: unknown; status: number; ms: number; json: Reply | null };

const META = { "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL, "io.modelcontextprotocol/clientCapabilities": {} };

/** One JSON-RPC request to the site's MCP server, in the stateless form: no handshake, no session. */
async function rpc(id: number, method: string, params: Record<string, unknown>, name?: string): Promise<Exchange> {
  const body = { jsonrpc: "2.0", id, method, params: { ...params, _meta: META } };
  const headers: Record<string, string> = { "Content-Type": "application/json", "MCP-Protocol-Version": MCP_PROTOCOL, "Mcp-Method": method };
  if (name) headers["Mcp-Name"] = name;
  const t0 = performance.now();
  const res = await fetch(`${API_BASE}/mcp`, { method: "POST", headers, body: JSON.stringify(body) });
  const ms = performance.now() - t0;
  const json = (await res.json().catch(() => null)) as Reply | null;
  return { headers, body, status: res.status, ms, json };
}

function startArgs(name: string): Record<string, string> {
  const example = agentTools.find((t) => t.name === name)?.example ?? {};
  return Object.fromEntries(Object.entries(example).map(([k, v]) => [k, String(v)]));
}

const isNumber = (f: Field) => f.type === "integer" || f.type === "number";

/** A small MCP client in the page: lists the server's tools, then calls the one you pick. */
export function Console() {
  const [live, setLive] = useState<LiveTool[] | null>(null);
  const [listed, setListed] = useState<"loading" | "live" | "offline">("loading");
  const [name, setName] = useState(agentTools[0].name);
  const [args, setArgs] = useState<Record<string, string>>(() => startArgs(agentTools[0].name));
  const [busy, setBusy] = useState(false);
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    let alive = true;
    rpc(++seq.current, "tools/list", {})
      .then((x) => {
        if (!alive) return;
        const tools = x.json?.result?.tools;
        if (tools?.length) {
          setLive(tools);
          setListed("live");
        } else setListed("offline");
      })
      .catch(() => alive && setListed("offline"));
    return () => {
      alive = false;
    };
  }, []);

  // Until the server answers, the page shows the names it was built with.
  const tools: LiveTool[] = live ?? agentTools.map((t) => ({ name: t.name, description: t.summary }));
  const tool = tools.find((t) => t.name === name) ?? tools[0];
  const fallback: Record<string, Field> = Object.fromEntries(Object.keys(startArgs(tool.name)).map((k) => [k, { type: "string" }]));
  const fields = Object.entries(tool.inputSchema?.properties ?? fallback);

  const pick = (next: string) => {
    setName(next);
    setArgs(startArgs(next));
    setExchange(null);
    setFailed(null);
  };

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    const typed: Record<string, string | number> = {};
    for (const [key, field] of fields) {
      const v = (args[key] ?? "").trim();
      if (v !== "") typed[key] = isNumber(field) ? Number(v) : v;
    }
    try {
      setExchange(await rpc(++seq.current, "tools/call", { name: tool.name, arguments: typed }, tool.name));
    } catch {
      setExchange(null);
      setFailed("The request did not reach the server. Check your connection and try again.");
    }
    setBusy(false);
  };

  const text = exchange?.json?.result?.content?.find((c) => c.type === "text")?.text;
  const rejected = exchange?.json?.result?.isError === true;
  const error = exchange?.json?.error;
  const sent = exchange
    ? ["POST /mcp", ...Object.entries(exchange.headers).map(([k, v]) => `${k}: ${v}`), "", JSON.stringify(exchange.body)].join("\n")
    : "";

  return (
    <div className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <p className="font-mono text-[11px] text-ink-3" aria-live="polite">
        {listed === "live" && `${tools.length} tools · names, descriptions and inputs read from tools/list just now`}
        {listed === "loading" && "asking the server for its tools…"}
        {listed === "offline" && "the server did not answer tools/list · showing the names this page was built with"}
      </p>

      <div className="mt-4 grid gap-5 lg:grid-cols-[15rem_1fr]">
        <div role="tablist" aria-label="Tools" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {tools.map((t) => (
            <button
              key={t.name}
              type="button"
              role="tab"
              id={`tool-tab-${t.name}`}
              aria-selected={t.name === tool.name}
              aria-controls="tool-panel"
              onClick={() => pick(t.name)}
              className={cn(
                "shrink-0 rounded-2xl border px-3.5 py-2.5 text-left transition-colors",
                t.name === tool.name ? "border-accent-ink bg-surface-2 text-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
              )}
            >
              <span className="block font-mono text-[13px]">{t.name}</span>
              {t.title && <span className="mt-0.5 hidden text-xs text-ink-3 lg:block">{t.title}</span>}
            </button>
          ))}
        </div>

        <div id="tool-panel" role="tabpanel" aria-labelledby={`tool-tab-${tool.name}`} className="min-w-0">
          <p className="text-[15px] leading-relaxed text-ink-2">{tool.description}</p>

          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            {fields.map(([key, field]) => {
              const required = tool.inputSchema?.required?.includes(key) ?? true;
              return (
                <label key={`${tool.name}-${key}`} className="block">
                  <span className="font-mono text-xs text-ink-2">
                    {key}
                    {!required && <span className="text-ink-3"> · optional</span>}
                  </span>
                  <input
                    type={isNumber(field) ? "number" : "text"}
                    min={field.minimum}
                    max={field.maximum}
                    maxLength={field.maxLength}
                    required={required}
                    value={args[key] ?? ""}
                    onChange={(e) => setArgs((a) => ({ ...a, [key]: e.target.value }))}
                    className={cn(
                      "mt-1 block h-11 rounded-[14px] border border-line-strong bg-bg px-3.5 text-[15px] text-ink",
                      isNumber(field) ? "w-28" : "w-full",
                    )}
                  />
                  {field.description && <span className="mt-1 block text-xs text-ink-3">{field.description}</span>}
                </label>
              );
            })}
            {fields.length === 0 && <p className="font-mono text-xs text-ink-3">this tool takes no arguments</p>}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-[transform,filter] hover:brightness-95 active:scale-[0.97] disabled:opacity-60"
            >
              {busy ? <CircleNotch size={16} className="animate-spin" aria-hidden /> : <ArrowRight size={16} aria-hidden />}
              Call {tool.name}
            </button>
          </form>

          <div aria-live="polite">
            {failed && <p className="mt-4 text-sm text-critical">{failed}</p>}
            {exchange && (
              <div className="mt-5 space-y-3">
                <div>
                  <p className="font-mono text-[11px] text-ink-3">what your browser sent</p>
                  <pre tabIndex={0} className="mt-1 overflow-x-auto rounded-2xl border border-line bg-bg p-4 font-mono text-xs leading-relaxed text-ink-2">
                    {sent}
                  </pre>
                </div>
                <div>
                  <p className="font-mono text-[11px] text-ink-3">
                    what the server answered · HTTP {exchange.status} · {Math.round(exchange.ms)} ms
                  </p>
                  <div className="mt-1 rounded-2xl border-l-4 border-accent-ink bg-[color-mix(in_oklab,var(--accent)_10%,var(--surface))] px-5 py-4">
                    {error && <p className="text-sm font-medium text-critical">{error.message}</p>}
                    {rejected && <p className="text-sm font-medium text-critical">The tool rejected its input:</p>}
                    {text && <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">{text}</p>}
                    {!error && !text && <p className="text-sm text-ink-2">An empty answer.</p>}
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer font-mono text-xs text-ink-3 hover:text-ink">the whole JSON-RPC response</summary>
                    <pre tabIndex={0} className="mt-2 max-h-96 overflow-auto rounded-2xl border border-line bg-bg p-4 font-mono text-xs leading-relaxed text-ink-2">
                      {JSON.stringify(exchange.json, null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
