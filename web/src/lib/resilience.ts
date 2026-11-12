// Client strategies for the "break it yourself" lab (/break), run against the real server: every
// attempt is a real request to /api/lab/echo, which injects the faults the visitor chose.
//
// The strategies are the textbook ones, kept small enough to read on one screen:
//   give-up  one attempt
//   retry    up to 3 more attempts, exponential backoff with full jitter
//   breaker  retry, plus a circuit breaker that fails fast after 4 failures in a row
//   hedge    a second copy if the first has not answered in 300 ms; the first success wins

import { API_BASE } from "@/lib/api";

export type Strategy = "give-up" | "retry" | "breaker" | "hedge";

export type Faults = { fail: number; slow: number; delayMs: number };

export type Outcome =
  | "ok" // answered 200 in time
  | "slow" // answered 200, after a delay the server injected
  | "error" // answered 503 (injected) or another 5xx
  | "timeout" // no answer in time; the client hung up
  | "busy" // 429: the lab's rate limit or its cap on requests held at once
  | "cancelled" // a hedge that lost the race, hung up on
  | "rejected"; // never sent: the circuit breaker was open

export type Attempt = { start: number; end: number; outcome: Outcome };

export type RequestResult = { id: number; start: number; end: number; ok: boolean; attempts: Attempt[] };

export const TIMEOUT_MS = 1000;
const RETRIES = 3;
const BACKOFF_BASE_MS = 100;
const BACKOFF_CAP_MS = 1000;
const BREAKER_THRESHOLD = 4;
const BREAKER_OPEN_MS = 2000;
const HEDGE_AFTER_MS = 300;

/** What each strategy is, in a line, for the page and its legend. */
export const strategies: { id: Strategy; name: string; detail: string }[] = [
  { id: "give-up", name: "Give up", detail: "One attempt, a 1 s timeout. Whatever goes wrong, the user sees." },
  { id: "retry", name: "Retry", detail: "Up to 3 more attempts, waiting a random 0 to 100·2ⁿ ms (capped at 1 s) between them." },
  { id: "breaker", name: "Retry + circuit breaker", detail: "Retries, but after 4 failures in a row it stops calling for 2 s and fails fast, then lets one call through to test." },
  { id: "hedge", name: "Hedge", detail: "If no answer in 300 ms, sends a second copy; the first success wins and the other is hung up on." },
];

type Clock = () => number;

