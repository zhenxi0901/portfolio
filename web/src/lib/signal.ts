/** How long the site's own pages wait for its API before giving up on a request. */
export const WAIT_MS = 15_000;

/**
 * A signal that aborts when `signal` does (the visitor cancelled) or after `ms` (the server never
 * answered), whichever comes first. A timeout aborts with a DOMException named "TimeoutError", so
 * the two can be told apart. Written out rather than AbortSignal.any, which older Safari lacks.
 */
export function withTimeout(signal: AbortSignal | undefined, ms = WAIT_MS): AbortSignal {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new DOMException(`No answer within ${ms / 1000} s`, "TimeoutError")), ms);
  ctl.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  if (signal) {
    if (signal.aborted) ctl.abort(signal.reason);
    else signal.addEventListener("abort", () => ctl.abort(signal.reason), { once: true });
  }
  return ctl.signal;
}

/**
 * How many seconds a request waited before it gave up, read from its timeout's own message, so a
 * message can say "within 4 s" when that was the wait. Null when the error does not say.
 */
export function waitedSeconds(e: unknown): number | null {
  const m = e instanceof DOMException ? /within ([0-9.]+) s/.exec(e.message) : null;
  return m ? Number(m[1]) : null;
}

/** "no answer within 4 s", or "no answer in time" when the wait is unknown. */
export const noAnswer = (e: unknown) => {
  const s = waitedSeconds(e);
  return s === null ? "no answer in time" : `no answer within ${s} s`;
};

/** Whether an error is a request giving up on its own (a timeout), as opposed to being cancelled. */
export const isTimeout = (e: unknown) => e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
