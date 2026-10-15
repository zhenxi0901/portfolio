"use client";

import { useEffect, useRef, useState } from "react";

type Tone = "net" | "server" | "cold" | "page";
type Span = { label: string; start: number; end: number; tone: Tone; note?: string; depth?: 0 | 1 };
type Trace = {
  spans: Span[];
  total: number;
  ttfb: number;
  server?: number;
  cold?: number;
  revision?: string;
  protocol?: string;
};

const FILL: Record<Tone, string> = {
  net: "var(--ink-3)",
  server: "var(--accent-ink)",
  cold: "var(--critical)",
  page: "var(--line-strong)",
};

const PROTOCOL: Record<string, string> = { h3: "HTTP/3", h2: "HTTP/2", "http/1.1": "HTTP/1.1" };

// An instance whose process is older than this when its first visitor arrives was not started for
// that visitor (after a deploy, Cloud Run starts one and it can sit idle), so they did not wait.
const COLD_START_MS = 10_000;

const fmt = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : ms >= 10 ? `${Math.round(ms)} ms` : `${ms.toFixed(1)} ms`);
const kb = (b: number) => `${Math.max(1, Math.round(b / 1024))} KB`;

/** Turn this tab's own navigation timing, and the server's Server-Timing header, into a trace. */
function readTrace(): Trace | null {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (!nav || !nav.responseStart || !nav.loadEventEnd) return null;
  const st = new Map((nav.serverTiming ?? []).map((e) => [e.name, e]));
  const spans: Span[] = [];

  const dns = nav.domainLookupEnd - nav.domainLookupStart;
  spans.push({ label: "DNS lookup", start: nav.domainLookupStart, end: nav.domainLookupEnd, tone: "net", note: dns < 0.5 ? "cached" : undefined });
  const connect = nav.connectEnd - nav.connectStart;
  spans.push({
    label: "Connect and TLS",
    start: nav.connectStart,
    end: nav.connectEnd,
    tone: "net",
    note: connect < 0.5 ? "connection reused" : undefined,
  });
  const revision = st.get("rev")?.description || undefined;
  spans.push({
    label: "Waiting for the first byte",
    start: nav.requestStart,
    end: nav.responseStart,
    tone: "net",
    // Cloud Run sets the revision; anywhere else there is no Google front end in the path.
    note: revision ? "Google's front end, then Cloud Run" : undefined,
  });

  const server = st.get("app")?.duration;
  const age = st.get("cold")?.duration;
  const cold = age !== undefined && age < COLD_START_MS ? age : undefined;
  if (server !== undefined) {
    const serverStart = Math.max(nav.requestStart, nav.responseStart - server);
    if (cold !== undefined) {
      spans.push({
        label: "Server process starting",
        start: Math.max(nav.requestStart, serverStart - cold),
        end: serverStart,
        tone: "cold",
        depth: 1,
      });
    }
    spans.push({ label: "Go server", start: serverStart, end: nav.responseStart, tone: "server", depth: 1 });
  }

  const encoded = nav.encodedBodySize;
  const decoded = nav.decodedBodySize;
  spans.push({
    label: "Downloading the page",
    start: nav.responseStart,
    end: nav.responseEnd,
    tone: "net",
    note:
      nav.transferSize === 0
        ? "from your browser's cache"
        : encoded && decoded > encoded
          ? `${kb(encoded)} over the wire for ${kb(decoded)} of HTML`
          : undefined,
  });
  spans.push({ label: "Parsing and scripts", start: nav.responseEnd, end: nav.domContentLoadedEventEnd, tone: "page" });
  spans.push({ label: "Fonts, images, the rest", start: nav.domContentLoadedEventEnd, end: nav.loadEventEnd, tone: "page" });
  const hero = performance.getEntriesByName("hero-3d-ready")[0]?.startTime;
  if (hero && hero > nav.domContentLoadedEventEnd) {
    spans.push({ label: "3D cluster, after first paint", start: nav.domContentLoadedEventEnd, end: hero, tone: "page" });
  }

  return {
    spans: spans.filter((s) => s.end >= s.start),
    total: Math.max(...spans.map((s) => s.end)),
    ttfb: nav.responseStart,
    server,
    cold,
    revision,
    protocol: PROTOCOL[nav.nextHopProtocol] ?? (nav.nextHopProtocol || undefined),
  };
}

