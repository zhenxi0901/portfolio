"use client";

import { useState } from "react";
import { scenarios, type Scenario } from "@/content/oncall";
import { Drill } from "@/components/oncall/drill";
import { useTerminal } from "@/components/providers";
import { ProductTag } from "@/components/site/product-tag";
import { onTabKeys } from "@/lib/tabs";
import { useHashTab } from "@/lib/use-hash-tab";
import { cn } from "@/lib/utils";

type Id = Scenario["id"];
const IDS: readonly Id[] = scenarios.map((s) => s.id);

/**
 * One drill per platform. Both stay mounted, so leaving an incident half-way and coming back keeps
 * your place. The choice is in the address (/oncall#oncall-ai), so a link can open either one.
 */
export function DrillPicker() {
  const [id, setId] = useState<Id>("iot");
  const { runInTerminal } = useTerminal();
  useHashTab("oncall", IDS, setId);
  const choose = (next: Id) => {
    setId(next);
    // In step with the address, without a history entry per click.
    window.history.replaceState(null, "", `#oncall-${next}`);
  };
  return (
    <div id="oncall" className="mt-10 scroll-mt-24">
      <div
        role="tablist"
        aria-label="Which incident"
        onKeyDown={(e) => onTabKeys(e, IDS.length, IDS.indexOf(id), (k) => choose(IDS[k]))}
        className="grid gap-3 sm:grid-cols-2"
      >
        {scenarios.map((s) => {
          const on = s.id === id;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={`oncall-tab-${s.id}`}
              aria-selected={on}
              aria-controls={`oncall-panel-${s.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => choose(s.id)}
              className={cn(
                "flex flex-col items-start gap-2.5 rounded-3xl border p-5 text-left transition-colors",
                on ? "border-accent-ink bg-surface text-ink shadow-sm" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
              )}
            >
              <ProductTag p={s.product} />
              <span className="font-mono text-sm">{s.summary}</span>
            </button>
          );
        })}
      </div>
      {scenarios.map((s) => (
        <div key={s.id} role="tabpanel" id={`oncall-panel-${s.id}`} aria-labelledby={`oncall-tab-${s.id}`} hidden={s.id !== id}>
          <p className="mt-8 max-w-[62ch] text-lg leading-relaxed text-ink-2">{s.intro}</p>
          <p className="mt-3 text-sm text-ink-3">
            Prefer a terminal?{" "}
            <button
              type="button"
              onClick={() => runInTerminal(`oncall ${s.id}`)}
              className="font-medium text-ink underline decoration-accent-ink decoration-2 underline-offset-4 hover:decoration-ink"
            >
              Work this incident as text in the site&apos;s shell
            </button>
          </p>
          <Drill scenario={s} />
        </div>
      ))}
    </div>
  );
}
