// Runs the tests of the site's claims. A claim holds, fails, or cannot be told; and one claim that is false on
// purpose has to fail, or nothing else the run says is worth anything.
import { setTimeout as sleep } from "node:timers/promises";

/** Thrown by a test that cannot tell. A service that is down says nothing about the claim, either way. */
export class CannotTell extends Error {}

const SAW_MAX = 240;
const clip = (s) => (s.length > SAW_MAX ? `${s.slice(0, SAW_MAX - 1)}…` : s);

/**
 * One claim's verdict. A test is asked again until it holds, because a deploy under way or a service having a bad
 * minute can fail any of them once; a claim fails only if every try fails.
 */
async function verdictOn(claim, test, world, tries, pause) {
  if (!test) return { id: claim.id, verdict: "fails", saw: "There is no test for this claim." };
  let last;
  for (let n = 1; n <= tries; n++) {
    if (n > 1) await pause(n - 1);
    try {
      const { holds, saw } = await test(world, claim.facts ?? {});
      last = { id: claim.id, verdict: holds ? "holds" : "fails", saw: clip(saw) };
    } catch (err) {
      last =
        err instanceof CannotTell
          ? { id: claim.id, verdict: "unknown", saw: clip(`Could not be checked: ${err.message.replace(/[.]$/, "")}.`) }
          : // Anything else is an answer the test could not make sense of, and a claim nobody can read does not hold.
            { id: claim.id, verdict: "fails", saw: clip(`The answer was not in the form the test expects (${err.message}).`) };
    }
    if (last.verdict === "holds") break;
  }
  return last;
}

/**
 * Tests every claim the site publishes (/evidence.json) and the false one.
 * @param {{ claims: {id: string, facts?: object}[], falseClaim: {id: string}, tests: Record<string, Function>, world: object, tries?: number, pause?: (n: number) => Promise<void>, report?: (r: object) => void }} o
 */
export async function testClaims({ claims, falseClaim, tests, world, tries = 3, pause = (n) => sleep(n * 10_000), report = () => {} }) {
  const results = [];
  for (const claim of claims) {
    const r = await verdictOn(claim, tests[claim.id], world, tries, pause);
    report(r);
    results.push(r);
  }
  const lie = await verdictOn(falseClaim, tests[falseClaim.id], world, 1, pause);
  report(lie);
  // A test whose claim the site no longer makes would go unnoticed, and so would a claim's id that was misspelt.
  const orphans = Object.keys(tests).filter((id) => id !== falseClaim.id && !claims.some((c) => c.id === id));
  const count = (v) => results.filter((r) => r.verdict === v).length;
  const trustworthy = lie.verdict === "fails" && Boolean(tests[falseClaim.id]) && orphans.length === 0;
  return {
    claims: results,
    false_claim: lie,
    orphans,
    total: results.length,
    holding: count("holds"),
    failing: count("fails"),
    unknown: count("unknown"),
    trustworthy,
    ok: trustworthy && count("fails") === 0,
  };
}

/** The run in one line, as the check on GitHub shows it. */
export function headline(v) {
  if (v.false_claim.verdict !== "fails") return "The claim that is false on purpose did not fail, so trust none of these";
  if (v.orphans.length) return `No claim for the test of ${v.orphans.join(", ")}`;
  const unknown = v.unknown ? `, ${v.unknown} could not be checked` : "";
  return `${v.holding} of ${v.total} claims hold${unknown}; the false one fails, as it should`;
}

const WORD = { holds: "holds", fails: "**fails**", unknown: "could not be checked" };
const cell = (s) => s.replaceAll("|", "\\|");

/** The run as a Markdown table, for the workflow's summary and the check's page. */
export function table(v, textOf) {
  const rows = v.claims.map((r) => `| ${cell(textOf(r.id))} | ${WORD[r.verdict]} | ${cell(r.saw)} |`);
  const lie = v.false_claim;
  return [
    "| Claim | Verdict | What the test saw |",
    "|---|---|---|",
    ...rows,
    `| False on purpose: ${cell(textOf(lie.id))} | ${lie.verdict === "fails" ? "fails, as it should" : WORD[lie.verdict]} | ${cell(lie.saw)} |`,
  ].join("\n");
}
