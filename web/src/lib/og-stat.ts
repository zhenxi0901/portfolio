import { stats } from "@/content/profile";

/** A hero number for a share card, read from the same list as the page, so the two cannot disagree. */
export function heroStat(value: number) {
  const s = stats.find((x) => x.value === value);
  if (!s) throw new Error(`share card: no hero stat with value ${value}`);
  return { value: `${s.prefix ?? ""}${s.value}${s.suffix ?? ""}`, label: s.label };
}
