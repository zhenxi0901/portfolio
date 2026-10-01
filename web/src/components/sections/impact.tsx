import { stats } from "@/content/profile";
import { NumberTicker } from "@/components/motion/number-ticker";
import { Reveal } from "@/components/motion/reveal";

export function Impact() {
  return (
    <section aria-label="Impact in numbers" className="border-y border-line bg-surface">
      <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-y-10 px-4 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.1fr_1fr_1fr_1fr] lg:gap-x-10">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.08}>
            <p className="text-[clamp(3rem,6vw,4.75rem)] font-semibold leading-none tracking-[-0.05em]">
              {s.prefix}
              <NumberTicker value={s.value} decimals={s.decimals} />
              <span className="text-accent-ink">{s.suffix}</span>
            </p>
            <p className="mt-3 max-w-[28ch] text-sm leading-relaxed text-ink-2">{s.label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
