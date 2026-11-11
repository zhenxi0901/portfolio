"use client";

import { useState } from "react";
import { ArrowCounterClockwise, Minus, PaperPlaneTilt, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/work/segmented";
import { cn } from "@/lib/utils";

// The guards of a control lane, in the order the bridge applies them. The numbers are the lane's
// real ones: setpoints held to 20-30 °C, 6 commands per unit per hour, and a command that does not
// take gets three attempts two minutes apart before the alarm.
const CAP = 6;
const MIN = 20;
const MAX = 30;

type DryRun = "true" | "false" | "fals";
type Tone = "ok" | "refused" | "alarm" | "quiet";
type Entry = { id: number; tone: Tone; text: string };

const TONE: Record<Tone, string> = {
  ok: "border-good/40",
  refused: "border-line-strong",
  alarm: "border-critical/50",
  quiet: "border-line",
};

/** One air-conditioning unit behind a control lane: try to command it and see which guard answers. */
export function ControlViz() {
  const [dryRun, setDryRun] = useState<DryRun>("true");
  const [selector, setSelector] = useState<"auto" | "manual">("auto");
  const [follows, setFollows] = useState(true);
  const [want, setWant] = useState(24);
  const [readback, setReadback] = useState(26);
  const [sent, setSent] = useState(0);
  const [log, setLog] = useState<Entry[]>([]);

  const say = (tone: Tone, text: string) => setLog((l) => [{ id: (l[0]?.id ?? 0) + 1, tone, text }, ...l].slice(0, 4));

  const send = () => {
    if (dryRun === "fals") return say("refused", `The bridge refused to start: DRY_RUN='fals' must be exactly "true" or "false". Nothing runs until it is fixed.`);
    if (dryRun === "true") return say("quiet", `Dry run: would set ${want} °C. Nothing leaves the bridge.`);
    if (want < MIN || want > MAX) return say("refused", `Refused: ${want} °C is outside ${MIN}-${MAX} °C.`);
    if (selector === "manual") return say("refused", "Refused: the unit is on manual. No retry, no alarm; the schedule resumes when the selector goes back.");
    if (sent >= CAP) return say("refused", `Refused: rate cap, ${CAP} commands per unit per hour.`);
    if (follows) {
      setSent((n) => n + 1);
      setReadback(want);
      return say("ok", `Sent. The plant's own readback shows ${want} °C: applied.`);
    }
    setSent((n) => Math.min(CAP, n + 3));
    say("alarm", `Sent, but the readback still shows ${readback} °C after 3 attempts, 2 minutes apart. Alarm: control not applied.`);
  };

  const reset = () => {
    setDryRun("true");
    setSelector("auto");
    setFollows(true);
    setWant(24);
    setReadback(26);
    setSent(0);
    setLog([]);
  };

  const state = dryRun === "fals" ? "stopped" : dryRun === "true" ? "dry run" : "armed";

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-3.5">
          <p className="font-mono text-[11px] text-ink-3">control bridge</p>
          <p className="mt-1 flex items-center gap-2 text-sm font-medium">
            <span className={cn("size-2 rounded-full", state === "armed" ? "bg-critical" : state === "dry run" ? "bg-good" : "bg-ink-3")} aria-hidden />
            {state}
          </p>
          <p className="mt-2 font-mono text-[11px] text-ink-3">
            commands this hour <span className="text-ink">{sent}</span>/{CAP}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-3.5">
          <p className="font-mono text-[11px] text-ink-3">air-conditioning unit</p>
          <p className="mt-1 text-sm font-medium">
            {readback} °C <span className="font-normal text-ink-2">from the plant&apos;s readback</span>
          </p>
          <p className="mt-2 font-mono text-[11px] text-ink-3">
            selector <span className="text-ink">{selector === "auto" ? "auto" : "manual"}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-ink-3">DRY_RUN=</span>
          <Segmented<DryRun>
            label="The bridge's DRY_RUN setting"
            value={dryRun}
            onChange={setDryRun}
            options={[
              { value: "true", label: "true" },
              { value: "false", label: "false" },
              { value: "fals", label: "fals" },
            ]}
          />
        </div>
        <Segmented<"auto" | "manual">
          label="The site's selector"
          value={selector}
          onChange={setSelector}
          options={[
            { value: "auto", label: "Auto" },
            { value: "manual", label: "Manual" },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1">
          <button
            type="button"
            onClick={() => setWant((v) => Math.max(16, v - 1))}
            aria-label="Lower the setpoint"
            className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <Minus size={14} />
          </button>
          <span className="w-14 text-center font-mono text-sm tabular-nums" aria-live="polite">
            {want} °C
          </span>
          <button
            type="button"
            onClick={() => setWant((v) => Math.min(34, v + 1))}
            aria-label="Raise the setpoint"
            className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <Plus size={14} />
          </button>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={follows} onChange={(e) => setFollows(e.target.checked)} className="size-4 accent-[var(--accent-ink)]" />
          The unit follows commands
        </label>
      </div>

      <ol className="min-h-[5.5rem] space-y-2" aria-live="polite" aria-label="What the lane did">
        {log.length === 0 && <li className="text-sm text-ink-3">Set DRY_RUN to &quot;false&quot; to arm the lane, then send a setpoint. Try the typo too.</li>}
        {log.map((e, i) => (
          <li key={e.id} className={cn("rounded-xl border bg-surface px-3 py-2 text-sm leading-snug", TONE[e.tone], i > 0 && "opacity-60")}>
            {e.text}
          </li>
        ))}
      </ol>

      <div className="mt-auto flex gap-2">
        <Button size="sm" onClick={send}>
          <PaperPlaneTilt weight="fill" /> Send the setpoint
        </Button>
        <Button size="sm" variant="secondary" onClick={reset}>
          <ArrowCounterClockwise /> Reset
        </Button>
      </div>
    </div>
  );
}
