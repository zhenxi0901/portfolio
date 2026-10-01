import { fyp } from "@/content/profile";

const FILL: Record<string, string> = {
  prep: "var(--accent-ink)",
  agent: "var(--ink-3)",
  grade: "var(--line-strong)",
};

/** Where a multi-service agent run's wall clock goes. Setup is the story, so it carries the accent. */
export function WallClockBar() {
  const total = fyp.wallClock.reduce((s, p) => s + p.share, 0);
  return (
    <figure className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <figcaption>
        <p className="font-semibold">Where a run&apos;s wall clock goes</p>
        <p className="mt-0.5 text-sm text-ink-2">Inside the agent phase, tool calls are only 2.7% of the time</p>
      </figcaption>
      <div className="mt-5 flex h-9 w-full gap-[2px]" role="img" aria-label="Setup 23%, agent working 72%, grading 4%">
        {fyp.wallClock.map((part, i) => (
          <div
            key={part.key}
            className="grow-x h-full first:rounded-l-lg last:rounded-r-lg"
            style={
              {
                background: FILL[part.key],
                width: `${(part.share / total) * 100}%`,
                "--grow-delay": `${0.1 + i * 0.15}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-3 gap-3 text-sm">
        {fyp.wallClock.map((part) => (
          <li key={part.key} className="flex items-start gap-2">
            <span className="mt-1.5 size-2.5 shrink-0 rounded-[3px]" style={{ background: FILL[part.key] }} />
            <span>
              <span className="font-semibold tabular-nums">{part.share}%</span>
              <span className="block text-ink-2">{part.label}</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
