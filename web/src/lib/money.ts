import type { CostReport } from "@/lib/api";

/**
 * Rounds each value to d decimals so that they add up to `total` rounded the same way, giving the
 * leftover units to the largest remainders first: the way a printed receipt has to add up.
 */
export function roundToTotal(values: number[], total: number, d: number): number[] {
  const k = 10 ** d;
  const out = values.map((v) => Math.floor(v * k + 1e-9));
  let left = Math.round(total * k) - out.reduce((a, b) => a + b, 0);
  const order = values.map((v, i) => [v * k - out[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out.map((v) => v / k);
}

/**
 * This month's bill as printed everywhere it appears (the receipt, the insights, the terminal and
 * /evidence), so the figures agree to the last digit. Four decimals while the list price is under a
 * dollar, two above. Each line is its free part plus its billed part: the free parts add up to the
 * free tier as shown, the billed parts to the bill as shown, and the list price is the two together.
 */
export function printed(r: CostReport) {
  const d = r.list_price >= 1 ? 2 : 4;
  const k = 10 ** d;
  const free = Math.round(r.free_tier * k) / k;
  const bill = Math.round(r.bill * k) / k;
  const freeParts = roundToTotal(
    r.lines.map((l) => l.free),
    r.free_tier,
    d,
  );
  const billedParts = roundToTotal(
    r.lines.map((l) => Math.max(0, l.cost - l.free)),
    r.bill,
    d,
  );
  const lines = r.lines.map((_, i) => Math.round((freeParts[i] + billedParts[i]) * k) / k);
  return { d, lines, free, bill, list: Math.round((free + bill) * k) / k };
}

/** US dollars at d decimals, with a real minus sign. */
export function money(x: number, d: number): string {
  const v = Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${x < 0 ? "−" : ""}US$${v}`;
}
