/** Where the benchmark's GPU lived, how the agents reached it, and how much of it they used. */
export function GpuLink() {
  return (
    <figure className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <figcaption>
        <p className="font-semibold">A GPU in one place, the agents in another</p>
        <p className="mt-0.5 text-sm text-ink-2">
          Qwen3-4B served with SGLang on an A100 at NSCC, Singapore&apos;s national supercomputer, for agents running on Google Cloud.
        </p>
      </figcaption>

      <div className="mt-5 grid items-center gap-3 sm:grid-cols-[1fr_minmax(120px,0.8fr)_1fr]">
        <Box title="NSCC A100" lines={["SGLang server", "Qwen3-4B"]} />
        <div className="relative flex flex-col items-center justify-center py-2 sm:py-0" aria-hidden>
          <span className="tunnel h-px w-full" />
          <span className="mt-2 rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[11px] text-ink-2">SSH tunnel through IAP</span>
        </div>
        <Box title="Google Cloud VM" lines={["ARIES runner", "task sandboxes, live apps"]} />
      </div>

      <div className="mt-6 grid gap-3 text-sm" role="img" aria-label="The serving jobs held the GPU for about seven times as long as the agent runs used it">
        <div>
          <p className="text-ink-2">GPU time the serving jobs held</p>
          <div className="mt-1 h-3 rounded-full bg-ink-3/45" />
        </div>
        <div>
          <p className="text-ink-2">GPU time the agent runs used</p>
          <div className="mt-1 h-3 w-[14%] rounded-full bg-accent-ink" />
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-ink-2">
        The serving jobs held the A100 for <span className="font-semibold text-ink">about 7×</span> as long as the agent runs used
        it. A reserved accelerator that sits idle is the AI version of an oversized pod.
      </p>
    </figure>
  );
}

function Box({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-2xl border border-line-strong bg-surface-2/50 px-4 py-3">
      <p className="font-semibold">{title}</p>
      {lines.map((l) => (
        <p key={l} className="text-sm text-ink-2">
          {l}
        </p>
      ))}
    </div>
  );
}
