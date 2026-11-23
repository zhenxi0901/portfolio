import { defineConfig } from "@playwright/test";
import { BASE_URL } from "./support/env.ts";

const inCI = !!process.env.CI;

/*
 * The tests run against a copy of the site that is already up: the container CI has just built, or a local one.
 *
 *   BASE_URL  where it is (default http://localhost:8080). Start it with TRUST_PROXY=true: each test sends an address of its own
 *             in X-Forwarded-For, so the server's per-client limits never carry over from one test to the next.
 *   HOOK_URL  where the webhook behind its contact form lists what it was sent, as a JSON array of JSON strings. Without it, the
 *             tests of what arrives are skipped.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  // The lab holds 24 requests at once, which more than four would reach; CI's runner has four cores for them and the site.
  workers: inCI ? 3 : 4,
  retries: inCI ? 1 : 0,
  forbidOnly: inCI,
  timeout: inCI ? 60_000 : 30_000,
  expect: { timeout: 8_000 },
  reporter: [["list"], ["html", { open: "never" }], ...(inCI ? [["github"] as const] : [])],
  use: {
    baseURL: BASE_URL,
    // The Chrome that is installed, here and on GitHub's runners: nothing is downloaded.
    channel: "chrome",
    // One page draws in 3D, the one-page version kept at /v1, and one spec turns that on. Elsewhere it would only make a machine with
    // no graphics card, as CI's are, draw it in software and say so in the console.
    launchOptions: { args: ["--disable-3d-apis"] },
    // The commonest laptop. Tests about another screen say so (support/screens.ts).
    viewport: { width: 1366, height: 768 },
    locale: "en-SG",
    timezoneId: "Asia/Singapore",
    // Most tests are about what a page says and does; the ones about how it moves turn motion back on.
    reducedMotion: "reduce",
    trace: "on-first-retry",
  },
});
