"use client";

import { useId, useRef, useState } from "react";
import { Lightning, Scales } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { run, strategies, summarise, TIMEOUT_MS, type Faults, type RequestResult, type Strategy } from "@/lib/resilience";
import { looks, Timeline } from "./timeline";
import { cn } from "@/lib/utils";

const COUNT = 20;
const COMPARE_COUNT = 12;

const presets: { name: string; faults: Faults }[] = [
  { name: "Healthy", faults: { fail: 0, slow: 0, delayMs: 0 } },
  { name: "Flaky", faults: { fail: 0.3, slow: 0, delayMs: 0 } },
  { name: "Slow", faults: { fail: 0, slow: 0.3, delayMs: 1200 } },
  { name: "Brownout", faults: { fail: 0.4, slow: 0.4, delayMs: 800 } },
];

type Run = { id: number; strategy: Strategy; faults: Faults; results: RequestResult[] };

const name = (s: Strategy) => strategies.find((x) => x.id === s)!.name;
const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const describe = (f: Faults) =>
  [f.fail > 0 && `${pct(f.fail)} errors`, f.slow > 0 && f.delayMs > 0 && `${pct(f.slow)} slow by ${ms(f.delayMs)}`].filter(Boolean).join(", ") || "no faults";

/** One request's attempts in the order they went out: one after another, or side by side for a hedge. */
const attemptsOf = (r: RequestResult, s: Strategy) =>
  [...r.attempts]
    .sort((a, b) => a.start - b.start)
    .map((a) => `${looks[a.outcome].label} ${a.outcome === "rejected" ? "" : ms(a.end - a.start)}`.trim())
    .join(s === "hedge" ? " + " : " → ");

/** What a run showed, in a sentence or two, from its own numbers. */
function takeaway(r: Run): string {
  const s = summarise(r.results);
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const busy = s.busy > 0 ? ` ${plural(s.busy, "call")} hit the lab's limits (429), which a real client should treat like any other overload.` : "";
  const failedFor = s.failed === 0 ? "every request succeeded" : `${plural(s.failed, "request")} of ${s.requests} failed`;
  switch (r.strategy) {
    case "give-up":
      return s.failed === 0
        ? `Nothing went wrong that a single attempt could not survive.${busy}`
        : `${failedFor} for the user: with no retries, every error and timeout the server produced reached someone.${busy}`;
    case "retry":
      return `The server failed ${s.failedCalls} of ${s.calls} calls; with retries, ${s.failed === 0 ? "every request still succeeded" : `${failedFor}`} for the user, at ${s.callsPerRequest.toFixed(2)} calls per request. The extra calls are the price: in a real outage they land on a server that is already struggling.${busy}`;
    case "breaker":
      return s.rejected > 0
        ? `The breaker opened and turned away ${plural(s.rejected, "call")} without sending them: those users got an instant error instead of a slow one, and the server got room to recover. Overall ${failedFor}.${busy}`
        : `The breaker never opened (it needs 4 failures in a row), so this behaved like plain retries: ${failedFor}.${busy}`;
    case "hedge":
      return `Hedging sent ${plural(s.calls - s.requests, "extra copy", "extra copies")} (${s.callsPerRequest.toFixed(2)} calls per request) and ${failedFor}; the slowest 5% waited ${ms(s.p95)}. Hedges cut waiting on slow answers, not errors.${busy}`;
  }
}

function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="font-mono text-sm tabular-nums text-ink-2">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={format(value)}
        className="mt-2 w-full accent-[var(--accent-ink)]"
      />
    </div>
  );
}

