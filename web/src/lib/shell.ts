// The command engine behind the site's terminal (components/site/terminal.tsx). Nothing here is a
// mock: `status`, `slo`, `ask`, `mcp` and `curl` call this site's real API, and `cat` reads the same
// Markdown copies that /llms.txt points agents at. The "files" are the site's own pages.
import { agentTools } from "@/content/agents";
import { postmortems } from "@/content/postmortems";
import { cases, profile } from "@/content/profile";
import { posts } from "@/content/writing";
import { parseAnsi } from "@/lib/ansi";
import { api, ApiError, API_BASE } from "@/lib/api";
import { mcpRequest } from "@/lib/mcp-client";
import { WAIT_MS, isTimeout, withTimeout } from "@/lib/signal";
import { SITE_URL } from "@/lib/site";

/** A run of text. `href` makes it a link; `run` makes it a button that types that command. */
export type Seg = { text: string; cls?: string; href?: string; run?: string };
export type Line = Seg[];

/** What a command may do besides print. */
export type ShellEnv = {
  cwd: string;
  history: string[];
  /** Aborts when the visitor presses Ctrl+C. */
  signal: AbortSignal;
  theme: () => string;
  setCwd: (dir: string) => void;
  setTheme: (theme: "light" | "dark") => void;
  clear: () => void;
  close: () => void;
  navigate: (path: string) => void;
  startTour: () => void;
};

const DIM = "text-ink-3";
const BOLD = "font-semibold text-ink";
const ACCENT = "text-accent-ink";
const ERR = "text-critical";

const t = (text: string, cls?: string): Seg => ({ text, cls });
const line = (...segs: (Seg | string)[]): Line => segs.map((s) => (typeof s === "string" ? { text: s } : s));
const dim = (text: string): Line => [t(text, DIM)];
const fail = (text: string): Line[] => [[t(text, ERR)]];
const cmd = (command: string): Seg => ({ text: command, run: command, cls: ACCENT });
const link = (text: string, href: string): Seg => ({ text, href });
const row = (label: string, ...value: (Seg | string)[]): Line => line(t(label.padEnd(10), DIM), ...value);
/** Spaces between a button and what follows, kept outside the button so its underline stops at the word. */
const gap = (used: number, width: number): Seg => t(" ".repeat(Math.max(2, width - used)));
/** The arguments that are not options: `ls -la work` lists work. */
const operands = (args: string[]) => args.filter((a) => !a.startsWith("-"));

// ── The "file system": directories of the site's pages ───────────────────────────────────────────

type Entry = { name: string; title: string };
const DIRS: Record<string, Entry[]> = {
  work: cases.map((c) => ({ name: c.id, title: c.title })),
  writing: posts.map((p) => ({ name: p.slug, title: p.title })),
  postmortems: postmortems.map((p) => ({ name: p.slug, title: p.title })),
};
const ROOT_FILES: Entry[] = [
  { name: "about", title: "Who this is" },
  { name: "decisions", title: "Why this site is built the way it is" },
];
/** Pages that are not files: `open` reaches them. */
const PAGES: Record<string, string> = {
  home: "/",
  status: "/status",
  changelog: "/changelog",
  decisions: "/decisions",
  agents: "/agents",
  evidence: "/evidence",
  oncall: "/oncall",
};
const CURL_PATHS = ["/", "/api/status", "/api/slo", "/api/card.txt", "/llms.txt", "/llms-full.txt", "/knowledge.json", "/delivery.json", "/.well-known/security.txt"];

const stripMd = (name: string) => name.replace(/\.md$/, "");

