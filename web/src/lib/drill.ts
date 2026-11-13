// The rules of the on-call drills, shared by the page (components/oncall/drill.tsx) and the
// terminal's `oncall` command (lib/shell.ts), so the two can never score a run differently.
import type { Check, Move, Scenario } from "@/content/oncall";

export type Played = { move: Move; at: number };

export type DrillState = {
  phase: "idle" | "paged" | "mitigated" | "resolved";
  /** Simulated minutes since the page. */
  minutes: number;
  log: Played[];
  mitigatedAt: number | null;
  silenced: boolean;
};

export const idle: DrillState = { phase: "idle", minutes: 0, log: [], mitigatedAt: null, silenced: false };
/** The moment the page fires. */
export const paged: DrillState = { ...idle, phase: "paged" };

/** The wall clock some minutes after the page: clock("02:14", 9) is "02:23". */
export function clock(start: string, minutesAfterPage: number) {
  const [h, m] = start.split(":").map(Number);
  const t = h * 60 + m + minutesAfterPage;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

/** "Raise the API timeout" becomes "raise the API timeout": only the first letter, so acronyms stay. */
export const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** The state after a move: its minutes pass, and mitigating or verifying moves the phase on. */
export function play(s: DrillState, move: Move): DrillState {
  const at = s.minutes + move.minutes;
  return {
    phase: move.effect === "mitigate" ? "mitigated" : move.effect === "verify" ? "resolved" : s.phase,
    minutes: at,
    log: [...s.log, { move, at }],
    mitigatedAt: move.effect === "mitigate" ? at : s.mitigatedAt,
    silenced: s.silenced || move.effect === "silence",
  };
}

/** What can be done now: every look, and the actions this phase allows (closing out only once the burn stops). */
export function movesNow(scenario: Scenario, s: DrillState) {
  const looks = scenario.moves.filter((m) => m.kind === "look");
  const acts = scenario.moves.filter((m) => m.kind === "act" && (m.effect === "verify" ? s.phase !== "paged" : s.phase === "paged"));
  return { looks, acts };
}

/** A look already played reveals nothing new; actions can be repeated, and repeated mistakes cost time. */
export const seen = (s: DrillState, m: Move) => m.kind === "look" && s.log.some((e) => e.move.id === m.id);

/** The share of the month's error budget spent: it stops burning when the incident is mitigated. */
export const spent = (scenario: Scenario, s: DrillState) => (s.mitigatedAt ?? s.minutes) * scenario.burnPerMinute;

export function statusLabel(s: DrillState) {
  if (s.phase === "paged") return s.silenced ? "PAGE SILENCED, STILL BURNING" : "PAGE, FIRING";
  return s.phase === "mitigated" ? "MITIGATED, VERIFYING" : "RESOLVED";
}

/** The postmortem's numbers and checks, scored the way a budget policy reads: mitigate first, investigate second. */
export function debrief(scenario: Scenario, s: DrillState) {
  const mitigation = s.log.findIndex((e) => e.move.effect === "mitigate");
  const mitigateMinutes = s.log[mitigation]?.at ?? s.minutes;
  const score = (c: Check): boolean => {
    switch (c.kind) {
      case "before-mitigate":
        return s.log.slice(0, mitigation).some((e) => e.move.evidence === c.evidence);
      case "mitigated-within":
        return mitigateMinutes <= c.minutes;
      case "found":
        return s.log.some((e) => e.move.evidence !== undefined && c.evidence.includes(e.move.evidence));
      case "never":
        return !s.log.some((e) => e.move.effect === c.effect);
      case "always":
        return true;
    }
  };
  return {
    mitigateMinutes,
    checks: scenario.checks.map((c) => ({ ok: score(c), text: c.text.replace("{m}", String(mitigateMinutes)) })),
    wasted: s.log.filter((e) => e.move.effect === "nothing" || e.move.effect === "silence" || e.move.effect === "refused"),
  };
}
