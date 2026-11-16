import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/reveal";

/** Headline stacked over an optional short line. No eyebrows by default (taste-skill 4.7). */
export function SectionHeading({
  title,
  lead,
  eyebrow,
  className,
  as: Heading = "h2",
}: {
  title: React.ReactNode;
  lead?: React.ReactNode;
  eyebrow?: string;
  className?: string;
  /**
   * "h1" where the section opens its own page (a chapter): it then takes the chapter title's size, the same as
   * ChapterHeader's. "h3" for a section inside another section's h2.
   */
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <Reveal className={cn("max-w-3xl", className)}>
      {eyebrow && <p className="mb-3 text-sm font-medium text-ink-3">{eyebrow}</p>}
      {/* Editorial proportions: a heading that reads as a sentence, not a billboard. */}
      <Heading
        className={cn(
          "font-semibold",
          Heading === "h1"
            ? "text-[clamp(2.25rem,4.6vw,3.5rem)] leading-[1.05] tracking-[-0.028em]"
            : "text-[clamp(1.75rem,3.4vw,2.625rem)] leading-[1.12] tracking-[-0.022em]",
        )}
      >
        {title}
      </Heading>
      {lead && <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-ink-2">{lead}</p>}
    </Reveal>
  );
}
