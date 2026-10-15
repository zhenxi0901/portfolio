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

/** A small pill naming the product something belongs to, in that product's colour. */
export function ProductTag({ p, className }: { p: ProductKey; className?: string }) {
  const Icon = productIcon[p];
  const tone = productTone[p];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tone.border,
        tone.soft,
        tone.text,
        className,
      )}
    >
      <Icon size={13} weight="bold" aria-hidden />
      {products[p].name}
    </span>
  );
}
