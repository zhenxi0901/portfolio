"use client";

import { Plug, PlugsConnected } from "@phosphor-icons/react";
import { losses } from "@/content/unplug";
import { partName, PARTS, replug, unplug, type Part } from "@/lib/unplug";
import { cn } from "@/lib/utils";

/** Opens the switches: in the map's empty corner on a wide screen, under the list on a phone. */
export function UnplugToggle({ cut, open, setOpen }: { cut: Part | null; open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <div className="max-md:mt-5 md:absolute md:left-0 md:top-4 md:z-20">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="unplug-parts"
        onClick={() => {
          if (open) replug();
          setOpen(!open);
        }}
        className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-bg px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
      >
        {open ? <PlugsConnected size={16} aria-hidden /> : <Plug size={16} aria-hidden />}
        {cut ? "Plug it back in" : open ? "Leave it all plugged in" : "Unplug something"}
      </button>
    </div>
  );
}

/** One switch per part that can go. One part at a time: two outages at once explain neither. */
export function UnplugParts({ cut, open, onChoose }: { cut: Part | null; open: boolean; onChoose: () => void }) {
  return (
    <div id="unplug-parts" hidden={!open} className="max-md:mt-3 md:mb-4">
      <p id="unplug-label" className="text-[13px] text-ink-3">
        Take one part of this site away, in this tab only, and see what is left:
      </p>
      <div role="group" aria-labelledby="unplug-label" className="mt-2 flex flex-wrap gap-1.5">
        {PARTS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={cut === p}
            onClick={() => {
              if (cut === p) return replug();
              onChoose();
              unplug(p);
            }}
            className="rounded-md border border-line px-2.5 py-1 text-[13px] text-ink-2 transition-colors hover:border-ink-3 hover:text-ink aria-pressed:border-critical aria-pressed:text-ink"
          >
            {partName[p]}
          </button>
        ))}
      </div>
    </div>
  );
}

const withoutName: Partial<Record<Part, string>> = { api: "the API", gfe: "Google's front end", probes: "the uptime checks" };

/** What is lost and what is not, in place of the map's caption while something is unplugged. */
export function UnplugEffect({ part }: { part: Part }) {
  const l = losses[part];
  const rows: [string, string][] = [
    ["Lost", l.lost],
    ["Still works", l.works],
    ["Comes back", l.back],
    ["Why I accept it", l.why],
  ];
  return (
    <div className="max-w-[74ch]">
      <p className="sr-only">Without {withoutName[part] ?? partName[part]}:</p>
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v], i) => (
          <div key={k}>
            <dt className={cn("text-[13px] font-medium", i === 0 ? "text-critical" : "text-ink-3")}>{k}</dt>
            <dd className="mt-0.5 text-sm leading-relaxed text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
