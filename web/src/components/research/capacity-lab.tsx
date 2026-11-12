"use client";

import { useId, useState } from "react";
import { ArrowCounterClockwise, ArrowUpRight } from "@phosphor-icons/react";
import { assumptions, estimate, gpus, models, type Inputs } from "@/lib/capacity";
import { cn } from "@/lib/utils";

// What I served in the FYP: Qwen3-4B, four runs at once, the measured prefix-cache hit rate. The
// task's shape matches the prefix-cache panel above (a 6,000-token head, 450 tokens a turn).
const fyp = { modelId: "qwen3-4b", gpuId: "a100-80", fp8: false, turns: 40, perTurn: 450, reply: 150, cacheHit: 0.96, outsideSeconds: 4, agents: 4, pricePerHour: 2 };
const HEAD = 6000;

const n = (v: number, d = 0) => v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const gb = (v: number) => `${v >= 10 ? n(v) : n(v, 1)} GB`;
const secs = (v: number) => (v >= 120 ? `${n(v / 60, 1)} min` : v >= 1 ? `${n(v, 1)} s` : `${n(v * 1000)} ms`);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const usd = (v: number) => (v >= 1 ? `US$${v.toFixed(2)}` : v >= 0.01 ? `US$${v.toFixed(3)}` : `US$${v.toFixed(4)}`);

