// The Go server serves this site and its API from one origin, so the default base is "".
// In `next dev` the API runs separately: set NEXT_PUBLIC_API_BASE=http://localhost:8080.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export type Status = {
  status: string;
  version: string;
  commit: string;
  region: string;
  started_at: string;
  uptime_seconds: number;
  requests_total: number;
  latency_ms: { p50: number; p95: number; p99: number };
  recent_ms: number[];
  go_version: string;
  goroutines: number;
  heap_mb: number;
};

/** This site's availability from Cloud Monitoring uptime checks (see api/internal/slo). */
export type SloReport = {
  available: boolean;
  reason?: string;
  target: number;
  window_days: number;
  checks: number;
  passed: number;
  availability: number;
  budget_minutes: number;
  budget_remaining: number;
  downtime_minutes: number;
  since?: string;
  days: { end: string; checks: number; passed: number }[];
  updated: string;
  stale?: boolean;
  /** The error-budget policy the deploy pipeline enforces (scripts/budget-gate.sh). */
  releases?: "open" | "frozen" | "unknown";
};

/** One row of the cost receipt, at list price (see api/internal/cost). */
export type CostLine = { item: string; quantity: number; unit: string; price: number; cost: number; free: number };

/** The price list and the service's limits, so a what-if is priced the same way as the receipt. */
export type CostPrices = {
  as_of: string;
  egress_tiers?: { up_to_gib?: number; per_gib: number }[]; // absent from servers before 2026-11-13
  vcpu_second: number;
  gib_second: number;
  per_million_requests: number;
  per_gib_egress: number;
  free_vcpu_seconds: number;
  free_gib_seconds: number;
  free_requests: number;
  free_credit_vcpu: number;
  free_credit_memory: number;
  free_credit_requests: number;
  billing_step_seconds: number;
  vcpu: number;
  memory_gib: number;
  max_instances: number;
  concurrency: number;
  probes_per_minute: number;
  ceiling_per_month: number;
  instance_second: number;
};

/** What this site has cost this month: its own usage from Cloud Monitoring at list prices. */
export type CostReport = {
  available: boolean;
  reason?: string;
  start: string;
  end: string;
  days: number;
  month_days: number;
  usage: { requests: number; billable_seconds: number; vcpu_seconds: number; gib_seconds: number; egress_bytes: number };
  lines: CostLine[];
  list_price: number;
  free_tier: number;
  bill: number;
  projected_list_price: number;
  projected_bill: number;
  per_ten_thousand: number;
  billed_seconds_per_request: number;
  probe_requests: number;
  probe_share: number;
  probe_billed_share: number;
  prices: CostPrices;
  updated: string;
  stale?: boolean;
};

/** The OpenTelemetry spans of one Ask request (see api/internal/tracing). */
export type AskTrace = {
  trace_id: string;
  total_ms: number;
  exported: boolean;
  spans: { name: string; id: string; parent?: string; start_ms: number; duration_ms: number; attrs?: Record<string, string> }[];
};

export type AskResult = {
  answer: string;
  sources: { id: string; title: string }[];
  mode: "llm" | "retrieval";
  latency_ms: number;
  cached: boolean;
  trace?: AskTrace;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const ms = init?.timeoutMs ?? 8000;
  // A TimeoutError that names the wait, so messages can say how long it really was (4 s for status).
  const timer = setTimeout(() => controller.abort(new DOMException(`No answer within ${ms / 1000} s`, "TimeoutError")), ms);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status);
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  status: () => request<Status>("/api/status", { timeoutMs: 4000 }),
  // The first call after a cold start reads Cloud Monitoring, which can take a few seconds.
  slo: () => request<SloReport>("/api/slo", { timeoutMs: 15000 }),
  // Like slo, the first call after a cold start reads Cloud Monitoring (five metrics).
  cost: () => request<CostReport>("/api/cost", { timeoutMs: 20000 }),
  ask: (question: string) =>
    request<AskResult>("/api/ask", { method: "POST", body: JSON.stringify({ question }), timeoutMs: 20000 }),
  contact: (payload: { name: string; email: string; message: string; company: string }) =>
    // The server delivers to the webhook (up to 6 s with retries) before it answers.
    request<{ ok: boolean }>("/api/contact", { method: "POST", body: JSON.stringify(payload), timeoutMs: 12000 }),
};
