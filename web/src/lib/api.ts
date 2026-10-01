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

export type AskResult = {
  answer: string;
  sources: { id: string; title: string }[];
  mode: "llm" | "retrieval";
  latency_ms: number;
  cached: boolean;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 8000);
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
  ask: (question: string) =>
    request<AskResult>("/api/ask", { method: "POST", body: JSON.stringify({ question }), timeoutMs: 20000 }),
  contact: (payload: { name: string; email: string; message: string; company: string }) =>
    request<{ ok: boolean }>("/api/contact", { method: "POST", body: JSON.stringify(payload) }),
};