function Slider({ label, value, min, max, step, show, onChange, hint }: { label: string; value: number; min: number; max: number; step: number; show: string; onChange: (v: number) => void; hint?: string }) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="font-mono text-sm tabular-nums text-ink-2">{show}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-valuetext={show} className="mt-1.5 w-full accent-[var(--accent-ink)]" />
      {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { id: string; name: string }[]; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[15px] text-ink">
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Pick a model, a GPU and an agent's task; see what fits, how fast, how busy, and what a task costs. */
export function CapacityLab() {
  const [s, set] = useState(fyp);
  const up = (patch: Partial<typeof fyp>) => set((old) => ({ ...old, ...patch }));
  const model = models.find((m) => m.id === s.modelId)!;
  const gpu = gpus.find((g) => g.id === s.gpuId)!;
  const inputs: Inputs = { model, gpu, fp8: s.fp8, head: HEAD, turns: s.turns, perTurn: s.perTurn, reply: Math.min(s.reply, s.perTurn), cacheHit: s.cacheHit, outsideSeconds: s.outsideSeconds, agents: s.agents, pricePerHour: s.pricePerHour };
  const r = estimate(inputs);
  const atFyp = JSON.stringify(s) === JSON.stringify(fyp);
  const precisionName = useId();

  // The memory bar: weights, the agents' caches, and what is left, out of what the server may use.
  const usable = gpu.memGB * assumptions.memoryFraction - assumptions.activationsGB;
  const scale = Math.max(usable, r.weightsGB + r.kvInUseGB);
  const w = (v: number) => `${Math.max(0, (v / scale) * 100)}%`;
  const free = usable - r.weightsGB - r.kvInUseGB;

  // One turn of one agent: the GPU's part (prefill and decode) against the agent's own work.
  const turnTotal = r.modelSecondsPerTurn + s.outsideSeconds;
  const prefillShare = r.prefillPerTurnMs / 1000 / turnTotal;
  const decodeShare = (r.modelSecondsPerTurn - r.prefillPerTurnMs / 1000) / turnTotal;

  const status = !r.fits
    ? `The weights alone (${gb(r.weightsGB)}) don't fit in the ${gpu.name}'s ${gpu.memGB} GB. Try FP8, a smaller model, or several GPUs, which this model doesn't cover.`
    : r.overBudget
      ? `Over: ${s.agents} agents' full histories need ${gb(r.kvInUseGB)} of cache and there is ${gb(r.kvBudgetGB)}. The server would evict old prefixes, and the ${pct(s.cacheHit)} hit rate would fall.`
      : `Fits: the cache holds ${n(r.agentsThatFit)} agents' full histories, and ${s.agents === 1 ? "one is" : `${s.agents} are`} running.`;

  return (
    <section id="capacity" aria-labelledby="capacity-title" className="scroll-mt-24 rounded-3xl border border-line bg-surface p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-ink-3">Capacity lab · a first-order model</p>
          <h3 id="capacity-title" className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.035em]">
            Size a GPU for agents yourself
          </h3>
          <p className="mt-3 max-w-[70ch] leading-relaxed text-ink-2">
            Pick a model, a GPU and an agent&apos;s task, and see what fits: how many agents&apos; histories the KV cache holds, how fast they
            decode, how much of the time the GPU actually works, and what a task costs. It starts from what I served: Qwen3-4B, four agents at
            once, a 96% prefix-cache hit rate.
          </p>
        </div>
        <button
          type="button"
          onClick={() => set(fyp)}
          aria-disabled={atFyp || undefined}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm text-ink-2 transition-colors hover:border-ink-3 hover:text-ink aria-disabled:opacity-50"
        >
          <ArrowCounterClockwise size={14} aria-hidden /> Back to my setup
        </button>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Model" value={s.modelId} options={models} onChange={(modelId) => up({ modelId })} />
            <Select label="GPU" value={s.gpuId} options={gpus} onChange={(gpuId) => up({ gpuId })} />
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Weights</legend>
            <div className="mt-1.5 flex gap-2">
              {[
                { v: false, label: "BF16, 2 bytes" },
                { v: true, label: "FP8, 1 byte" },
              ].map((o) => (
                <label key={o.label} className={cn("flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm", s.fp8 === o.v ? "border-accent-ink text-ink" : "border-line text-ink-2")}>
                  <input type="radio" name={precisionName} checked={s.fp8 === o.v} onChange={() => up({ fp8: o.v })} className="accent-[var(--accent-ink)]" />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Slider label="Agents at once" value={s.agents} min={1} max={32} step={1} show={n(s.agents)} onChange={(agents) => up({ agents })} />
          <Slider label="Turns per task" value={s.turns} min={5} max={100} step={1} show={n(s.turns)} onChange={(turns) => up({ turns })} />
          <Slider
            label="Tokens each turn adds"
            value={s.perTurn}
            min={100}
            max={3000}
            step={50}
            show={n(s.perTurn)}
            onChange={(perTurn) => up({ perTurn, reply: Math.min(s.reply, perTurn) })}
            hint="The model's reply and the tool's result, both resent every turn after."
          />
          <Slider label="Of which the model writes" value={Math.min(s.reply, s.perTurn)} min={20} max={Math.min(1000, s.perTurn)} step={10} show={n(Math.min(s.reply, s.perTurn))} onChange={(reply) => up({ reply })} />
          <Slider label="Prefix-cache hit rate" value={s.cacheHit} min={0} max={0.99} step={0.01} show={pct(s.cacheHit)} onChange={(cacheHit) => up({ cacheHit })} hint="96% is what my runs measured." />
          <Slider label="Seconds outside the model, per turn" value={s.outsideSeconds} min={0} max={30} step={0.5} show={`${n(s.outsideSeconds, 1)} s`} onChange={(outsideSeconds) => up({ outsideSeconds })} hint="Tools and commands: an assumption, not a measurement." />
          <Slider label="Price of a GPU-hour" value={s.pricePerHour} min={0.5} max={10} step={0.25} show={`US$${s.pricePerHour.toFixed(2)}`} onChange={(pricePerHour) => up({ pricePerHour })} hint="Set your own: on-demand, reserved and spot prices differ several-fold." />
        </div>

        <div className="lg:col-span-7">
          <h4 className="text-sm font-medium">GPU memory</h4>
          <div
            className="mt-2 flex h-9 overflow-hidden rounded-xl border border-line bg-surface-2"
            role="img"
            aria-label={`Of ${gb(usable)} usable: weights ${gb(r.weightsGB)}, KV cache for ${s.agents} agents ${gb(r.kvInUseGB)}, ${free >= 0 ? `${gb(free)} free` : `${gb(-free)} over`}.`}
          >
            <span className="h-full bg-ink-2" style={{ width: w(r.weightsGB) }} />
            <span className={cn("h-full", r.overBudget ? "bg-critical" : "bg-accent")} style={{ width: w(Math.min(r.kvInUseGB, Math.max(0, usable - r.weightsGB))) }} />
            {r.overBudget && r.fits && <span className="h-full bg-critical/40" style={{ width: w(r.kvInUseGB - Math.max(0, usable - r.weightsGB)) }} />}
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
            <span>
              <span className="mr-1.5 inline-block size-2.5 rounded-sm bg-ink-2 align-middle" aria-hidden />
              weights {gb(r.weightsGB)}
            </span>
            <span>
              <span className={cn("mr-1.5 inline-block size-2.5 rounded-sm align-middle", r.overBudget ? "bg-critical" : "bg-accent")} aria-hidden />
              KV cache, {s.agents} at their last turn {gb(r.kvInUseGB)}
            </span>
            <span>
              {free >= 0 ? "free" : "over by"} {gb(Math.abs(free))} of {gb(usable)}
            </span>
          </p>
          <p className={cn("mt-3 text-[15px] leading-relaxed", r.overBudget ? "text-critical" : "text-ink")} aria-live="polite">
            {status}
            {r.outgrowsWindowAtTurn !== null && ` The history also outgrows ${model.name}'s ${n(model.maxContext)}-token window at turn ${r.outgrowsWindowAtTurn}.`}
          </p>

          <h4 className="mt-7 text-sm font-medium">One turn of one agent</h4>
          <div className="mt-2 flex h-6 overflow-hidden rounded-lg border border-line bg-surface-2" role="img" aria-label={`The GPU works ${secs(r.modelSecondsPerTurn)} of a ${secs(turnTotal)} turn; the agent's own work is the rest.`}>
            <span className="h-full bg-p-aries" style={{ width: `${Math.max(0.6, prefillShare * 100)}%` }} />
            <span className="h-full bg-accent" style={{ width: `${decodeShare * 100}%` }} />
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
            <span>
              <span className="mr-1.5 inline-block size-2.5 rounded-sm bg-p-aries align-middle" aria-hidden />
              prefill {secs(r.prefillPerTurnMs / 1000)}
            </span>
            <span>
              <span className="mr-1.5 inline-block size-2.5 rounded-sm bg-accent align-middle" aria-hidden />
              writing the reply {secs(r.modelSecondsPerTurn - r.prefillPerTurnMs / 1000)}
            </span>
            <span>
              <span className="mr-1.5 inline-block size-2.5 rounded-sm border border-line bg-surface-2 align-middle" aria-hidden />
              tools and commands {secs(s.outsideSeconds)}
            </span>
          </p>

          <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            {[
              ["decoding, each agent", `${n(r.tokPerSecEach)} tok/s`, `${n(r.tokPerSecTotal)} tok/s together`],
              ["a turn's prefill, cache hitting", secs(r.prefillPerTurnMs / 1000), `KV: ${n(r.kvPerTokenKB)} KiB a token`],
              ["the last turn on a cache miss", secs(r.missLastTurnMs / 1000), `${n(r.missLastTurnMs / Math.max(r.prefillPerTurnMs, 0.001))}× a hit`],
              ["one task, start to finish", secs(r.taskSeconds), `${n(r.finalContext)} tokens by the end`],
              ["GPU busy", pct(r.gpuBusyShare), `${pct(r.aloneBusyShare)} with one agent`],
              ["per task", usd(r.costPerTask), `${n(r.tasksPerHour, 1)} tasks a GPU-hour`],
            ].map(([k, v, sub]) => (
              <div key={k} className="flex flex-col-reverse justify-end">
                <dt className="mt-1 text-sm text-ink-2">
                  {k}
                  <span className="block text-xs text-ink-3">{sub}</span>
                </dt>
                <dd className="text-2xl font-semibold tracking-[-0.03em] tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>

          {r.fits && (
            <p className="mt-6 max-w-[70ch] leading-relaxed text-ink-2">
              With one agent at a time the GPU works {pct(r.aloneBusyShare)} of the time: the rest it waits for tools and commands. That is the
              shape behind my FYP finding that serving jobs held the A100 about seven times longer than the agents used it.{" "}
              {s.agents > 1
                ? `${s.agents} agents at once raise that to ${pct(r.gpuBusyShare)} and bring a task to ${usd(r.costPerTask)}${r.overBudget ? ", but only if their caches fit" : ""}.`
                : "More agents at once is the cheapest fix, as long as their caches fit."}
            </p>
          )}

          <details className="mt-5">
            <summary className="cursor-pointer text-sm text-ink-2 hover:text-ink">The arithmetic, and what it leaves out</summary>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-2">
              <li>KV cache per token: 2 (keys and values) × layers × KV heads × head width × 2 bytes. Weights: parameters × 2 bytes (BF16) or 1 (FP8).</li>
              <li>
                Memory: {pct(assumptions.memoryFraction)} of the GPU for weights and cache, {assumptions.activationsGB} GB of that for activations. The
                worst case counts every agent at its last turn.
              </li>
              <li>Decoding is memory-bound: each step reads the weights and every agent&apos;s cache once, at {pct(assumptions.bandwidthEfficiency)} of peak bandwidth, with caches at half their final size on average.</li>
              <li>Prefill is compute-bound: 2 FLOPs per parameter per token, plus attention over the context, at {pct(assumptions.computeEfficiency)} of dense BF16 peak.</li>
              <li>Left out: batching and scheduling overheads, chunked prefill, speculative decoding, several GPUs, and the network between the agents and the model.</li>
              <li>
                Sources: each model&apos;s config.json on Hugging Face, NVIDIA&apos;s spec pages (dense BF16 is half the &ldquo;with sparsity&rdquo;
                figure), and{" "}
                <a href="https://kipp.ly/transformer-inference-arithmetic/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-4 hover:text-ink">
                  Transformer Inference Arithmetic
                  <ArrowUpRight size={12} aria-hidden />
                </a>
                .
              </li>
            </ul>
          </details>
        </div>
      </div>
    </section>
  );
}
