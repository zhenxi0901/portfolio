import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { ArticleShell, Bullets, Part, StatRow } from "@/components/article/article-shell";
import { Connect } from "@/components/agents/connect";
import { Console } from "@/components/agents/console";
import { TerminalCard } from "@/components/agents/terminal-card";
import { OpenTerminal } from "@/components/site/open-terminal";
import { agentTools, MCP_PROTOCOL } from "@/content/agents";
import { REPO_BLOB } from "@/content/decisions";
import { markdownPages } from "@/lib/markdown";
import { pageMetadata } from "@/lib/page-metadata";
import { SITE_URL } from "@/lib/site";

export const metadata = pageMetadata({
  title: "For agents: this site is an MCP server",
  description:
    "Point Claude, Cursor or any MCP client at one URL and ask about my work. Five read-only tools over the site's own facts and live numbers, plus llms.txt, Markdown copies of every page and a card for curl.",
  path: "/agents",
});

const host = new URL(SITE_URL).host;

const texts = [
  { href: "/llms.txt", label: "/llms.txt", what: "What the site is and where each page lives as Markdown, in the llmstxt.org format." },
  { href: "/llms-full.txt", label: "/llms-full.txt", what: "Every fact the tools answer from, in one file." },
  { href: "/md/work/gke.md", label: "/md/…", what: `A Markdown copy of each of ${markdownPages.length} pages: case studies, write-ups, postmortems and the decision records. Each HTML page links to its copy.` },
  { href: "/knowledge.json", label: "/knowledge.json", what: "The same facts as JSON, with the section of the site each one belongs to." },
  { href: "/api/slo", label: "/api/slo", what: "Availability and error budget from Google Cloud uptime checks, as JSON." },
  { href: "/status/feed.xml", label: "/status/feed.xml", what: "Incidents as an Atom feed." },
  { href: "/.well-known/security.txt", label: "/.well-known/security.txt", what: "Where to report a security problem (RFC 9116)." },
];

const built = [
  "No sessions. Each request stands alone, so any Cloud Run instance can answer it and scaling to zero loses nothing.",
  `Two protocol eras. It speaks the stateless ${MCP_PROTOCOL} revision, and still answers the initialize handshake that older clients open with.`,
  "No model on my side. The tools return the site's own text and numbers; the agent that called them does the reasoning with its own model.",
  "Read-only, and written against Go's standard library: about 500 lines for the protocol, no SDK. Browser origins are checked, bodies are capped at 64 KiB, and each client gets 60 requests a minute.",
  "Tested like the rest of the site: every release calls a tool in both protocol eras before it takes traffic.",
];

const sources = [
  { label: "api/internal/mcp/mcp.go: the protocol", path: "api/internal/mcp/mcp.go" },
  { label: "api/internal/server/mcptools.go: the five tools", path: "api/internal/server/mcptools.go" },
  { label: "web/src/lib/markdown.ts: llms.txt and the Markdown copies", path: "web/src/lib/markdown.ts" },
];

export default function AgentsPage() {
  return (
    <ArticleShell back={{ href: "/about#ask", label: "Ask me" }} wide>
      <p className="mt-8 font-mono text-xs text-ink-3">
        {host}/mcp · Model Context Protocol {MCP_PROTOCOL}
      </p>
      <h1 className="mt-4 max-w-[18ch] text-[clamp(2.25rem,5.5vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
        Ask my site with your own agent.
      </h1>
      <p className="mt-6 max-w-[64ch] text-lg leading-relaxed text-ink-2">
        This portfolio is also an MCP server. Add one URL to Claude, Cursor or any client that speaks the Model Context Protocol, and your agent can
        answer questions about my work from the site&apos;s own facts and read its live reliability numbers. No key, nothing to install, read-only.
      </p>

      <StatRow
        stats={[
          { value: String(agentTools.length), label: "read-only tools over the site's facts and live numbers" },
          { value: "2", label: "protocol eras served: stateless 2026 and the older handshake" },
          { value: "0", label: "models on my side: your agent brings its own" },
        ]}
      />

      <Part title="Connect" aside="one URL">
        <Connect />
      </Part>

      <Part title="Try it here" aside="real requests from your browser">
        <p className="mb-5 max-w-[68ch] text-[15px] leading-relaxed text-ink-2">
          This is a small MCP client. It asked the server for its tools when the page loaded; pick one and call it to see the request and the answer
          an agent would get.
        </p>
        <Console />
        <noscript>
          <ul className="mt-4 space-y-2 text-[15px] text-ink-2">
            {agentTools.map((t) => (
              <li key={t.name}>
                <span className="font-mono text-ink">{t.name}</span>: {t.summary}
              </li>
            ))}
          </ul>
        </noscript>
      </Part>

      <Part title="No agent? Use curl" aside="the home page answers terminals in text">
        <p className="mb-5 max-w-[68ch] text-[15px] leading-relaxed text-ink-2">
          Ask for the home page from a terminal and the server sends a text card with the commit that is live, its uptime and how it has been
          shipping. A browser, or anything that asks for HTML, gets the page.
        </p>
        <TerminalCard />
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <OpenTerminal label="Or use the terminal on this site" />
          <p className="text-sm text-ink-3">The same API from a shell in the page: status, slo, ask, mcp, curl.</p>
        </div>
      </Part>

      <Part title="For crawlers and readers" aside="the same content as plain text">
        <ul className="divide-y divide-line rounded-3xl border border-line bg-surface">
          {texts.map((t) => (
            <li key={t.href} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-baseline sm:gap-6 sm:p-5">
              <a href={t.href} className="w-56 shrink-0 font-mono text-sm text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent-ink">
                {t.label}
              </a>
              <span className="flex-1 text-[15px] leading-relaxed text-ink-2">{t.what}</span>
            </li>
          ))}
        </ul>
      </Part>

      <Part title="How it is built">
        <Bullets items={built} />
        <ul className="mt-6 flex flex-wrap gap-2">
          {sources.map((s) => (
            <li key={s.path}>
              <a
                href={`${REPO_BLOB}${s.path}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
              >
                {s.label}
                <ArrowUpRight size={12} aria-hidden />
              </a>
            </li>
          ))}
          <li>
            <a
              href="/decisions#mcp-without-sessions-or-a-model"
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
            >
              ADR 10: why it has no sessions and no model
            </a>
          </li>
        </ul>
      </Part>
    </ArticleShell>
  );
}
