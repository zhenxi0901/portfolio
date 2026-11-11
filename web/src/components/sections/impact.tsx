import { stats } from "@/content/profile";
import { NumberTicker } from "@/components/motion/number-ticker";
import { Reveal } from "@/components/motion/reveal";

export function Impact() {
  return (
    <section aria-label="Impact in numbers" className="border-y border-line bg-surface">
      <div className="mx-auto grid max-w-[1320px] grid-cols-2 gap-x-5 gap-y-10 px-4 py-12 sm:py-14 sm:px-8 lg:grid-cols-[1.1fr_1fr_1fr_1fr] lg:gap-x-10">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.08}>
            <p className="text-[clamp(2.25rem,6vw,4.75rem)] font-semibold leading-none tracking-[-0.05em]">
              {s.prefix}
              <NumberTicker value={s.value} decimals={s.decimals} />
              <span className="text-accent-ink">{s.suffix}</span>
            </p>
            <p className="mt-3 max-w-[28ch] text-[13px] leading-relaxed text-ink-2 sm:text-sm">{s.label}</p>
          </Reveal>
        ))}
      </div>
      <p className="mx-auto max-w-[1320px] px-4 pb-6 text-sm text-ink-3 sm:px-8">
        <a href="/evidence" className="underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-accent-ink">
          Where these numbers come from, and which ones you can check yourself
        </a>
      </p>
    </section>
  );
}