/** One real request to the lab, timed and classified. Never throws. */
async function attempt(f: Faults, clock: Clock, signal?: AbortSignal): Promise<Attempt> {
  const start = clock();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("timeout"), TIMEOUT_MS);
  const onAbort = () => ctrl.abort("cancelled");
  signal?.addEventListener("abort", onAbort, { once: true });
  const q = new URLSearchParams({ fail: String(f.fail), slow: String(f.slow), delay: String(f.delayMs) });
  try {
    const res = await fetch(`${API_BASE}/api/lab/echo?${q}`, { signal: ctrl.signal, cache: "no-store" });
    const fault = res.headers.get("X-Fault") ?? "";
    await res.body?.cancel().catch(() => {});
    const outcome: Outcome = res.status === 429 ? "busy" : res.ok ? (fault.startsWith("slow") ? "slow" : "ok") : "error";
    return { start, end: clock(), outcome };
  } catch {
    return { start, end: clock(), outcome: ctrl.signal.reason === "cancelled" ? "cancelled" : "timeout" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

const succeeded = (a: Attempt) => a.outcome === "ok" || a.outcome === "slow";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Full jitter: a random wait between 0 and the exponential backoff for this retry. */
const backoff = (retry: number) => Math.random() * Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** retry);

/** A circuit breaker shared by every request in a run: closed, open (fail fast) or half-open (one trial call). */
class Breaker {
  private failures = 0;
  private openUntil = -Infinity;
  private trial = false;
  constructor(private clock: Clock) {}
  /** Whether a call may go out now. */
  allow(): boolean {
    const now = this.clock();
    if (now < this.openUntil) return false;
    if (this.failures >= BREAKER_THRESHOLD) {
      // Half-open: one trial call at a time.
      if (this.trial) return false;
      this.trial = true;
    }
    return true;
  }
  record(ok: boolean) {
    this.trial = false;
    if (ok) {
      this.failures = 0;
      this.openUntil = -Infinity;
      return;
    }
    this.failures++;
    if (this.failures >= BREAKER_THRESHOLD) this.openUntil = this.clock() + BREAKER_OPEN_MS;
  }
}

async function withRetries(f: Faults, clock: Clock, retries: number, breaker: Breaker | null, onAttempt: (a: Attempt) => void): Promise<boolean> {
  for (let retry = 0; ; retry++) {
    if (breaker && !breaker.allow()) {
      const now = clock();
      onAttempt({ start: now, end: now, outcome: "rejected" });
      return false; // fail fast: an open breaker is the answer
    }
    const a = await attempt(f, clock);
    onAttempt(a);
    breaker?.record(succeeded(a));
    if (succeeded(a)) return true;
    if (retry >= retries) return false;
    await wait(backoff(retry));
  }
}

async function hedged(f: Faults, clock: Clock, onAttempt: (a: Attempt) => void): Promise<boolean> {
  const race = new AbortController();
  const tries: Promise<Attempt>[] = [];
  const launch = () => {
    const p = attempt(f, clock, race.signal).then((a) => {
      onAttempt(a);
      return a;
    });
    tries.push(p);
    return p;
  };
  const first = launch();
  const settledEarly = await Promise.race([first.then(() => true), wait(HEDGE_AFTER_MS).then(() => false)]);
  if (settledEarly && succeeded(await first)) return true;
  // No answer in 300 ms, or the first failed fast: the second copy goes out.
  launch();
  // The first success wins and the other copy is hung up on; if both fail, so does the request.
  return new Promise<boolean>((resolve) => {
    let pending = tries.length;
    for (const t of tries) {
      t.then((a) => {
        if (succeeded(a)) {
          race.abort();
          resolve(true);
        } else if (--pending === 0) resolve(false);
      });
    }
  });
}

/**
 * Sends `count` requests, `parallel` at a time, with one strategy against the chosen faults.
 * `onUpdate` gets the results so far after every attempt, for drawing as it happens.
 */
export async function run(
  strategy: Strategy,
  faults: Faults,
  count: number,
  onUpdate: (results: RequestResult[]) => void,
  parallel = 4,
): Promise<RequestResult[]> {
  const t0 = performance.now();
  const clock = () => performance.now() - t0;
  const breaker = strategy === "breaker" ? new Breaker(clock) : null;
  const results: RequestResult[] = [];
  let next = 0;
  const one = async () => {
    while (next < count) {
      const id = next++;
      const r: RequestResult = { id, start: clock(), end: clock(), ok: false, attempts: [] };
      results.push(r);
      let done = false;
      const record = (a: Attempt) => {
        r.attempts.push(a);
        // A hedge hung up on after the winner answered does not make the user wait longer.
        if (!done) r.end = Math.max(r.end, a.end);
        onUpdate([...results]);
      };
      r.ok =
        strategy === "hedge"
          ? await hedged(faults, clock, record)
          : await withRetries(faults, clock, strategy === "give-up" ? 0 : RETRIES, breaker, record);
      done = true;
      r.end = clock();
      onUpdate([...results]);
    }
  };
  await Promise.all(Array.from({ length: parallel }, one));
  return results.sort((a, b) => a.id - b.id);
}

/** Numbers for a finished run. */
export function summarise(results: RequestResult[]) {
  const n = results.length;
  const ok = results.filter((r) => r.ok).length;
  const waits = results.map((r) => r.end - r.start).sort((a, b) => a - b);
  const pct = (p: number) => (waits.length ? waits[Math.min(waits.length - 1, Math.ceil(p * waits.length) - 1)] : 0);
  const sent = results.flatMap((r) => r.attempts).filter((a) => a.outcome !== "rejected");
  const failedCalls = sent.filter((a) => a.outcome === "error" || a.outcome === "timeout" || a.outcome === "busy").length;
  const rejected = results.flatMap((r) => r.attempts).filter((a) => a.outcome === "rejected").length;
  return {
    requests: n,
    ok,
    failed: n - ok,
    p50: pct(0.5),
    p95: pct(0.95),
    calls: sent.length,
    callsPerRequest: n ? sent.length / n : 0,
    failedCalls,
    rejected,
    busy: sent.filter((a) => a.outcome === "busy").length,
  };
}
