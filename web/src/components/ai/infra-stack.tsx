import { stack } from "@/content/ai-platform";
import { cn } from "@/lib/utils";

/** The AI infrastructure layer by layer, top (models) to bottom (delivery), with my parts marked. */
export function InfraStack({ level = 4 }: { level?: 3 | 4 }) {
  const Name = level === 3 ? "h3" : "h4";
  return (
    <div>
      <p className="mb-4 max-w-[70ch] text-[15px] leading-relaxed text-ink-2">
        Seven layers sit between a facility manager&apos;s question and a model. The ones marked{" "}
        <span className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold text-on-accent">mine</span> are where my
        work is; the rest is the platform I operate.
      </p>
      <ol className="grid gap-2">
        {stack.map((l, k) => (
          <li
            key={l.name}
            className={cn(
              "grid gap-3 rounded-2xl border bg-surface p-4 sm:grid-cols-[200px_1fr] sm:items-start sm:gap-6 sm:p-5",
              l.mine ? "border-accent-ink/50" : "border-line",
            )}
            // Each layer sits slightly further in, so the list reads as a stack rather than a table.
            style={{ marginInline: `${k * 0.25}rem` }}
          >
            <div className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-sm text-ink-3">{k + 1}.</span>
              <Name className="font-semibold">{l.name}</Name>
              {l.mine && <span className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold text-on-accent sm:hidden">mine</span>}
            </div>
            <div className="min-w-0">
              {/* The layer's tools as a line of text rather than a row of chips that look pressable. */}
              <p className="text-[15px] font-medium leading-snug text-ink">{l.tools.join(", ")}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{l.does}</p>
              {l.mine && (
                <p className="mt-2 inline-flex items-start gap-2 text-sm text-ink">
                  <span className="mt-0.5 hidden rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold text-on-accent sm:inline">mine</span>
                  {l.mine}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