/** Resolves a path typed at the prompt against the current directory: "" is the home directory. */
export function resolvePath(cwd: string, arg: string): string {
  // pwd prints /home/visitor/..., so that names home as well as "~" and "/" do.
  const a = arg.replace(/^\/home\/visitor(?=\/|$)/, "~");
  const absolute = a.startsWith("/") || a.startsWith("~");
  const parts = absolute ? [] : cwd.split("/").filter(Boolean);
  for (const part of a.replace(/^~/, "").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

type Found = { kind: "dir"; dir: string } | { kind: "file"; dir: string; name: string } | null;

/**
 * A key of one of these tables, typed by a visitor. Only the table's own keys count: a plain lookup
 * also finds what every object inherits, so "constructor" was a command, a directory and a page.
 */
function own<T>(table: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

function find(path: string): Found {
  if (path === "" || own(DIRS, path)) return { kind: "dir", dir: path };
  const [head, ...rest] = path.split("/");
  if (rest.length === 0) return ROOT_FILES.some((f) => f.name === stripMd(head)) ? { kind: "file", dir: "", name: stripMd(head) } : null;
  const name = stripMd(rest.join("/"));
  return own(DIRS, head)?.some((e) => e.name === name) ? { kind: "file", dir: head, name } : null;
}

export const promptFor = (cwd: string) => `visitor@zhenxi:~${cwd ? "/" + cwd : ""}$`;
/** The prompt on a phone, where every character of the input line counts. */
export const shortPromptFor = (cwd: string) => `~${cwd ? "/" + cwd : ""}$`;

// ── Formatting helpers ───────────────────────────────────────────────────────────────────────────

// Rounded down, like every other availability figure on the site.
const pct = (x: number, digits: number) => `${(Math.floor(x * 100 * 10 ** digits + 1e-6) / 10 ** digits).toFixed(digits)}%`;
const ago = (seconds: number) => (seconds < 90 ? `${Math.round(seconds)} s` : seconds < 5400 ? `${Math.round(seconds / 60)} min` : `${(seconds / 3600).toFixed(1)} h`);

/** Wraps prose at word boundaries so long answers read as paragraphs, not one scrolling line. */
function wrap(text: string, width = 88): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let current = "";
    for (const word of para.split(" ")) {
      if (current && current.length + word.length + 1 > width) {
        out.push(current);
        current = word;
      } else current = current ? `${current} ${word}` : word;
    }
    out.push(current);
  }
  return out;
}

function markdownLines(md: string): Line[] {
  let code = false;
  return md
    .trimEnd()
    .split("\n")
    .flatMap((raw): Line[] => {
      if (raw.startsWith("```")) {
        code = !code;
        return [[t(raw, DIM)]];
      }
      // Code keeps its indentation, and a "#" in it is a comment, not a heading.
      if (code) return [[t(raw)]];
      if (raw.startsWith("#")) return [[t(raw, BOLD)]];
      if (raw.startsWith(">")) return wrap(raw).map((l) => [t(l, ACCENT)]);
      return wrap(raw).map((l) => [t(l)]);
    });
}

const MAX_LINES = 70;
const MAX_CHARS = 6000;
/** At most 70 lines and 6,000 characters, so a minified file cannot fill the screen with one line. */
function capped(lines: Line[], more: string): Line[] {
  const out: Line[] = [];
  let chars = 0;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].map((s) => s.text).join("");
    if (out.length === MAX_LINES || chars + text.length > MAX_CHARS) {
      let rest = lines.length - i;
      // A first line longer than the limit (a minified file) is shown cut, not dropped.
      if (out.length === 0) {
        out.push([t(text.slice(0, MAX_CHARS))]);
        rest -= 1;
      }
      return [...out, dim(`… cut here${rest > 0 ? `, ${rest} more line${rest === 1 ? "" : "s"}` : ""}. ${more}`)];
    }
    out.push(lines[i]);
    chars += text.length;
  }
  return out;
}

// ── Network ──────────────────────────────────────────────────────────────────────────────────────

/** API routes come from API_BASE (another origin under `next dev`); the site's files from this page's. */
const urlFor = (path: string) => (path.startsWith("/api/") || path === "/mcp" ? API_BASE : "") + path;
const BINARY = /^(image|audio|video|font)\/|^application\/(octet-stream|wasm|pdf|zip|gzip)/;

type Fetched = { status: number; type: string; body: string; bytes: number; binary: boolean };

/**
 * Fetches a file on this site. `sniff` is for curl, which can be pointed at anything: a binary
 * type is counted, not printed. Commands that read a file they know is text (cat's Markdown,
 * deploys' JSON) read it as text whatever a server in between labels it.
 */
