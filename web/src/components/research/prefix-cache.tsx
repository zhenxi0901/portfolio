"use client";

import { useId, useState } from "react";

// Illustrative sizes, not measurements: a fixed head (system prompt and tool schemas) and what each
// turn appends (the model's reply and the tool's result). With these, the cached share reaches the
// measured ~96% at about 40 turns.
const HEAD = 6000;
const PER_TURN = 450;
const MAX_TURNS = 40;
const ROW = 5;
const GAP = 1;
const W = 600;

const promptAt = (t: number) => HEAD + PER_TURN * t;

function totals(turns: number) {
  let sent = 0;
  for (let t = 0; t < turns; t++) sent += promptAt(t);
  const computed = HEAD + PER_TURN * (turns - 1);
  return { sent, computed, share: 1 - computed / sent };
}

/** An agent run re-sends its whole conversation every turn; a prefix cache only computes what is new. */
export function PrefixCache() {
  const [turns, setTurns] = useState(24);
  const id = useId();
  const { computed, sent, share } = totals(turns);
  const max = promptAt(MAX_TURNS - 1);
  const height = MAX_TURNS * (ROW + GAP);

  return (
    <figure className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <figcaption>
        <p className="font-semibold">Why a long agent run doesn&apos;t recompute everything</p>
        <p className="mt-0.5 text-sm text-ink-2">
          Every turn re-sends the whole conversation. A prefix cache keeps what the server has already seen, so only the new
          tokens are computed.
        </p>
      </figcaption>

      <div className="mt-5 flex items-center gap-4">
        <label htmlFor={id} className="shrink-0 text-sm text-ink-2">
          Turns <span className="inline-block w-6 font-semibold tabular-nums text-ink">{turns}</span>
        </label>
        <input
          id={id}
          type="range"
          min={1}
          max={MAX_TURNS}
          value={turns}
          onChange={(e) => setTurns(Number(e.target.value))}
          className="w-full accent-[var(--accent-ink)]"
        />
      </div>

      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="mt-4 block h-auto w-full"
        role="img"
        aria-label={`Prompt size per turn for ${turns} turns: each turn reuses the previous prompt from cache and computes only the new part.`}
        preserveAspectRatio="none"
      >
        {Array.from({ length: MAX_TURNS }, (_, t) => {
          const y = t * (ROW + GAP);
          const total = (promptAt(t) / max) * W;
          const cached = t === 0 ? 0 : (promptAt(t - 1) / max) * W;
          const live = t < turns;
          return (
            <g key={t} style={{ opacity: live ? 1 : 0.18, transition: "opacity 0.2s" }}>
              <rect x={0} y={y} width={cached} height={ROW} rx={1.5} style={{ fill: "var(--accent)", opacity: 0.75 }} />
              <rect x={cached} y={y} width={Math.max(total - cached, 2)} height={ROW} rx={1.5} style={{ fill: "var(--ink)" }} />
            </g>
          );
        })}
      </svg>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-accent opacity-75" /> served from cache
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-ink" /> computed this turn
        </li>
        <li className="text-ink-3">one row per turn, longest prompt on the right</li>
      </ul>

      <div className="mt-5 grid gap-2 text-sm">
        <div>
          <div className="flex justify-between text-ink-2">
            <span>Tokens sent across the run</span>
            <span className="tabular-nums">100%</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-ink-3/40" />
        </div>
        <div>
          <div className="flex justify-between text-ink-2">
            <span>Tokens actually computed</span>
            <span className="tabular-nums">{((computed / sent) * 100).toFixed(1)}%</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${(computed / sent) * 100}%` }} />
          </div>
        </div>
      </div>

      <p className="mt-5 rounded-2xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink-2">
        <span className="font-semibold text-ink">Measured, not illustrated:</span> across 320 runs, 96% of input tokens came from
        the prefix cache, on a hosted API and on self-hosted SGLang. This illustration reaches{" "}
        <span className="tabular-nums">{(share * 100).toFixed(0)}%</span> at {turns} {turns === 1 ? "turn" : "turns"}.
      </p>
    </figure>
  );
}
