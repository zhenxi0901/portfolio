"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { api, type SloReport, type Status } from "@/lib/api";
import { cn } from "@/lib/utils";
import { uptime } from "@/lib/uptime";

/*
 * The hero: this site's own request path, live. The path your page request just took (from this
 * tab's Navigation Timing and the server's Server-Timing header), the instance that answered (from
 * /api/status, polled while the map is on screen), and what keeps watch over it (the uptime checks
 * and the SLO from /api/slo, the last deploy from /delivery.json). A dot runs along an edge only
 * when something real happened on it: your page load, each poll your browser makes, a new release.
 * The uptime checks are drawn on their real cadence, three a minute, one region at a time.
 */

// connect: TCP and TLS, when this page opened its own connection. setup: time before the request
// went out when the connection was opened outside the timed phase (a browser preconnect), so it is
// neither a measured handshake nor a reused connection.
type Visit = { connect: number | null; setup: number | null; ttfb: number; server: number | null; cold: boolean; download: number; total: number; bytes: number; protocol: string | null };
type Delivery = { generated: string; head: { sha: string } | null };

const COLD_START_MS = 10_000;
const POLL_MS = 30_000;
const PROTOCOL: Record<string, string> = { h3: "HTTP/3", h2: "HTTP/2", "http/1.1": "HTTP/1.1" };

function readVisit(): Visit | null {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (!nav || !nav.responseStart || !nav.responseEnd) return null;
  const st = new Map((nav.serverTiming ?? []).map((e) => [e.name, e]));
  const connect = nav.connectEnd - nav.connectStart;
  const before = nav.requestStart - nav.fetchStart;
  const age = st.get("cold")?.duration;
  return {
    connect: connect >= 0.5 ? connect : null,
    // Reused only when the request went out at once; a gap of more than a few ms is a handshake
    // the browser did before the page's timing began.
    setup: connect < 0.5 && before >= 5 ? before : null,
    ttfb: nav.responseStart - nav.requestStart,
    server: st.get("app")?.duration ?? null,
    cold: age !== undefined && age < COLD_START_MS,
    download: nav.responseEnd - nav.responseStart,
    total: nav.responseEnd - nav.startTime,
    bytes: nav.encodedBodySize || nav.transferSize || 0,
    protocol: PROTOCOL[nav.nextHopProtocol] ?? (nav.nextHopProtocol || null),
  };
}

