import { skillGroups } from "@/content/profile";

/**
 * The tools I use, grouped by what they are for, as plain text that stays still. (It was a marquee of
 * logos, which said little more than that the logos exist.) The id stays "stack": Ask's skills answer
 * links here.
 */
export function Tools() {
  return (
    <section id="stack" aria-labelledby="stack-title" className="mx-auto max-w-[1320px] scroll-mt-20 px-4 py-20 sm:px-8 sm:py-24">
      <h2 id="stack-title" className="text-[clamp(1.75rem,3.4vw,2.625rem)] font-semibold leading-[1.12] tracking-[-0.022em]">
        The tools I use
      </h2>
      <dl className="mt-10 grid gap-x-12 gap-y-7 border-t border-line pt-8 sm:grid-cols-2 lg:grid-cols-3">
        {skillGroups.map((g) => (
          <div key={g.name}>
            <dt className="text-sm font-medium text-ink-3">{g.name}</dt>
            <dd className="mt-1.5 max-w-[46ch] text-[15px] leading-relaxed text-ink">{g.items.join(", ")}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
