"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CloudSlash } from "@phosphor-icons/react";
import { api, type Status as StatusT } from "@/lib/api";
import { SectionHeading } from "@/components/site/section-heading";

const FLOW = ["Your browser", "Cloud Run: Go server", "Static site + /api", "/metrics to Prometheus"];

function uptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(s % 60)}s`;
}

export function Status() {
  const [data, setData] = useState<StatusT | null>(null);
  const [offline, setOffline] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const poll = () =>
      api
        .status()
        .then((s) => {
          setData(s);
          setOffline(false);
        })
        .catch(() => setOffline(true));
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

  const tiles = data
    ? [
        { label: "Uptime", value: uptime(data.uptime_seconds) },
        { label: "Requests served", value: data.requests_total.toLocaleString("en-US") },
        { label: "p50 latency", value: `${data.latency_ms.p50.toFixed(1)} ms` },
        { label: "p95 latency", value: `${data.latency_ms.p95.toFixed(1)} ms` },
        { label: "Heap in use", value: `${data.heap_mb.toFixed(1)} MB` },
        { label: "Running", value: `${data.version}, ${data.region}` },
      ]
    : [];

  return (
    <section ref={ref} id="status" className="mx-auto max-w-[1320px] scroll-mt-20 px-4 py-24 sm:px-8 sm:py-32">
      <SectionHeading
        title="This page is a production service"
        lead="The Go server that sent you this page also reports on itself. These numbers are live and refresh every five seconds."
      />

      <ol className="mt-10 flex flex-wrap items-center gap-2 text-sm" aria-label="How this site is served">
        {FLOW.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span className="rounded-full border border-line bg-surface px-3.5 py-1.5 font-mono text-xs text-ink-2">{step}</span>
            {i < FLOW.length - 1 && <ArrowRight size={14} className="text-ink-3" />}
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-4 lg:grid-cols-12">
        <div className="rounded-3xl border border-line bg-surface p-6 lg:col-span-7">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Latency of the last requests</p>
            <span className="inline-flex items-center gap-2 text-sm text-ink-2" role="status">
              {data && !offline ? (
                <>
                  <span className="size-2 rounded-full bg-good" /> Live
                </>
              ) : (
                <>
                  <CloudSlash size={16} /> Offline
                </>
              )}
            </span>
          </div>
          {data && !offline ? (
            <Sparkline values={data.recent_ms} />
          ) : (
            <div className="mt-6 grid h-40 place-items-center rounded-2xl bg-surface-2 px-6 text-center text-sm text-ink-2">
              {offline
                ? "The status API isn't reachable from this copy of the site. On the Cloud Run deploy this panel is live."
                : "Connecting to the status API..."}
            </div>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-4 lg:col-span-5">
          {(tiles.length ? tiles : Array.from({ length: 6 }, () => null)).map((t, i) => (
            <div key={i} className="rounded-3xl border border-line bg-surface p-5">
              {t ? (
                <>
                  <dt className="text-sm text-ink-2">{t.label}</dt>
                  <dd className="mt-2 truncate text-2xl font-semibold tracking-[-0.03em]">{t.value}</dd>
                </>
              ) : (
                <>
                  <div className="h-4 w-20 animate-pulse rounded-full bg-surface-2" />
                  <div className="mt-3 h-7 w-24 animate-pulse rounded-full bg-surface-2" />
                </>
              )}
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 160;
  const pad = 8;
  const vals = values.length > 1 ? values : [0, 0];
  const max = Math.max(1, ...vals) * 1.15;
  const x = (i: number) => pad + (i / (vals.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const d = vals.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const area = `${d} L${x(vals.length - 1)},${H - pad} L${x(0)},${H - pad} Z`;
  return (
    <div className="relative mt-6">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-40 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Latency of the last ${vals.length} requests, up to ${Math.max(...vals).toFixed(1)} ms`}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left) / r.width) * (vals.length - 1));
          setHover(Math.max(0, Math.min(vals.length - 1, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <line x1={0} x2={W} y1={H - pad} y2={H - pad} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={area} fill="var(--accent-ink)" opacity={0.1} />
        <path d={d} fill="none" stroke="var(--accent-ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={pad} y2={H - pad} stroke="var(--ink-3)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-xl border border-line bg-surface px-2.5 py-1.5 font-mono text-xs shadow-soft"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          {vals[hover].toFixed(2)} ms
        </div>
      )}
    </div>
  );
}
