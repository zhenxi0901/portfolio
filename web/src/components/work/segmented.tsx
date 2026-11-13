"use client";

import { motion } from "motion/react";
import { useId } from "react";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-fit self-start rounded-full border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className="relative rounded-full px-3.5 py-1.5 text-[13px] font-medium text-ink-2 transition-colors aria-checked:text-on-accent"
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${id}`}
              className="absolute inset-0 rounded-full bg-accent"
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
