/**
 * Availability as the site writes it everywhere: two decimals, rounded down so it never claims more
 * than was measured, and a plain "100%" when no check failed (not a "100.00%" that looks made up).
 * The Go server's slo.Uptime is the same rule, for the cards and the badge.
 */
export function uptime(x: number): string {
  if (x >= 1) return "100%";
  return `${(Math.floor(x * 1e4 + 1e-6) / 100).toFixed(2)}%`;
}
