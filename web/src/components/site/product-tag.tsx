import { Buildings, Flask, Robot } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { products, type ProductKey } from "@/content/products";
import { cn } from "@/lib/utils";

export const productIcon: Record<ProductKey, Icon> = { iot: Buildings, ai: Robot, aries: Flask };

/** Tailwind classes per product. Written out in full so Tailwind can see them. */
export const productTone: Record<ProductKey, { text: string; bg: string; border: string; soft: string }> = {
  iot: { text: "text-p-iot", bg: "bg-p-iot", border: "border-p-iot/50", soft: "bg-p-iot/10" },
  ai: { text: "text-p-ai", bg: "bg-p-ai", border: "border-p-ai/50", soft: "bg-p-ai/10" },
  aries: { text: "text-p-aries", bg: "bg-p-aries", border: "border-p-aries/50", soft: "bg-p-aries/10" },
};

/**
 * The product something belongs to: its name, with the product's colour only as a small mark beside it
 * (the colour tells the three apart at a glance; the name does the work, so it stays in ink).
 */
export function ProductTag({ p, className }: { p: ProductKey; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs font-medium text-ink-2", className)}>
      <span aria-hidden className={cn("h-3 w-1 rounded-[1px]", productTone[p].bg)} />
      {products[p].name}
    </span>
  );
}
