// The numbers the site leads with, read from the lists they live in, so the home page's cards and
// the share images cannot disagree (a share card once said 63 merged PRs while the site said 169).
import { cases, stats } from "@/content/profile";
import type { ProductKey } from "@/content/products";

/** A hero number by its value, as the site writes it ("~15%"). */
export function heroStat(value: number) {
  const s = stats.find((x) => x.value === value);
  if (!s) throw new Error(`no hero stat with value ${value}`);
  return { value: `${s.prefix ?? ""}${s.value}${s.suffix ?? ""}`, label: s.label };
}

const ai = cases.find((c) => c.id === "ai-platform")!.numbers[1];

/** One number per chapter: the home page's cards and its share image show these three. */
export const chapterHeadline: Record<ProductKey, { value: string; label: string }> = {
  iot: heroStat(169),
  ai: { value: ai.value, label: ai.label },
  aries: heroStat(320),
};