/** "Your visit, traced": the request that delivered this page, measured by the visitor's own browser. */
export function VisitTrace() {
  const ref = useRef<HTMLDivElement>(null);
  const [trace, setTrace] = useState<Trace | null | "unavailable">(null);

  // Read it when the panel comes into view: by then the page, and usually the 3D hero, have loaded.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      setTrace(readTrace() ?? "unavailable");
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const t = trace && trace !== "unavailable" ? trace : null;

  return (
    <div ref={ref} className="mt-4 overflow-hidden rounded-3xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="font-semibold">Your visit, traced</p>
        <p className="text-sm text-ink-3">Measured by your own browser. Nothing is sent anywhere.</p>
      </div>

      {trace === "unavailable" && (
        <p className="mt-4 text-sm text-ink-2">Your browser didn&apos;t share timing for this page load. Reload to see it.</p>
      )}

      {t && (
        <>
          <Verdict t={t} />
          <ol className="mt-6 grid gap-2" aria-label="Timeline of this page load">
            {t.spans.map((s) => (
              <li key={s.label} className="grid grid-cols-[minmax(0,10.5rem)_1fr] items-center gap-3 sm:grid-cols-[13rem_1fr]">
                <span className={`min-w-0 text-sm ${s.depth ? "pl-4 text-ink-2" : "text-ink"}`}>
                  <span className="block truncate">
                    {s.depth ? "└ " : ""}
                    {s.label}
                  </span>
                  {/* Phones: the note goes under the label, where there is room for it. */}
                  {s.note && <span className="block truncate text-[11px] text-ink-3 sm:hidden">{s.note}</span>}
                </span>
                <span className="relative h-6">
                  <span
                    className="absolute top-1 h-4 rounded-[4px]"
                    style={{
                      left: `${(s.start / t.total) * 100}%`,
                      width: `max(3px, ${((s.end - s.start) / t.total) * 100}%)`,
                      background: FILL[s.tone],
                    }}
                  />
                  <span
                    className="absolute top-0.5 whitespace-nowrap pl-2 font-mono text-[11px] leading-5 text-ink-2"
                    style={
                      s.end / t.total > 0.62
                        ? { right: `${100 - (s.start / t.total) * 100}%`, paddingRight: 8, paddingLeft: 0 }
                        : { left: `${(s.end / t.total) * 100}%` }
                    }
                  >
                    {fmt(s.end - s.start)}
                    {s.note && <span className="hidden sm:inline">, {s.note}</span>}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 font-mono text-[11px] text-ink-3">
            0 ms is when you asked for the page. Total {fmt(t.total)}.
          </p>
        </>
      )}

      {!trace && <div className="mt-6 h-40 animate-pulse rounded-2xl bg-surface-2" />}
    </div>
  );
}

function Verdict({ t }: { t: Trace }) {
  const via = t.protocol ? ` over ${t.protocol}` : "";
  if (t.server === undefined) {
    return (
      <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed text-ink-2">
        This copy of the site was served without the Go server, so there is no server-side timing. The first byte arrived after{" "}
        {fmt(t.ttfb)}
        {via}.
      </p>
    );
  }
  if (t.cold !== undefined) {
    return (
      <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed text-ink-2">
        <span className="font-semibold text-ink">You woke this server up.</span> It had scaled to zero to cost nothing, so Cloud
        Run started a container for your request, and your first byte arrived after {fmt(t.ttfb)}. The Go process was{" "}
        {fmt(t.cold)} old when your request reached it and answered in {fmt(t.server)}. The next visitor gets a warm server.
      </p>
    );
  }
  return (
    <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed text-ink-2">
      <span className="font-semibold text-ink">A warm server answered you</span>
      {t.revision ? <> (revision <span className="font-mono text-[13px] text-ink">{t.revision}</span>)</> : null}. The Go server took{" "}
      {fmt(t.server)}; the first byte reached you after {fmt(t.ttfb)}
      {via}. The rest is the network and your browser.
    </p>
  );
}
