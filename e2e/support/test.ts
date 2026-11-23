import { randomBytes } from "node:crypto";
import { test as base, expect } from "@playwright/test";
import { Readings } from "./readings.ts";

export { expect };

type Fixtures = {
  /** Console messages the test causes on purpose, such as the 503s it asks the server for. Any other one fails it. */
  expectedLogs: RegExp | undefined;
  /** The readings that come from Google Cloud and GitHub, answered by the test. */
  readings: Readings;
  /** Runs after every test: the pages it opened logged nothing unexpected and kept to this site. */
  quietPages: void;
};

/**
 * An address of the test's own, from the range reserved for documentation. The server limits requests per client and takes the client
 * from X-Forwarded-For, so tests running side by side, or the same test run twice, never use up each other's allowance. It groups IPv6
 * clients by /64, so the half that differs is the first.
 */
function ownAddress(): string {
  const bytes = randomBytes(4).toString("hex");
  return `2001:db8:${bytes.slice(0, 4)}:${bytes.slice(4)}::1`;
}

/** The test every spec uses: Playwright's own, with what this site needs around it. */
export const test = base.extend<Fixtures>({
  expectedLogs: [undefined, { option: true }],

  extraHTTPHeaders: async ({ extraHTTPHeaders }, use) => {
    await use({ ...extraHTTPHeaders, "X-Forwarded-For": ownAddress() });
  },

  readings: [
    async ({ context }, use) => {
      const readings = await Readings.taken();
      await readings.stub(context);
      await use(readings);
    },
    { auto: true },
  ],

  quietPages: [
    async ({ context, baseURL, expectedLogs }, use) => {
      const problems: string[] = [];
      context.on("console", (message) => {
        if (message.type() !== "error" && message.type() !== "warning") return;
        if (expectedLogs?.test(message.text())) return;
        problems.push(`console ${message.type()} on ${message.page()?.url()}: ${message.text()}`);
      });
      context.on("weberror", (error) => problems.push(`uncaught on ${error.page()?.url()}: ${error.error()}`));
      const host = new URL(baseURL!).host;
      context.on("request", (request) => {
        const url = new URL(request.url());
        if (url.protocol.startsWith("http") && url.host !== host) problems.push(`request to another host: ${request.url()}`);
      });
      await use();
      expect(problems, "nothing unexpected in the console, and no request to another host").toEqual([]);
    },
    { auto: true },
  ],
});
