import { readFileSync } from "node:fs";
import type { BrowserContext, Route } from "@playwright/test";
import { BASE_URL } from "./env.ts";

/*
 * Three of the site's readings come from Google Cloud and GitHub, and there is neither where the tests run. So the tests answer them,
 * with answers recorded once from the live site and their dates moved to now.
 */

/** The site's availability, as /api/slo answers it. */
export type Slo = {
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
  releases: "open" | "frozen" | "unknown";
};

/** The month's bill, as /api/cost answers it. */
export type Cost = {
  available: boolean;
  reason?: string;
  start: string;
  end: string;
  days: number;
  month_days: number;
  usage: { requests: number; billable_seconds: number; vcpu_seconds: number; gib_seconds: number; egress_bytes: number };
  lines: { item: string; quantity: number; unit: string; price: number; cost: number; free: number }[];
  list_price: number;
  free_tier: number;
  bill: number;
  projected_list_price: number;
  projected_bill: number;
  probe_share: number;
  prices: { as_of: string; ceiling_per_month: number };
  updated: string;
  stale?: boolean;
};

/** The owner's latest public work, as /api/activity answers it. */
export type Activity = {
  items: { kind: "merged" | "review" | "release"; title: string; repo: string; number?: number; url: string; at: string }[];
  updated: string;
  source: "live" | "snapshot";
};

/** What became of one claim when it was last tested. */
export type Verdict = { id: string; verdict: "holds" | "fails" | "unknown"; saw: string };

/** The claims on /evidence when they were last tested, as /api/claims answers it. */
export type Claims = {
  available: boolean;
  reason?: string;
  commit?: string;
  tested?: string;
  run?: string;
  total: number;
  holding: number;
  failing: number;
  unknown: number;
  trustworthy: boolean;
  false_claim?: Verdict;
  claims: Verdict[];
  updated?: string;
  stale?: boolean;
};

const recorded = <T>(name: string): T => JSON.parse(readFileSync(new URL(`./recorded/${name}.json`, import.meta.url), "utf8")) as T;

function sloNow(): Slo {
  const slo = recorded<Slo>("slo");
  const shift = Date.now() - Date.parse(slo.updated);
  const moved = (at: string) => new Date(Date.parse(at) + shift).toISOString();
  return {
    ...slo,
    updated: moved(slo.updated),
    ...(slo.since ? { since: moved(slo.since) } : {}),
    days: slo.days.map((day) => ({ ...day, end: moved(day.end) })),
  };
}

// Only the dates move. The days measured, the usage and every amount stay as recorded, so the bill adds up on any day of any month.
function costNow(): Cost {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { ...recorded<Cost>("cost"), start: start.toISOString(), end: now.toISOString(), updated: now.toISOString() };
}

function activityNow(): Activity {
  const feed = recorded<Activity>("activity");
  const shift = Date.now() - Date.parse(feed.updated);
  const moved = (at: string) => new Date(Date.parse(at) + shift).toISOString();
  return { ...feed, updated: moved(feed.updated), items: feed.items.map((item) => ({ ...item, at: moved(item.at) })) };
}

// Not a recording: every claim the site makes, whichever they are by now, holding, and the one that is false on purpose failing.
let allHold: Promise<Claims> | undefined;
async function claimsNow(): Promise<Claims> {
  type Published = { claims: { id: string }[]; false_claim: { id: string } };
  const response = await fetch(new URL("/evidence.json", BASE_URL));
  if (!response.ok) throw new Error(`${BASE_URL} does not publish what it claims: /evidence.json answered ${response.status}`);
  const published = (await response.json()) as Published;
  const claims = published.claims.map(({ id }): Verdict => ({ id, verdict: "holds", saw: `Seen by the test of ${id}.` }));
  return {
    available: true,
    commit: "abc1234",
    tested: new Date(Date.now() - 20 * 60_000).toISOString(),
    run: "https://github.com/zhenxi0901/portfolio/actions/runs/1",
    total: claims.length,
    holding: claims.length,
    failing: 0,
    unknown: 0,
    trustworthy: true,
    false_claim: { id: published.false_claim.id, verdict: "fails", saw: "The server says it runs go1.27." },
    claims,
    updated: new Date().toISOString(),
  };
}

/** One reading: what a test says it answers from now on, starting with the recording. */
export class Reading<T> {
  private reply!: (route: Route) => Promise<void>;

  constructor(
    readonly path: string,
    readonly recording: T,
  ) {
    this.answer(recording);
  }

  /** Another answer. */
  answer(body: T) {
    this.reply = (route) => route.fulfill({ json: body });
  }

  /** The recording, with some of it changed. */
  change(fields: Partial<T>) {
    this.answer({ ...this.recording, ...fields });
  }

  /** The recording, once the returned function is called: what a slow server does. */
  hold(): () => void {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    this.reply = async (route) => {
      await held;
      await route.fulfill({ json: this.recording });
    };
    return release;
  }

  /** An error. */
  fail(status: number) {
    this.reply = (route) => route.fulfill({ status, body: "" });
  }

  /** No answer at all: the connection drops. */
  drop() {
    this.reply = (route) => route.abort();
  }

  /** Whatever the server being tested says. */
  passThrough() {
    this.reply = (route) => route.continue();
  }

  async stub(context: BrowserContext) {
    await context.route(`**${this.path}`, (route) => this.reply(route));
  }
}

export class Readings {
  readonly slo = new Reading("/api/slo", sloNow());
  readonly cost = new Reading("/api/cost", costNow());
  readonly activity = new Reading("/api/activity", activityNow());
  readonly claims: Reading<Claims>;

  private constructor(claims: Claims) {
    this.claims = new Reading("/api/claims", claims);
  }

  static async taken() {
    return new Readings(await (allHold ??= claimsNow()));
  }

  async stub(context: BrowserContext) {
    for (const reading of [this.slo, this.cost, this.activity, this.claims]) await reading.stub(context);
  }
}