async function getText(path: string, signal: AbortSignal, sniff = false): Promise<Fetched> {
  const res = await fetch(urlFor(path), { headers: { Accept: "text/plain, application/json, */*" }, signal: withTimeout(signal) });
  const type = res.headers.get("content-type") ?? "";
  if (sniff && BINARY.test(type)) return { status: res.status, type, body: "", bytes: (await res.arrayBuffer()).byteLength, binary: true };
  const body = await res.text();
  return { status: res.status, type, body, bytes: body.length, binary: false };
}

// curl's options that take a value: that value is not the URL.
const CURL_VALUE_FLAGS = new Set(["-H", "--header", "-X", "--request", "-d", "--data", "--data-raw", "-o", "--output", "-A", "--user-agent", "-e", "--referer", "-u", "--user", "-b", "--cookie", "-w", "--write-out", "-m", "--max-time"]);

function curlTarget(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (CURL_VALUE_FLAGS.has(args[i])) i++;
    else if (!args[i].startsWith("-")) return args[i];
  }
  return undefined;
}

// ── Commands ─────────────────────────────────────────────────────────────────────────────────────

type Command = { summary: string; usage?: string; hidden?: boolean; run: (args: string[], env: ShellEnv, raw: string) => Promise<Line[]> | Line[] };

