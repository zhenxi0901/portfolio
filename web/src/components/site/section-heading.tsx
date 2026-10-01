import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/reveal";

/** Headline stacked over an optional short line. No eyebrows by default (taste-skill 4.7). */
export function SectionHeading({
  title,
  lead,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  lead?: React.ReactNode;
  eyebrow?: string;
  className?: string;
}) {
  return (
    <Reveal className={cn("max-w-3xl", className)}>
      {eyebrow && <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-ink-3">{eyebrow}</p>}
      <h2 className="text-[clamp(2.25rem,5vw,4rem)] font-semibold leading-[0.98] tracking-[-0.045em]">{title}</h2>
      {lead && <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-ink-2">{lead}</p>}
    </Reveal>
  );
}
