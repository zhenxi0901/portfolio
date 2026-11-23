"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CloudSlash } from "@phosphor-icons/react";
import { api, ApiError, type Status as StatusT } from "@/lib/api";

const FLOW = ["Your browser", "Cloud Run: Go server", "Static site + /api", "/metrics for Prometheus"];

function uptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(s % 60)}s`;
}

/**
 * The instance that answered: how a request reaches it, the latency of its last requests, and its
 * own counters, polled every five seconds while on screen. `commit` adds the running commit as a
 * tile; the status page leaves it out because its banner above already shows it.
 */
export function LiveInstance({ commit = true }: { commit?: boolean }) {
  const [data, setData] = useState<StatusT | null>(null);
  // "absent": this copy of the site has no API (a 404). "down": it has one, and it did not answer.
  const [problem, setProblem] = useState<"absent" | "down" | null>(null);
  const offline = problem !== null;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const poll = () =>
      api
        .status()
        .then((s) => {
          setData(s);
          setProblem(null);
        })
        .catch((err: unknown) => setProblem(err instanceof ApiError && err.status === 404 ? "absent" : "down"));
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !timer) {
        poll();
        timer = setInterval(() => document.visibilityState === "visible" && poll(), 5000);
      } else if (!e.isIntersecting && timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    if (ref.current) io.observe(ref.current);
    return () => {
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  }, []);

  const tiles: { label: string; value: React.ReactNode }[] = data
    ? [
        { label: "Uptime", value: uptime(data.uptime_seconds) },
        { label: "Requests served", value: data.requests_total.toLocaleString("en-US") },
        { label: "p50 latency", value: `${data.latency_ms.p50.toFixed(1)} ms` },
        { label: "p95 latency", value: `${data.latency_ms.p95.toFixed(1)} ms` },
        { label: "Heap in use", value: `${data.heap_mb.toFixed(1)} MB` },
        commit
          ? {
              // The exact source running right now, one click from the code.
              label: `Live commit, ${data.region}`,
              value: (
                <a
                  href={`https://github.com/zhenxi0901/portfolio/commit/${data.commit}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono underline decoration-line-strong underline-offset-4 hover:decoration-accent-ink"
                >
                  {data.commit}
                </a>
              ),
            }
          : { label: "Goroutines", value: data.goroutines.toLocaleString("en-US") },
      ]
    : [];

  return (
    <div ref={ref}>
      <ol className="mt-10 flex flex-wrap items-center gap-2 text-sm" aria-label="How this site is served">
        {FLOW.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span className="text-sm text-ink-2">{step}</span>
            {i < FLOW.length - 1 && <ArrowRight size={14} className="text-ink-3" />}
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-4 lg:grid-cols-12">
        <div className="rounded-3xl border border-line bg-surface p-6 lg:col-span-7">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Latency of the last requests</p>
            <span className="inline-flex items-center gap-2 text-sm text-ink-2" role="status">
              {offline ? (
                <>
                  <CloudSlash size={16} /> Offline
                </>
              ) : data ? (
                <>
                  <span className="size-2 rounded-full bg-live ring-1 ring-live-ink/40" /> Live
                </>
              ) : (
                "Connecting"
              )}
            </span>
          </div>
          {/* A failed poll after live data keeps the last chart: it is a blip, not a different copy of the site. */}
          {data ? (
            <>
              <Sparkline values={data.recent_ms} />
              {offline && <p className="mt-2 text-xs text-ink-3">Last update failed; retrying every five seconds.</p>}
            </>
          ) : (
            <div className="mt-6 grid h-40 place-items-center rounded-2xl bg-surface-2 px-6 text-center text-sm text-ink-2">
              {problem === "absent"
                ? "The status API isn't reachable from this copy of the site. On the Cloud Run deploy this panel is live."
                : problem === "down"
                  ? "The status API didn't answer just now. Trying again every five seconds."
                  : "Connecting to the status API…"}
            </div>
          )}
        </div>
        <div className="lg:col-span-5">
          {tiles.length ? (
            <dl className="grid grid-cols-2 gap-4">
              {tiles.map((t) => (
                <div key={t.label} className="rounded-3xl border border-line bg-surface p-5">
                  <dt className="text-sm text-ink-2">{t.label}</dt>
                  <dd className="mt-2 truncate text-2xl font-semibold tracking-[-0.02em] text-live-ink">{t.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            // Placeholders while the API answers; the message beside them says what is happening.
            <div className="grid grid-cols-2 gap-4" aria-hidden>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="rounded-3xl border border-line bg-surface p-5">
                  <div className="h-4 w-20 animate-pulse rounded-full bg-surface-2" />
                  <div className="mt-3 h-7 w-24 animate-pulse rounded-full bg-surface-2" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* What the numbers count, and over what: without it, a p95 of one window beside a chart of another reads as a contradiction. */}
      <p className="mt-4 max-w-[92ch] text-sm leading-relaxed text-ink-3">
        Requests and latencies are visitors&apos; pages and API calls, as the server timed them; uptime checks, agents and the fault lab are left
        out. p50 and p95 cover the last 512 of them, the chart the last 60.
      </p>
      <noscript>
        <p className="mt-3 text-sm text-ink-2">
          These readings are taken by a script, and scripts are off in this browser. The same figures, as JSON: <a href="/api/status">/api/status</a>.
        </p>
      </noscript>
    </div>
  );
}

const tick = (ms: number) => (ms >= 1000 ? `${ms / 1000} s` : `${ms} ms`);

/**
 * On a log scale, a decade a gridline: a page takes the server a fifth of a millisecond and an answer from the
 * model seconds, and on a straight scale one of those turned every other request into a flat line at zero.
 */
function Sparkline({ values }: { values: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 160;
  const pad = 8;
  const FLOOR = 0.01; // the server times in microseconds; a zero has no place on a log scale
  const vals = (values.length > 1 ? values : [FLOOR, FLOOR]).map((v) => Math.max(v, FLOOR));
  const lo = Math.floor(Math.log10(Math.min(...vals)));
  const hi = Math.max(lo + 1, Math.ceil(Math.log10(Math.max(...vals))));
  const x = (i: number) => pad + (i / (vals.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((Math.log10(v) - lo) / (hi - lo)) * (H - pad * 2);
  const d = vals.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const decades = Array.from({ length: hi - lo + 1 }, (_, i) => Number((10 ** (lo + i)).toPrecision(1)));
  return (
    <div className="mt-6">
      <div className="flex gap-2">
        <div className="relative h-40 w-12 shrink-0 font-mono text-[11px] text-ink-3" aria-hidden>
          {decades.map((v) => (
            <span key={v} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${(y(v) / H) * 100}%` }}>
              {tick(v)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-40 w-full"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Latency of the last ${vals.length} requests, up to ${Math.max(...vals).toFixed(1)} ms, median ${median(vals).toFixed(1)} ms`}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const i = Math.round(((e.clientX - r.left) / r.width) * (vals.length - 1));
              setHover(Math.max(0, Math.min(vals.length - 1, i)));
            }}
            onMouseLeave={() => setHover(null)}
          >
            {decades.map((v) => (
              <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            <path d={d} fill="none" stroke="var(--live-ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            {hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={pad} y2={H - pad} stroke="var(--ink-3)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {hover !== null && hover < vals.length && (
            <div
              className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-xl border border-line bg-surface px-2.5 py-1.5 font-mono text-xs shadow-soft"
              style={{ left: `${(x(hover) / W) * 100}%` }}
            >
              {vals[hover].toFixed(2)} ms
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 flex justify-between gap-4 text-xs text-ink-3" aria-hidden>
        <span>
          last {vals.length} requests, oldest on the left, log scale
        </span>
        <span>
          highest <span className="font-medium text-live-ink">{Math.max(...vals).toFixed(1)} ms</span>, median{" "}
          <span className="font-medium text-live-ink">{median(vals).toFixed(1)} ms</span>
        </span>
      </p>
    </div>
  );
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