const commands: Record<string, Command> = {
  help: {
    summary: "this list",
    run: () => [
      line(t("Read", BOLD)),
      ...["whoami", "ls", "cat", "cd", "open"].map(helpRow),
      line(""),
      line(t("Live, from this site's API", BOLD)),
      ...["status", "slo", "deploys", "ask", "mcp", "curl", "neofetch"].map(helpRow),
      line(""),
      line(t("Shell", BOLD)),
      ...["theme", "tour", "contact", "history", "clear", "exit"].map(helpRow),
      line(""),
      dim("Tab completes, ↑ and ↓ walk the history, Ctrl+C cancels, Esc closes. The green words are buttons."),
    ],
  },
  whoami: {
    summary: "who built this",
    run: () => [
      line(t(profile.name, BOLD), t(`  ${profile.role}`, DIM)),
      ...wrap(profile.intro).map((l) => line(l)),
      line(t(`${profile.availability}. Based in ${profile.location}.`, ACCENT)),
      line(""),
      row("email", link(profile.email, `mailto:${profile.email}`)),
      row("github", link(profile.github.replace("https://", ""), profile.github)),
      row("linkedin", link(profile.linkedin.replace("https://www.", "").replace(/\/$/, ""), profile.linkedin)),
      line(""),
      line(t("Next: ", DIM), cmd("ls work"), t("  ·  ", DIM), cmd("ask what do you work on"), t("  ·  ", DIM), cmd("status")),
    ],
  },
  ls: {
    summary: "list a directory: work, writing, postmortems",
    usage: "ls [dir]",
    run: (args, env) => {
      const arg = operands(args)[0];
      const found = find(resolvePath(env.cwd, arg ?? ""));
      if (!found) return fail(`ls: ${arg}: no such file or directory`);
      if (found.kind === "file") return [line(`${found.name}.md`)];
      if (found.dir === "")
        return [
          ...Object.keys(DIRS).map((d) => line({ text: `${d}/`, run: `ls ${d}`, cls: ACCENT }, t(`  ${DIRS[d].length} entries`, DIM))),
          ...ROOT_FILES.map((f) => line({ text: `${f.name}.md`, run: `cat ~/${f.name}.md`, cls: ACCENT }, t(`  ${f.title}`, DIM))),
        ];
      const entries = DIRS[found.dir];
      const width = Math.max(...entries.map((e) => e.name.length)) + 5;
      return entries.map((e) => line({ text: `${e.name}.md`, run: `cat ~/${found.dir}/${e.name}.md`, cls: ACCENT }, gap(e.name.length + 3, width), t(e.title, DIM)));
    },
  },
  cd: {
    summary: "change directory",
    usage: "cd [dir]",
    run: (args, env) => {
      const arg = operands(args)[0];
      const found = find(resolvePath(env.cwd, arg ?? "~"));
      if (!found) return fail(`cd: ${arg}: no such directory`);
      if (found.kind === "file") return fail(`cd: ${arg}: not a directory. Try: cat ${arg}`);
      env.setCwd(found.dir);
      return [];
    },
  },
  pwd: { summary: "print the directory", hidden: true, run: (_, env) => [line(`/home/visitor${env.cwd ? "/" + env.cwd : ""}`)] },
  cat: {
    summary: "print a page as Markdown, e.g. cat work/gke.md",
    usage: "cat <file>",
    run: async (args, env) => {
      const arg = operands(args)[0];
      if (!arg) return fail("cat: which file? Try: ls");
      const found = find(resolvePath(env.cwd, arg));
      if (!found) return fail(`cat: ${arg}: no such file. Try: ls`);
      if (found.kind === "dir") return fail(`cat: ${arg}: is a directory. Try: ls ${found.dir || "~"}`);
      if (found.dir === "" && found.name === "about") return commands.whoami.run([], env, "whoami");
      // The same Markdown copies that /llms.txt lists for AI agents.
      const path = `/md/${found.dir ? found.dir + "/" : ""}${found.name}.md`;
      const res = await getText(path, env.signal);
      if (res.status !== 200) return fail(`cat: ${path}: HTTP ${res.status}`);
      const page = found.dir ? `${found.dir}/${found.name}` : found.name;
      return [...capped(markdownLines(res.body), `The page has the rest.`), line(""), line(t("The page, with its working model: ", DIM), cmd(`open ${page}`))];
    },
  },
  open: {
    summary: "go to a page: status, agents, evidence, work/gke…",
    usage: "open <page>",
    run: (args, env) => {
      const target = stripMd(operands(args)[0] ?? "");
      if (!target)
        return [line(t("Pages: ", DIM), ...Object.keys(PAGES).flatMap((p, i) => [...(i ? [t("  ")] : []), cmd(`open ${p}`)])), dim("Or any file: open work/gke")];
      const key = target.replace(/^\//, "");
      // "/", "~" and about.md all mean the home page: about.md is who the site is about.
      const page = own(PAGES, key) ?? (key === "" || key === "~" || key === "about" ? "/" : undefined);
      const found = page ? null : find(resolvePath(env.cwd, target));
      const path = page ?? (found?.kind === "file" ? (found.dir ? `/${found.dir}/${found.name}` : found.name === "about" ? "/" : `/${found.name}`) : null);
      if (!path) return fail(`open: ${target}: no such page. Try: open`);
      env.navigate(path);
      return [dim(`opening ${path} …`)];
    },
  },
  status: {
    summary: "what is running right now",
    run: async () => {
      const s = await api.status();
      return [
        row("commit", t(s.commit.slice(0, 7), ACCENT), t(`  ${s.version}`, DIM)),
        row("where", s.region === "local" ? "a local copy, not the live site" : `Cloud Run, ${s.region}`),
        row("instance", `up ${ago(s.uptime_seconds)}, ${s.requests_total.toLocaleString("en-GB")} requests served`),
        row("latency", `p50 ${s.latency_ms.p50.toFixed(2)} ms · p95 ${s.latency_ms.p95.toFixed(2)} ms · p99 ${s.latency_ms.p99.toFixed(2)} ms`),
        row("runtime", `${s.go_version}, ${s.goroutines} goroutines, ${s.heap_mb.toFixed(1)} MB heap`),
        line(""),
        line(t("Is it meeting its objective? ", DIM), cmd("slo")),
      ];
    },
  },
  slo: {
    summary: "availability and error budget, measured from outside",
    run: async () => {
      const r = await api.slo();
      if (!r.available) return [dim(`No availability figures here: ${r.reason ?? "no reason given"}`)];
      // One block per day of the window: full when every check that day passed.
      const days: Seg[] = r.days.map((d) => (d.checks === 0 ? t("·", DIM) : d.passed === d.checks ? t("█", ACCENT) : t("▄", "text-p-ai")));
      return [
        row("objective", `${pct(r.target, 1)} over ${r.window_days} days`),
        row("measured", t(pct(r.availability, 3), ACCENT), `  ${r.passed.toLocaleString("en-GB")} of ${r.checks.toLocaleString("en-GB")} uptime checks passed`),
        row("budget", `${pct(Math.max(r.budget_remaining, 0), 1)} left of ${r.budget_minutes.toFixed(1)} minutes; ${r.downtime_minutes.toFixed(1)} minutes spent`),
        row("releases", r.releases === "frozen" ? t("frozen: reliability fixes only", "text-p-ai") : (r.releases ?? "unknown")),
        row("by day", ...days),
        ...(r.stale ? [row("reading", t(`last good reading ${r.updated.slice(0, 16).replace("T", " ")} UTC; Cloud Monitoring is not answering`, "text-p-ai"))] : []),
        line(""),
        dim("Google Cloud uptime checks request the site every minute from Singapore, Belgium and Oregon."),
      ];
    },
  },
  deploys: {
    summary: "how the site ships: DORA numbers from its own pipeline",
    run: async (_, env) => {
      const res = await getText("/delivery.json", env.signal);
      if (res.status !== 200) return fail(`deploys: /delivery.json: HTTP ${res.status}`);
      let d: {
        generated: string;
        windowDays: number;
        deploys: number;
        leadTimeMinutes: { median: number | null };
        changeFailureRate: number | null;
        safeguards: { lastDrill: { ended: string; restoreSeconds: number | null } | null };
        head: { sha: string; title: string } | null;
      };
      try {
        d = JSON.parse(res.body);
      } catch {
        return fail("deploys: /delivery.json came back, but not as JSON. Every release is listed at: open changelog");
      }
      const drill = d.safeguards.lastDrill;
      return [
        row("deploys", `${d.deploys} in the ${d.windowDays} days to ${d.generated.slice(0, 10)}`),
        row("lead time", d.leadTimeMinutes.median == null ? "n/a" : `${d.leadTimeMinutes.median} min, median, from commit to live`),
        row("failures", d.changeFailureRate == null ? "n/a" : `${Math.round(d.changeFailureRate * 100)}% of changes`),
        ...(drill ? [row("drill", `rollback rehearsed ${drill.ended.slice(0, 10)}${drill.restoreSeconds != null ? `: traffic back in ${drill.restoreSeconds} s` : ""}`)] : []),
        ...(d.head ? [row("built from", t(d.head.sha, ACCENT), `  ${d.head.title}`)] : []),
        line(""),
        line(t("Every release: ", DIM), cmd("open changelog")),
      ];
    },
  },
  ask: {
    summary: "ask about my work; answers come from the site's facts",
    usage: "ask <question>",
    run: async (args) => {
      const question = args.join(" ").trim();
      if (question.length < 3) return [line(t("Ask what? For example: ", DIM), cmd("ask how did you cut the cloud bill"))];
      const r = await api.ask(question);
      return [
        ...wrap(r.answer).map((l) => line(l)),
        line(""),
        ...(r.sources.length ? [line(t("sources   ", DIM), r.sources.map((s) => s.title).join(" · "))] : []),
        dim(`${r.mode === "llm" ? "LLM, grounded in retrieved facts" : "retrieval (BM25)"} · ${r.trace ? `${r.trace.total_ms.toFixed(2)} ms in the server` : `${r.latency_ms} ms`}${r.cached ? ", from cache" : ""}`),
      ];
    },
  },
  mcp: {
    summary: "talk to the site's MCP server",
    usage: "mcp tools|call",
    run: async (args, env) => {
      const [sub, name, ...rest] = args;
      if (sub === "tools") {
        const x = await mcpRequest("tools/list", {}, undefined, env.signal);
        const tools = x.json?.result?.tools ?? [];
        if (!tools.length) return fail(`mcp: tools/list: HTTP ${x.status}${x.json?.error ? `: ${x.json.error.message}` : ""}`);
        const width = Math.max(...tools.map((tool) => tool.name.length)) + 3;
        return [
          ...tools.map((tool) => line({ text: tool.name, cls: ACCENT, run: `mcp call ${tool.name}${exampleArgs(tool.name)}` }, gap(tool.name.length, width), t(tool.title ?? "", DIM))),
          line(""),
          dim(`POST /mcp · tools/list · HTTP ${x.status} · ${Math.round(x.ms)} ms. To use it from your own agent: open agents`),
        ];
      }
      if (sub === "call" && name) {
        const x = await mcpRequest("tools/call", { name, arguments: toolArgs(name, rest) }, name, env.signal);
        const text = x.json?.result?.content?.find((c) => c.type === "text")?.text;
        const problem = x.json?.error?.message;
        const tone = x.json?.result?.isError || problem || x.status >= 400 ? ERR : undefined;
        return [
          ...capped(wrap(problem ?? text ?? `No answer in the reply (HTTP ${x.status}).`).map((l) => [t(l, tone)]), "The console on the agents page shows everything."),
          line(""),
          dim(`POST /mcp · tools/call ${name} · HTTP ${x.status} · ${Math.round(x.ms)} ms`),
        ];
      }
      return [line(t("usage: ", DIM), cmd("mcp tools"), t("  ·  ", DIM), cmd("mcp call ask how did you cut the cloud bill"), t("  ·  ", DIM), cmd("mcp call get_status"))];
    },
  },
  curl: {
    summary: "GET a path on this site, e.g. curl /api/slo",
    usage: "curl <path>",
    run: async (args, env) => {
      const target = curlTarget(args);
      if (!target) return [line(t("Try: ", DIM), ...CURL_PATHS.slice(0, 5).flatMap((p, i) => [...(i ? [t("  ")] : []), cmd(`curl ${p}`)]))];
      // Resolved as a browser would, so "//host/x" and full URLs are judged by where they really go.
      const here = typeof window === "undefined" ? SITE_URL : window.location.origin;
      let url: URL;
      try {
        url = new URL(/^(https?:)?\/\//.test(target) || target.startsWith("/") ? target : "/" + target, here);
      } catch {
        return fail(`curl: ${target}: not a URL`);
      }
      if (url.origin !== here && url.origin !== new URL(SITE_URL).origin)
        return fail("curl: this terminal only reaches this site. The page's content security policy allows nothing else, on purpose.");
      const path = url.pathname + url.search;
      // The server tells browsers and terminals apart by who asks; a browser cannot pretend, so
      // the home page's terminal answer is fetched from its own address.
      const home = url.pathname === "/";
      const res = await getText(home ? "/api/card.txt" : path, env.signal, true);
      const note = dim(`HTTP ${res.status} · ${res.type.split(";")[0] || "unknown type"}${home ? " · what a real curl gets for the home page" : ""}`);
      if (home && res.status === 200) return [...res.body.trimEnd().split("\n").map((l): Line => parseAnsi(l).map((r) => ({ text: r.text, cls: r.cls }))), line(""), note];
      if (res.binary) return [line(t(`Binary, ${res.bytes.toLocaleString("en-GB")} bytes. In the browser: `, DIM), link(path, path)), note];
      if (res.type.includes("html")) return [dim(`An HTML page of ${res.body.length.toLocaleString("en-GB")} characters. It reads better in the browser:`), line(cmd(`open ${url.pathname.slice(1) || "home"}`)), note];
      let body = res.body;
      if (res.type.includes("json")) {
        try {
          body = JSON.stringify(JSON.parse(body), null, 2);
        } catch {
          // Not JSON after all: print it as it came.
        }
      }
      return [...capped(body.trimEnd().split("\n").map((l) => line(l)), "Run it in a real terminal for the rest."), line(""), note];
    },
  },
  neofetch: {
    summary: "the site at a glance",
    run: async () => {
      const s = await api.status();
      const logo = ["  ██╗     ███████╗ ", "  ██║     ╚══███╔╝ ", "  ██║       ███╔╝  ", "  ██║      ███╔╝   ", "  ███████╗███████╗ ", "  ╚══════╝╚══════╝ "];
      const info: [string, string][] = [
        ["host", s.region === "local" ? "a local copy" : `Cloud Run, ${s.region}`],
        ["kernel", `${s.go_version}, standard library net/http`],
        ["uptime", `${ago(s.uptime_seconds)} (this instance; it scales to zero)`],
        ["commit", s.commit.slice(0, 7)],
        ["packages", "Next.js 16, React 19, Tailwind 4, three.js"],
        ["memory", `${s.heap_mb.toFixed(1)} MB heap of 256 MiB`],
      ];
      return [line(t(`  visitor@${new URL(SITE_URL).host}`, BOLD)), ...logo.map((l, i) => line(t(l, ACCENT), t(info[i][0].padEnd(9), DIM), info[i][1]))];
    },
  },
  theme: {
    summary: "light or dark",
    usage: "theme light|dark",
    run: (args, env) => {
      const want = args[0];
      if (want && want !== "light" && want !== "dark") return fail(`theme: ${want}: there is light and there is dark`);
      const next: "light" | "dark" = want === "light" || want === "dark" ? want : env.theme() === "dark" ? "light" : "dark";
      env.setTheme(next);
      return [dim(`theme: ${next}`)];
    },
  },
  tour: {
    summary: "the 60-second guided tour",
    run: (_, env) => {
      env.startTour();
      return [dim("starting the tour …")];
    },
  },
  contact: {
    summary: "how to reach me",
    run: () => [row("email", link(profile.email, `mailto:${profile.email}`)), row("form", cmd("open home"), t("  then the Contact section", DIM))],
  },
  history: { summary: "what you have typed", run: (_, env) => env.history.map((h, i) => line(t(String(i + 1).padStart(4) + "  ", DIM), h)) },
  clear: {
    summary: "clear the screen",
    run: (_, env) => {
      env.clear();
      return [];
    },
  },
  exit: {
    summary: "close the terminal",
    run: (_, env) => {
      env.close();
      return [];
    },
  },
  echo: { summary: "print", hidden: true, run: (args) => [line(args.join(" "))] },
  date: { summary: "the time", hidden: true, run: () => [line(new Date().toUTCString())] },
  // Everything behind this prompt is read-only, like the MCP server. Say so, in character.
  sudo: { summary: "", hidden: true, run: () => [line(t("visitor is not in the sudoers file. ", ERR), t("Everything here is read-only, by design: the API, the MCP server, this shell.", DIM))] },
  rm: { summary: "", hidden: true, run: () => [line(t("rm: read-only file system. ", ERR), t("The site is a container image built once and signed; nothing in it changes after that.", DIM))] },
};
commands.man = { ...commands.help, hidden: true };
commands.uptime = { ...commands.status, hidden: true };
commands.quit = { ...commands.exit, hidden: true };

const HELP_WIDTH = 18;
function helpRow(name: string): Line {
  const c = commands[name];
  const label = c.usage ?? name;
  return line({ text: label, run: name, cls: ACCENT }, gap(label.length, HELP_WIDTH), t(c.summary, DIM));
}

/** A tool's example arguments from the agents page, as they would be typed here. */
function exampleArgs(tool: string): string {
  const example = agentTools.find((a) => a.name === tool)?.example ?? {};
  const first = Object.values(example)[0];
  return typeof first === "string" ? ` ${first}` : "";
}

/** `key=value` pairs become arguments; plain words become the tool's main text argument. */
function toolArgs(tool: string, words: string[]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const free: string[] = [];
  for (const w of words) {
    const eq = w.indexOf("=");
    if (eq > 0) out[w.slice(0, eq)] = /^\d+$/.test(w.slice(eq + 1)) ? Number(w.slice(eq + 1)) : w.slice(eq + 1);
    else free.push(w);
  }
  const main = Object.keys(agentTools.find((a) => a.name === tool)?.example ?? {})[0];
  if (free.length && main) out[main] = free.join(" ");
  return out;
}

/** Runs one line typed at the prompt. Never throws: a failure is printed like any other output. */
export async function runCommand(input: string, env: ShellEnv): Promise<Line[]> {
  const [name, ...args] = input.trim().split(/\s+/);
  if (!name) return [];
  const command = own(commands, name.toLowerCase());
  if (!command) return [line(t(`${name}: command not found. `, ERR), t("Try ", DIM), cmd("help"))];
  // Ctrl+C answers at once, even while a request that cannot itself be cancelled is still out.
  const cancelled = new Promise<never>((_, reject) => {
    if (env.signal.aborted) reject(env.signal.reason);
    else env.signal.addEventListener("abort", () => reject(env.signal.reason), { once: true });
  });
  cancelled.catch(() => {});
  try {
    return await Promise.race([Promise.resolve(command.run(args, env, input)), cancelled]);
  } catch (e) {
    if (env.signal.aborted) return [dim("^C")];
    if (isTimeout(e)) return fail(`${name}: no answer within ${WAIT_MS / 1000} s. The server may be waking up; try again.`);
    if (e instanceof ApiError && e.status === 429) return fail(`${name}: the server is rate limiting this browser (${e.message}). Give it a minute.`);
    if (e instanceof ApiError) return fail(`${name}: ${e.message}`);
    return fail(`${name}: the server did not answer. Check your connection, or see: open status`);
  }
}

// ── Tab completion ───────────────────────────────────────────────────────────────────────────────

const visible = Object.keys(commands).filter((c) => !commands[c].hidden);

function pathCandidates(cwd: string, partial: string, withPages: boolean): string[] {
  const slash = partial.lastIndexOf("/");
  const base = slash >= 0 ? partial.slice(0, slash + 1) : "";
  const dir = resolvePath(cwd, base || ".");
  const names = dir === "" ? [...Object.keys(DIRS).map((d) => d + "/"), ...ROOT_FILES.map((f) => f.name + ".md")] : (own(DIRS, dir) ?? []).map((e) => e.name + ".md");
  return [...names.map((n) => base + n), ...(withPages && !base ? Object.keys(PAGES) : [])];
}

function candidates(words: string[], cwd: string): string[] {
  const [name, ...rest] = words;
  const last = rest[rest.length - 1] ?? "";
  if (rest.length === 0) return visible;
  if (name === "cat" || name === "ls" || name === "cd") return pathCandidates(cwd, last, false).filter((c) => (name === "cd" ? c.endsWith("/") : true));
  if (name === "open") return pathCandidates(cwd, last, true);
  if (name === "theme") return ["light", "dark"];
  if (name === "curl") return CURL_PATHS;
  if (name === "mcp") return rest.length === 1 ? ["tools", "call"] : rest.length === 2 && rest[0] === "call" ? agentTools.map((a) => a.name) : [];
  return [];
}

/** Completes the last word of the input. One match fills it in; several fill the common prefix and are listed. */
export function complete(input: string, cwd: string): { value: string; options: string[] } {
  const words = input.trimStart().split(/\s+/);
  const last = words[words.length - 1];
  const matches = candidates(words, cwd).filter((c) => c.startsWith(last));
  if (matches.length === 0) return { value: input, options: [] };
  let prefix = matches[0];
  for (const m of matches) while (!m.startsWith(prefix)) prefix = prefix.slice(0, -1);
  const done = matches.length === 1 && !prefix.endsWith("/") ? prefix + " " : prefix;
  return { value: [...words.slice(0, -1), done].join(" "), options: matches.length > 1 ? matches : [] };
}

/** What the terminal prints when it first opens. */
export const welcome: Line[] = [
  line(t(profile.name, BOLD), t("  SRE, cloud and AI infrastructure", DIM)),
  dim("A small shell over this site's real API. Nothing here is canned: each command asks the server."),
  line(""),
  line(t("Try  ", DIM), cmd("status"), t("  ·  ", DIM), cmd("slo"), t("  ·  ", DIM), cmd("ask how did you cut the cloud bill"), t("  ·  ", DIM), cmd("ls work"), t("  ·  ", DIM), cmd("help")),
];
