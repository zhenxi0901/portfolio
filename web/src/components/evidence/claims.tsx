"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { api, type ClaimResult, type ClaimsReport } from "@/lib/api";
import { cn } from "@/lib/utils";

// One request per page load, shared by the summary and every claim.
let request: Promise<ClaimsReport> | null = null;

type State = { report: ClaimsReport | null; failed: boolean };

/** What became of the claims when they were last tested: null while it loads. */
function useClaims(): State {
  const [state, setState] = useState<State>({ report: null, failed: false });
  useEffect(() => {
    let alive = true;
    (request ??= api.claims())
      .then((report) => alive && setState({ report, failed: false }))
      .catch(() => {
        request = null;
        if (alive) setState({ report: null, failed: true });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** "12 min ago", "3 h ago", "2 days ago". */
export function ago(iso: string): string {
  const m = Math.max(0, (Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1.5) return "a minute ago";
  if (m < 90) return `${Math.round(m)} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}

const link = "inline-flex items-center gap-0.5 underline decoration-line-strong underline-offset-4 hover:text-ink";

function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={link}>
      {children}
      <ArrowUpRight size={12} aria-hidden />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** A state, so green or red, and always in words too. */
function Dot({ tone }: { tone: "good" | "critical" | "none" }) {
  return <span aria-hidden className={cn("mt-[0.5em] size-2 shrink-0 rounded-full", tone === "good" ? "bg-good" : tone === "critical" ? "bg-critical" : "bg-line-strong")} />;
}

/**
 * The last run in a line, and beside it the claim that is false on purpose. If that one's test passes, the run
 * has shown that the tests cannot tell true from false, and the page says so instead of the count.
 */
export function ClaimsTested({ falseClaim, total, repo }: { falseClaim: string; total: number; repo: string }) {
  const { report: r, failed } = useClaims();
  const lie = r?.false_claim;
  const broken = r?.available === true && !r.trustworthy;
  return (
    <section aria-labelledby="tested" className="mt-10 grid gap-8 rounded-3xl border border-line bg-surface p-6 sm:p-7 lg:grid-cols-2 lg:gap-12">
      <div className="min-h-[10.5rem]">
        <h2 id="tested" className="text-sm font-medium text-ink-3">
          Tested, not just written
        </h2>
        {/* Only the count is announced: the rest is on the page already, or repeats it. */}
        <p aria-live="polite" className={cn("mt-2 text-3xl font-semibold tracking-[-0.03em]", !r?.available ? "text-ink-3" : broken || r.failing ? "text-critical" : r.stale ? "text-ink" : "text-live-ink")}>
          {r?.available ? (broken ? "Not to be trusted" : `${r.holding} of ${r.total} claims hold`) : `${total} claims`}
        </p>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">
          {r?.available ? (
            <>
              {r.failing > 0 && <>{r.failing === 1 ? "One does not" : `${r.failing} do not`}, and the claim says what its test saw. </>}
              {r.unknown > 0 && <>{r.unknown === 1 ? "One could" : `${r.unknown} could`} not be checked, because the record it is checked against did not answer. </>}
              Tested {ago(r.tested!)} on commit <span className="font-mono text-[13px]">{r.commit}</span>
              {r.stale ? "; GitHub is not answering, so a newer run may exist" : ""}.{" "}
            </>
          ) : (
            <>{r?.reason ?? (failed ? "The results did not load just now." : "Reading the last results…")} </>
          )}
          Every claim here that can be checked from outside has a test. A workflow on GitHub runs them against the live site after each deploy and
          several times a day, and the results are its record, not mine.
        </p>
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
          {r?.run && <Out href={r.run}>The last run</Out>}
          <Out href={`${repo}/blob/main/claims/tests.mjs`}>The tests</Out>
          <Out href={`${repo}/actions/workflows/claims.yml`}>Every run</Out>
        </p>
      </div>
      <div className="border-t border-line pt-6 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
        <p className="text-sm font-medium text-ink-3">And one that is false on purpose</p>
        <p className="mt-2 text-lg font-semibold leading-snug tracking-[-0.02em]">{falseClaim}</p>
        <p className="mt-2 max-w-[48ch] text-[15px] leading-relaxed text-ink-2">
          It has a test like the rest, and the test has to fail. If it ever passes, the tests cannot tell true from false, and the others mean nothing.
        </p>
        <p className="mt-3 flex min-h-[1.5rem] gap-2.5 text-sm leading-relaxed">
          {lie && (
            <>
              <Dot tone={lie.verdict === "fails" ? "good" : "critical"} />
              <span className={lie.verdict === "fails" ? "text-ink" : "font-medium text-critical"}>
                {lie.verdict === "fails" ? "Failed, as it has to. " : lie.verdict === "holds" ? "It passed. Stop trusting the rest. " : "It could not be told, so the rest proves nothing. "}
                <span className="text-ink-2">{lie.saw}</span>
              </span>
            </>
          )}
        </p>
      </div>
    </section>
  );
}

const WORD: Record<ClaimResult["verdict"], string> = { holds: "Holds.", fails: "Does not hold.", unknown: "Could not be checked." };

/** One claim's own result. Two lines are kept for it, so nothing below moves when it arrives. */
export function ClaimVerdict({ id }: { id: string }) {
  const { report } = useClaims();
  const c = report?.available ? report.claims.find((x) => x.id === id) : undefined;
  return (
    <p className="mt-3 flex min-h-[2.75rem] max-w-[78ch] gap-2.5 text-sm leading-relaxed text-ink-2">
      {c && (
        <>
          <Dot tone={c.verdict === "holds" ? "good" : c.verdict === "fails" ? "critical" : "none"} />
          <span>
            <span className={cn("font-medium", c.verdict === "fails" ? "text-critical" : "text-ink")}>{WORD[c.verdict]}</span> {c.verdict === "unknown" ? c.saw.replace(/^Could not be checked: /, "") : c.saw}
          </span>
        </>
      )}
    </p>
  );
}