// The same precision as the readings below the map (ops-ledger.tsx): one Go-server time once read 0.1 here and 0.15 there.
const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} s` : v >= 10 ? `${Math.round(v)} ms` : v >= 1 ? `${v.toFixed(1)} ms` : `${v.toFixed(2)} ms`);
const ago = (iso: string) => {
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${Math.floor(m)} min ago` : m < 48 * 60 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} days ago`;
};
// Whole units that have passed, as the profile's map counts them: 5.6 days up is "5 days", not 6.
const up = (s: number) => (s < 3600 ? `${Math.max(1, Math.floor(s / 60))} min` : s < 172800 ? `${Math.floor(s / 3600)} h` : `${Math.floor(s / 86400)} days`);
// The clock the browser keeps ("Singapore time", "Pacific time"). Not a place: a time zone's city is
// often not the visitor's (Seattle's is Los Angeles). Read in the browser only and never sent anywhere;
// the server renders without it.
let clockName: string | null | undefined;
const clock = () => {
  if (clockName === undefined) {
    try {
      const part = new Intl.DateTimeFormat("en-GB", { timeZoneName: "longGeneric" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName");
      clockName = part?.value.replace(/ Standard/, "").replace(/ Time$/, " time") ?? null;
    } catch {
      clockName = null;
    }
  }
  return clockName;
};
const never = () => () => {};
/** "connect 41 ms", "setup 150 ms", or "connection reused": only claimed when nothing was set up. */
const link = (v: Visit) => (v.connect !== null ? `connect ${ms(v.connect)}` : v.setup !== null ? `setup ${ms(v.setup)}` : "connection reused");
/** Short commits from /api/status and full ones from delivery.json name the same build. */
const sameCommit = (a: string, b: string) => !!a && !!b && (a.startsWith(b) || b.startsWith(a));

/** Live data for the map: this visit, the instance, the SLO, the last deploy. */
function useLive(on: boolean) {
  const [visit, setVisit] = useState<Visit | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [slo, setSlo] = useState<SloReport | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [polls, setPolls] = useState(0);
  // The commit that was serving when this page was: the first one a poll reported.
  const [served, setServed] = useState<string | null>(null);
  const zone = useSyncExternalStore(never, clock, () => null);

  useEffect(() => {
    let alive = true;
    let t = 0;
    // After load, so the navigation entry is complete.
    const read = () => {
      t = window.setTimeout(() => alive && setVisit(readVisit()), 0);
    };
    if (document.readyState === "complete") read();
    else window.addEventListener("load", read, { once: true });
    api
      .slo()
      .then((r) => alive && setSlo(r))
      .catch(() => {});
    fetch("/delivery.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d && setDelivery(d))
      .catch(() => {});
    return () => {
      alive = false;
      window.removeEventListener("load", read);
      window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (!on) return;
    let alive = true;
    const poll = () => {
      if (document.hidden) return;
      api
        .status()
        .then((s) => {
          if (!alive) return;
          setStatus(s);
          setServed((c) => c ?? s.commit);
          setPolls((n) => n + 1);
        })
        .catch(() => {});
    };
    poll();
    const t = window.setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [on]);

  return { visit, status, served, slo, delivery, polls, zone };
}

// Nodes in a 100 x 80 box: the request runs left to right through the middle, delivery comes in
// from the top, and the watchers sit along the bottom.
const N = {
  you: [10, 40],
  gfe: [35, 40],
  run: [63, 40],
  page: [86, 22],
  api: [86, 58],
  actions: [63, 11],
  probes: [35, 69],
  monitoring: [63, 69],
} as const;
type Node = keyof typeof N;
const at = (n: Node) => N[n].join(",");
const path = (...nodes: Node[]) => nodes.map((n, i) => `${i ? "L" : "M"}${at(n)}`).join(" ");
const EDGES: [Node, Node][] = [
  ["you", "gfe"],
  ["gfe", "run"],
  ["run", "page"],
  ["run", "api"],
  ["actions", "run"],
  ["probes", "gfe"],
  ["probes", "monitoring"],
  ["monitoring", "api"],
];
const ROUTES = {
  request: path("you", "gfe", "run", "page"),
  poll: path("you", "gfe", "run", "api"),
  probe: path("probes", "gfe", "run", "api"),
  deploy: path("actions", "run"),
};
type Route = keyof typeof ROUTES;

/** A node: a link whose name is what it shows, plus where it goes for screen readers. `live`: on the path your request took. */
function Card({ node, title, sub, href, label, live = false }: { node: Node; title: string; sub: React.ReactNode; href: string; label: string; live?: boolean }) {
  const [x, y] = N[node];
  return (
    <a
      href={href}
      style={{ left: `${x}%`, top: `${(y / 80) * 100}%` }}
      className={cn(
        "absolute z-10 w-max max-w-[min(11rem,30%)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-surface px-2 py-1 text-center transition-colors hover:border-ink-3 focus-visible:border-ink-3 @lg:px-2.5 @lg:py-1.5",
        live ? "border-live-ink" : "border-line-strong",
      )}
    >
      <span className="block text-[12px] font-semibold leading-tight text-ink @lg:text-[13px] @2xl:text-[14px]">{title}</span>
      <span className="mt-0.5 block font-mono text-[11px] leading-tight text-ink-2 @lg:text-[12px]">{sub}</span>
      <span className="sr-only">. {label}</span>
    </a>
  );
}

// Above the line by default, clear of the cards at either end. The numbers on the path are live readings.
function EdgeLabel({ from, to, children, dx = 0, dy = -5.5 }: { from: Node; to: Node; children: React.ReactNode; dx?: number; dy?: number }) {
  const x = (N[from][0] + N[to][0]) / 2 + dx;
  const y = (N[from][1] + N[to][1]) / 2 + dy;
  return (
    <span style={{ left: `${x}%`, top: `${(y / 80) * 100}%` }} className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[11px] text-live-ink @lg:text-[12px]" aria-hidden>
      {children}
    </span>
  );
}

/** A reading in a sentence: the site's one colour, because it came from the running service just now. */
const Live = ({ children }: { children: React.ReactNode }) => <span className="font-medium text-live-ink">{children}</span>;

/** The site's request path and its watchers, drawn with live numbers. */
export function LiveMap() {
  // The figure, not the map: on a phone the map is hidden and the list is what is on screen.
  const box = useRef<HTMLElement>(null);
  const [onScreen, setOnScreen] = useState(false);
  const live = useLive(onScreen);
  const motion = useRef<Record<Route, SVGAnimateMotionElement | null>>({ request: null, poll: null, probe: null, deploy: null });

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    if (box.current) io.observe(box.current);
    return () => io.disconnect();
  }, []);

  const pulse = useEffectEvent((r: Route) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) return;
    try {
      motion.current[r]?.beginElement();
    } catch {
      // SMIL is decoration; a browser without it just shows the map still.
    }
  });

  // Your page load, once its timing is known.
  useEffect(() => {
    if (live.visit) pulse("request");
  }, [live.visit]);
  // Each poll is a real request from this browser to /api/status; a new commit is a new release.
  useEffect(() => {
    if (live.polls) pulse("poll");
  }, [live.polls]);
  const latest = live.status?.commit ?? null;
  const newRelease = !!latest && !!live.served && !sameCommit(latest, live.served);
  useEffect(() => {
    if (newRelease) pulse("deploy");
  }, [newRelease, latest]);
  // The uptime checks: three a minute, so one every 20 s.
  useEffect(() => {
    if (!onScreen) return;
    const t = window.setInterval(() => pulse("probe"), 20_000);
    const first = window.setTimeout(() => pulse("probe"), 4_000);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(first);
    };
  }, [onScreen]);

  const { visit, status, served, slo, delivery, zone } = live;
  // Only a measured figure is shown as one; until there is one, the objective it is measured against.
  const avail = slo?.available ? `${uptime(slo.availability)} up` : "99.9% objective";
  const commit = status?.commit ?? delivery?.head?.sha ?? "…";
  // The commit this page came from, which a release that goes out while it is open does not change.
  const from = served ?? delivery?.head?.sha ?? "…";
  // delivery.json is written by the build; its time is a commit's only if that build is the commit's.
  const builtAgo = (sha: string | null) => (delivery?.head && sha && sameCommit(sha, delivery.head.sha) ? ago(delivery.generated) : null);
  const deployed = builtAgo(status?.commit ?? null);
  const fromBuilt = builtAgo(served);
  // The instance a poll reached; the cold start belongs to the one that served this page.
  const instance = status ? `up ${up(status.uptime_seconds)}` : "asia-southeast1";
  const page = visit ? `${Math.max(1, Math.round(visit.bytes / 1024))} KB · ${ms(visit.total)}${visit.cold ? " · cold" : ""}` : "static export";

  return (
    <figure ref={box} className="w-full">
      {/* A container: in a narrow column (two columns on a 1024 px screen) the type steps down. */}
      <div className="@container relative hidden aspect-[5/4] w-full md:block">
        <svg viewBox="0 0 100 80" className="absolute inset-0 size-full" aria-hidden>
          {EDGES.map(([a, b]) => {
            const onPath = (a === "you" && b === "gfe") || (a === "gfe" && b === "run") || (a === "run" && b === "page");
            return (
              <line
                key={`${a}-${b}`}
                x1={N[a][0]}
                y1={N[a][1]}
                x2={N[b][0]}
                y2={N[b][1]}
                stroke={onPath ? "var(--live-ink)" : "var(--line-strong)"}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                strokeDasharray={a === "actions" || a === "probes" || a === "monitoring" ? "3 3" : undefined}
                className={onPath ? "map-flow" : undefined}
              />
            );
          })}
          {(Object.keys(ROUTES) as Route[]).map((r) => (
            // Every dot is something that really happened just now, so every dot is lime.
            <circle key={r} r={1.3} cx={0} cy={0} className="fill-live-ink" opacity={0}>
              <animateMotion
                id={`map-${r}`}
                ref={(el) => {
                  motion.current[r] = el as SVGAnimateMotionElement | null;
                }}
                path={ROUTES[r]}
                dur={r === "request" ? "1.6s" : r === "deploy" ? "1.2s" : "1.4s"}
                begin="indefinite"
                fill="remove"
              />
              {/* Visible only while it moves. */}
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur={r === "request" ? "1.6s" : r === "deploy" ? "1.2s" : "1.4s"} begin={`map-${r}.begin`} fill="remove" />
            </circle>
          ))}
        </svg>
        <Card node="you" title="You" sub={zone ?? "this browser"} href="/status#visit-trace" label={`You${zone ? `, on ${zone}` : ""}. Your visit's trace is on the status page.`} live />
        <Card node="gfe" title="Google front end" sub={visit?.protocol ?? "TLS · HTTP"} href="/decisions" label="Google's front end terminates TLS. Why the site runs this way: the decision records." live />
        <Card node="run" title="Cloud Run" sub={instance} href="/status" label={`Cloud Run in asia-southeast1${status ? `, an instance ${instance}` : ""}. The status page.`} live />
        <Card node="page" title="This page" sub={page} href="/cost" label={`This page, served from the static export${visit?.cold ? " by an instance that had just started" : ""}. What the site costs.`} live />
        <Card node="api" title="/api" sub="status · slo · cost" href="/agents" label="The JSON API and the MCP server: for agents." />
        {/* Two lines on purpose: as one line the card's width cap broke "built 27 min ago" mid-phrase at every width. */}
        <Card node="actions" title="GitHub Actions" sub={deployed ? <>{commit} <span className="block">built {deployed}</span></> : commit} href="/changelog" label={`Built and deployed by GitHub Actions: commit ${commit}${deployed ? `, built ${deployed}` : ""}. The changelog.`} />
        <Card node="probes" title="Uptime checks" sub="3 regions · 1/min" href="/status" label="Google Cloud uptime checks from Singapore, Belgium and Oregon, every minute. The status page." />
        <Card node="monitoring" title="Cloud Monitoring" sub={avail} href="/status" label={`Cloud Monitoring: ${avail}. The status page.`} />
        {visit && (
          <>
            <EdgeLabel from="you" to="gfe">{link(visit)}</EdgeLabel>
            <EdgeLabel from="gfe" to="run">{`1st byte ${ms(visit.ttfb)}`}</EdgeLabel>
            {visit.server !== null && (
              // Below and right of the diagonal: centred above it, the label's right end sat on the dashed line,
              // and above-left is where the "new release" badge appears on the line from GitHub Actions.
              <EdgeLabel from="run" to="page" dx={4} dy={4}>
                {`Go ${ms(visit.server)}`}
              </EdgeLabel>
            )}
          </>
        )}
        {newRelease && (
          <EdgeLabel from="actions" to="run" dy={0}>
            <span className="rounded bg-live px-1.5 py-0.5 text-[11px] font-medium text-[#0d0d10]">new release</span>
          </EdgeLabel>
        )}
        {/* The edge timings are drawn for the eye; this is them for a screen reader. */}
        {visit && (
          <p className="sr-only">
            {`Your request: ${link(visit)}, first byte after ${ms(visit.ttfb)}${visit.server !== null ? `, ${ms(visit.server)} in the Go server` : ""}, the whole page in ${ms(visit.total)}${visit.cold ? ", from an instance that had just started" : ""}.`}
          </p>
        )}
      </div>

      {/* Phones: the same live numbers as a path, top to bottom. */}
      <p id="request-path" className="mb-3 text-sm text-ink-3 md:hidden">
        The request that loaded this page, step by step
      </p>
      <ol className="space-y-2 md:hidden" aria-labelledby="request-path">
        {[
          ["You", zone ?? "this browser", visit ? link(visit) : "", "/status#visit-trace"],
          ["Google front end", visit?.protocol ? `${visit.protocol} · ends TLS` : "terminates TLS", visit ? `first byte ${ms(visit.ttfb)}` : "", "/decisions"],
          ["Cloud Run · Go server", status ? `asia-southeast1 · ${instance}` : "asia-southeast1", visit?.server != null ? `Go ${ms(visit.server)}` : "", "/status"],
          ["This page", visit ? `${Math.max(1, Math.round(visit.bytes / 1024))} KB${visit.cold ? " · cold start" : ""}` : "static export", visit ? `${ms(visit.total)} end to end` : "", "/cost"],
        ].map(([title, sub, time, href], i) => (
          <li key={title}>
            <a href={href} className="flex items-center gap-3 rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 transition-colors hover:border-ink-3 focus-visible:border-ink-3">
              <span className="w-4 shrink-0 font-mono text-xs text-ink-3" aria-hidden>
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block truncate font-mono text-xs text-ink-2">{sub}</span>
              </span>
              <span className="shrink-0 font-mono text-xs text-live-ink">{time}</span>
            </a>
          </li>
        ))}
      </ol>

      {/* The request you just made, in a sentence; before its timing is known, what the picture is. */}
      <figcaption className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-ink-2 md:mt-2">
        {visit ? (
          <>
            You asked, and the first byte came back in <Live>{ms(visit.ttfb)}</Live>
            {visit.server !== null && (
              <>
                , <Live>{ms(visit.server)}</Live> of it in the Go server
              </>
            )}
            , from commit <Live>{from}</Live>
            {fromBuilt ? `, built ${fromBuilt}` : ""}.{" "}
          </>
        ) : (
          <>Your request to this page, drawn as it happens. </>
        )}
        {newRelease && (
          // Straight after the commit this page came from, which the newer one has replaced on the server.
          <>
            Commit <Live>{latest}</Live> went out while you were here.{" "}
            <button type="button" onClick={() => window.location.reload()} className="font-medium text-ink underline underline-offset-4">
              Reload for it
            </button>
            .{" "}
          </>
        )}
        {/* "Green", not "lime" (the light theme draws it olive), and "dotted", not "dashed" (the request path moves in dashes). */}
        <span className="hidden md:inline">The green path is the request you just made; the grey dotted lines are what keeps watch over it. Every box opens a page.</span>
        <span className="md:hidden">Watched by uptime checks from three regions: {avail}.</span>
      </figcaption>
    </figure>
  );
}
