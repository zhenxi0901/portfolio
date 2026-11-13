"use client";

import { useState } from "react";
import { MCP_PROTOCOL, MCP_SERVER_NAME } from "@/content/agents";
import { SITE_URL } from "@/lib/site";
import { onTabKeys } from "@/lib/tabs";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/agents/copy-button";

const ENDPOINT = `${SITE_URL}/mcp`;

const WAYS = [
  {
    key: "claude-code",
    label: "Claude Code",
    note: "One command. Then ask it anything about my work, or run /mcp to see the tools.",
    code: `claude mcp add --transport http ${MCP_SERVER_NAME} ${ENDPOINT}`,
  },
  {
    key: "json",
    label: "JSON config",
    note: "For clients configured with a file, such as a project's .mcp.json. Some clients name the outer key differently; the URL is all that matters.",
    code: JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { type: "http", url: ENDPOINT } } }, null, 2),
  },
  {
    key: "curl",
    label: "curl",
    note: "No client at all: one JSON-RPC request per POST, nothing to set up first.",
    code: [
      `curl -s ${ENDPOINT} \\`,
      `  -H 'Content-Type: application/json' \\`,
      `  -H 'MCP-Protocol-Version: ${MCP_PROTOCOL}' -H 'Mcp-Method: tools/list' \\`,
      `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{`,
      `        "io.modelcontextprotocol/protocolVersion":"${MCP_PROTOCOL}",`,
      `        "io.modelcontextprotocol/clientCapabilities":{}}}}'`,
    ].join("\n"),
  },
] as const;

/** How to point a client at the server: the URL, then the same thing three ways. */
export function Connect() {
  const [i, setI] = useState(0);
  const way = WAYS[i];
  return (
    <div className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <p className="font-mono text-[11px] text-ink-3">the server · Streamable HTTP · no key</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <code className="break-all font-mono text-[15px] text-ink sm:text-base">{ENDPOINT}</code>
        <CopyButton text={ENDPOINT} label="Copy URL" />
      </div>

      <div role="tablist" aria-label="Ways to connect" onKeyDown={(e) => onTabKeys(e, WAYS.length, i, setI)} className="mt-6 flex gap-2 overflow-x-auto pb-1">
        {WAYS.map((w, k) => (
          <button
            key={w.key}
            type="button"
            role="tab"
            id={`connect-tab-${w.key}`}
            aria-selected={k === i}
            aria-controls="connect-panel"
            tabIndex={k === i ? 0 : -1}
            onClick={() => setI(k)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              k === i ? "border-accent-ink bg-surface-2 text-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
            )}
          >
            {w.label}
          </button>
        ))}
      </div>
      <div id="connect-panel" role="tabpanel" aria-labelledby={`connect-tab-${way.key}`} className="mt-3">
        <pre tabIndex={0} className="overflow-x-auto rounded-2xl border border-line bg-bg p-4 font-mono text-[13px] leading-relaxed text-ink">
          {way.code}
        </pre>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-[60ch] flex-1 basis-64 text-sm leading-relaxed text-ink-2">{way.note}</p>
          <CopyButton key={way.key} text={way.code} label="Copy" describedBy={`connect-tab-${way.key}`} />
        </div>
      </div>
    </div>
  );
}
