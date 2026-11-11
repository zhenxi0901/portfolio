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

/** Whether an error is a request giving up on its own (a timeout), as opposed to being cancelled. */
export const isTimeout = (e: unknown) => e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
