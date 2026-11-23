// "Unplug something" on the live map: one part of the site's own path is taken away, in this tab only. Nothing on the
// server changes and nobody else notices; what this tab asks of that part fails, or comes back as it would without
// it, so the pages show what they really do then. It lasts until it is plugged back in, the tab closes, or a few
// minutes pass, whichever is first: a visitor who forgets about it must not think the site is down.
//
// No React here (lib/use-unplugged has the hook), so that code outside components can ask too.

/** The parts that can be taken away, by their names on the map. */
export const PARTS = ["gfe", "run", "api", "monitoring", "probes", "actions"] as const;
export type Part = (typeof PARTS)[number];

export const partName: Record<Part, string> = {
  gfe: "Google front end",
  run: "Cloud Run",
  api: "/api",
  monitoring: "Cloud Monitoring",
  probes: "Uptime checks",
  actions: "GitHub Actions",
};

const KEY = "unplugged";
export const MINUTES = 10;

type State = { part: Part; since: number };

let state: State | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let native: typeof fetch | null = null;
const listeners = new Set<() => void>();

/** What is unplugged in this tab, if anything. */
export const unpluggedPart = (): Part | null => state?.part ?? null;

export function onUnplug(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Whether the pages themselves would not load: the server that sends them, or the way to it, is unplugged. */
export const pagesCut = () => state?.part === "run" || state?.part === "gfe";

/** Sent on window when a page was not gone to because of that. The strip under the top bar answers it. */
export const WOULD_NOT_LOAD = "would-not-load";

export const unplug = (part: Part) => set({ part, since: Date.now() });
export const replug = () => set(null);

function set(next: State | null) {
  state = next;
  clearTimeout(timer);
  if (next) timer = setTimeout(replug, Math.max(0, next.since + MINUTES * 60_000 - Date.now()));
  try {
    // For the next page in this tab: every page here is its own document.
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    // No storage (a private window, blocked): then it lasts for this page.
  }
  // In place only while something is unplugged, so that otherwise this file changes nothing at all.
  if (next && !native) {
    native = window.fetch;
    window.fetch = severed;
  } else if (!next && native) {
    window.fetch = native;
    native = null;
  }
  for (const f of listeners) f();
}

/** Whether a request to this path would not get an answer with the part gone. */
function cuts(part: Part, path: string) {
  if (part === "run" || part === "gfe") return true;
  return part === "api" && (path.startsWith("/api/") || path === "/mcp");
}

async function severed(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const ask = native ?? fetch;
  const url = new URL(input instanceof Request ? input.url : input, location.href);
  if (!state || url.origin !== location.origin) return ask(input, init);
  const { part } = state;
  if (cuts(part, url.pathname)) {
    // A moment, as a refused connection takes, and then the browser's own error for one.
    await new Promise((r) => setTimeout(r, 150));
    throw new TypeError("Failed to fetch");
  }
  const res = await ask(input, init);
  if (part === "monitoring" && (url.pathname === "/api/slo" || url.pathname === "/api/cost")) return rewrite(res, (b) => ({ ...b, stale: b.available === true }));
  // As if the checks had stopped a day ago: the last day's bar is empty.
  if (part === "probes" && url.pathname === "/api/slo") return rewrite(res, (b) => ({ ...b, days: stopADayAgo(b.days) }));
  return res;
}

const stopADayAgo = (days: unknown) => (Array.isArray(days) ? days.map((d, i) => (i === days.length - 1 ? { ...d, checks: 0, passed: 0 } : d)) : days);

async function rewrite(res: Response, change: (body: Record<string, unknown>) => Record<string, unknown>) {
  if (!res.ok) return res;
  try {
    const body = JSON.stringify(change(await res.clone().json()));
    return new Response(body, { status: res.status, headers: { "Content-Type": "application/json" } });
  } catch {
    return res;
  }
}

/** Picks up what another page in this tab unplugged. Run once, before any page asks for anything. */
function resume() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as State | null;
    if (saved && PARTS.includes(saved.part) && Date.now() - saved.since < MINUTES * 60_000) set(saved);
  } catch {
    // Nothing saved, or no storage.
  }
}
if (typeof window !== "undefined") resume();