/** The lab: choose the faults and the client, send real requests, watch every attempt. */
export function Lab() {
  const [faults, setFaults] = useState<Faults>(presets[1].faults);
  const [strategy, setStrategy] = useState<Strategy>("give-up");
  const [results, setResults] = useState<RequestResult[] | null>(null);
  const [current, setCurrent] = useState<Run | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  const ids = useRef(0);
  const radioName = useId();

  const go = async (list: Strategy[], count: number) => {
    if (busy) return;
    const f = { ...faults };
    const done: Run[] = [];
    setVerdict(null);
    for (const s of list) {
      setBusy(list.length > 1 ? `Running ${name(s)}…` : "Sending…");
      setResults([]);
      setCurrent({ id: -1, strategy: s, faults: f, results: [] });
      const res = await run(s, f, count, (r) => setResults(r));
      const r: Run = { id: ++ids.current, strategy: s, faults: f, results: res };
      done.push(r);
      setCurrent(r);
      setResults(res);
    }
    if (done.length > 1) {
      setVerdict(
        `Compared against ${describe(f)}: ` +
          done.map((r) => `${name(r.strategy)} ${summarise(r.results).ok} of ${count}`).join(", ") +
          " succeeded for the user. All four are side by side below.",
      );
    }
    setRuns((old) => [...done.reverse(), ...old].slice(0, 12));
    setBusy(null);
  };

  const live = current && results ? { ...current, results } : null;
  const s = live && live.results.length ? summarise(live.results) : null;
  const finished = current && current.id > 0 && !busy;

  return (
    <div className="mt-10 space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="lab-faults" className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <h2 id="lab-faults" className="text-lg font-semibold tracking-[-0.02em]">
            1. What goes wrong on the server
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {presets.map((p) => {
              const on = p.faults.fail === faults.fail && p.faults.slow === faults.slow && p.faults.delayMs === faults.delayMs;
              return (
                <button
                  key={p.name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFaults(p.faults)}
                  className="rounded-full border border-line px-3 py-1.5 text-sm text-ink-2 transition-colors hover:border-ink-3 hover:text-ink aria-pressed:border-accent-ink aria-pressed:text-ink"
                >
                  {p.name}
                </button>
              );
            })}
          </div>
          <div className="mt-6 space-y-5">
            <Slider label="Requests answered with a 503" value={faults.fail} min={0} max={0.6} step={0.05} format={pct} onChange={(fail) => setFaults({ ...faults, fail })} />
            <Slider label="Requests held before answering" value={faults.slow} min={0} max={1} step={0.05} format={pct} onChange={(slow) => setFaults({ ...faults, slow })} />
            <Slider label="How long they are held" value={faults.delayMs} min={0} max={1500} step={100} format={(v) => `${v} ms`} onChange={(delayMs) => setFaults({ ...faults, delayMs })} />
          </div>
          <p className="mt-5 text-sm leading-relaxed text-ink-2">
            The client waits {TIMEOUT_MS / 1000} s for each attempt, so a hold longer than that becomes a timeout. Limits on the server: 60% errors, 1.5 s
            holds.
          </p>
        </section>

        <section aria-labelledby="lab-client" className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <h2 id="lab-client" className="text-lg font-semibold tracking-[-0.02em]">
            2. How the client copes
          </h2>
          <div role="radiogroup" aria-labelledby="lab-client" className="mt-4 space-y-2">
            {strategies.map((st) => (
              <label
                key={st.id}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-2xl border p-3 transition-colors",
                  strategy === st.id ? "border-accent-ink bg-surface-2" : "border-line hover:border-ink-3",
                )}
              >
                {/* Named by the strategy alone; the sentence under it is its description. */}
                <input
                  type="radio"
                  name={radioName}
                  value={st.id}
                  checked={strategy === st.id}
                  onChange={() => setStrategy(st.id)}
                  aria-label={st.name}
                  aria-describedby={`${radioName}-${st.id}`}
                  className="mt-1 accent-[var(--accent-ink)]"
                />
                <span>
                  <span className="block font-medium">{st.name}</span>
                  <span id={`${radioName}-${st.id}`} className="mt-0.5 block text-sm leading-relaxed text-ink-2">
                    {st.detail}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" aria-disabled={busy ? true : undefined} onClick={() => go([strategy], COUNT)}>
          <Lightning weight="fill" /> Send {COUNT} requests
        </Button>
        <Button size="lg" variant="secondary" aria-disabled={busy ? true : undefined} onClick={() => go(strategies.map((x) => x.id), COMPARE_COUNT)}>
          <Scales /> Compare all four
        </Button>
        <p role="status" className="text-sm text-ink-2">
          {busy ?? (finished ? (verdict ?? `Done: ${name(current!.strategy)}, ${describe(current!.faults)}.`) : "")}
        </p>
      </div>

      <section aria-labelledby="lab-result" className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <h2 id="lab-result" className="text-lg font-semibold tracking-[-0.02em]">
          3. What happened
        </h2>
        {!live ? (
          <p className="mt-3 text-ink-2">
            Pick the faults and a client, then send. Every bar below will be a real request to the Go server on Cloud Run, drawn as it comes back.
          </p>
        ) : (
          <>
            {s && (
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                {[
                  ["succeeded for the user", `${s.ok} of ${s.requests}`],
                  ["slowest 5% waited", ms(s.p95)],
                  ["calls to the server", `${s.calls} (${s.callsPerRequest.toFixed(2)} each)`],
                  ["calls that failed", `${s.failedCalls}${s.rejected ? `, ${s.rejected} not sent` : ""}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col-reverse justify-end">
                    <dt className="mt-1 text-sm text-ink-2">{k}</dt>
                    <dd className="text-2xl font-semibold tracking-[-0.03em] tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mt-4 font-mono text-xs text-ink-3">
              {name(live.strategy)} · {describe(live.faults)}
            </p>
            <div className="mt-2">
              <Timeline
                results={live.results}
                lanes={live.id > 0 ? live.results.length : busy?.startsWith("Running") ? COMPARE_COUNT : COUNT}
                label={s ? `${name(live.strategy)} against ${describe(live.faults)}: ${s.ok} of ${s.requests} requests succeeded, ${s.calls} calls sent.` : "Requests on their way."}
              />
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
              {Object.entries(looks).map(([k, v]) => (
                <li key={k} className="flex items-center gap-1.5">
                  <svg viewBox="0 0 14 10" className="h-2.5 w-3.5" aria-hidden>
                    {k === "rejected" ? (
                      <g className={v.className} strokeWidth={2}>
                        <line x1={3} y1={1} x2={11} y2={9} />
                        <line x1={3} y1={9} x2={11} y2={1} />
                      </g>
                    ) : (
                      <rect x={1} y={1} width={12} height={8} rx={1.5} className={v.className} strokeWidth={k === "timeout" ? 1.5 : 0} strokeDasharray={k === "timeout" ? "3 2" : undefined} />
                    )}
                  </svg>
                  {v.label}
                </li>
              ))}
              <li className="flex items-center gap-1.5">
                <svg viewBox="0 0 14 10" className="h-2.5 w-3.5" aria-hidden>
                  <line x1={0} y1={5} x2={14} y2={5} className="stroke-ink-3" strokeWidth={1.5} strokeDasharray="2 2" />
                </svg>
                waiting to retry
              </li>
            </ul>
            {finished && current && <p className="mt-5 max-w-[75ch] leading-relaxed text-ink-2">{takeaway(current)}</p>}
            {finished && current && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-ink-2 hover:text-ink">Every request, as a table</summary>
                <table className="mt-3 w-full text-left text-sm">
                  <caption className="sr-only">Each request&apos;s attempts and outcome</caption>
                  <thead className="text-ink-3">
                    <tr>
                      <th scope="col" className="py-1 pr-3 font-normal">
                        #
                      </th>
                      <th scope="col" className="py-1 pr-3 font-normal">
                        Attempts
                      </th>
                      <th scope="col" className="py-1 pr-3 font-normal">
                        For the user
                      </th>
                      <th scope="col" className="py-1 font-normal">
                        Waited
                      </th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs">
                    {current.results.map((r) => (
                      <tr key={r.id} className="border-t border-line">
                        <td className="py-1.5 pr-3">{r.id + 1}</td>
                        <td className="py-1.5 pr-3">{attemptsOf(r, current.strategy)}</td>
                        <td className="py-1.5 pr-3">{r.ok ? "succeeded" : "failed"}</td>
                        <td className="py-1.5">{ms(r.end - r.start)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </>
        )}
      </section>

      {runs.length > 0 && (
        <section aria-labelledby="lab-runs" className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <h2 id="lab-runs" className="text-lg font-semibold tracking-[-0.02em]">
            Your runs, side by side
          </h2>
          {/* Focusable, so the columns past a phone's edge can be scrolled to from the keyboard. */}
          <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="The runs table, which scrolls sideways on small screens">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Every run so far, newest first</caption>
              <thead className="text-ink-3">
                <tr>
                  {["Client", "Faults", "Succeeded", "Slowest 5%", "Calls each"].map((h) => (
                    <th key={h} scope="col" className="py-2 pr-4 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const x = summarise(r.results);
                  return (
                    <tr key={r.id} className="border-t border-line">
                      <th scope="row" className="py-2 pr-4 font-medium">
                        {name(r.strategy)}
                      </th>
                      <td className="py-2 pr-4 text-ink-2">{describe(r.faults)}</td>
                      <td className="py-2 pr-4 tabular-nums">
                        {x.ok}/{x.requests}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{ms(x.p95)}</td>
                      <td className="py-2 tabular-nums">{x.callsPerRequest.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
