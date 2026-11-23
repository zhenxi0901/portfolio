import type { Page } from "@playwright/test";
import { DESKTOP, PHONE } from "../support/screens.ts";
import { visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

const claim = (page: Page, text: RegExp) => page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3, name: text }) });

/** Presses a claim's button: what the server said, beside it. */
async function check(page: Page, what: string) {
  await page.getByRole("button", { name: `Check it now: ${what}` }).click();
  const checked = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: `Check again: ${what}` }) });
  await expect(checked).toBeVisible();
  return checked.locator("[aria-live]");
}

for (const { screen, use } of [
  { screen: "a desktop", use: { ...DESKTOP, colorScheme: "dark" as const } },
  { screen: "a phone", use: PHONE },
]) {
  test.describe(`on ${screen}`, () => {
    test.use(use);
    // The lab's check asks the server for failures on purpose.
    test.use({ expectedLogs: /status of 503/ });

    test("every claim with a button is checked against the running site when it is pressed", async ({ page }) => {
      await visit(page, "/evidence");
      const buttons = page.getByRole("button", { name: /^Check it now: / });
      const names = await buttons.evaluateAll((all) => all.map((button) => button.getAttribute("aria-label")!.replace("Check it now: ", "")));
      expect(names).toEqual(expect.arrayContaining(["the availability", "the running commit", "the MCP server", "this month's bill", "the fault-injection lab"]));
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) {
        const answer = await check(page, name);
        await expect(answer).toContainText(/ asked at \d\d:\d\d:\d\d$/);
        await expect(answer).not.toContainText(/did not answer|No answer within|rate limiting|busy/);
      }
    });
  });
}

test("the availability is the share of checks that passed, against the objective", async ({ page, readings }) => {
  const { passed, checks } = readings.slo.recording;
  await visit(page, "/evidence");
  const answer = await check(page, "the availability");
  await expect(answer).toContainText(
    `${passed.toLocaleString("en-GB")} of ${checks.toLocaleString("en-GB")} uptime-check results passed (Monitoring keeps several per check): 100% against 99.9%.`,
  );
});

test("the running commit is the one the server says, and where it runs", async ({ page, request }) => {
  const status = await (await request.get("/api/status")).json();
  await visit(page, "/evidence");
  await page.route("**/api/status", (route) => route.fulfill({ json: { ...status, commit: "abc1234", region: "asia-southeast1" } }));
  await expect(await check(page, "the running commit")).toContainText(/^Commit abc1234 is running in asia-southeast1; this instance has been up \d/);
});

test("a copy of the site that is not the live one says so", async ({ page, request }) => {
  const status = await (await request.get("/api/status")).json();
  await page.route("**/api/status", (route) => route.fulfill({ json: { ...status, commit: "abc1234", region: "local" } }));
  await visit(page, "/evidence");
  await expect(await check(page, "the running commit")).toContainText("Commit abc1234 is running on a local copy, not the live site.");
});

test("the MCP server names its tools", async ({ page }) => {
  await visit(page, "/evidence");
  await expect(await check(page, "the MCP server")).toContainText(/^HTTP 200\. \d+ tools: ask, search_facts/);
});

test("the bill is the receipt's", async ({ page }) => {
  await visit(page, "/cost");
  const amounts = page.getByRole("row", { name: /^(List price|Free tier|To pay)/ }).getByRole("cell");
  await expect(amounts).toHaveCount(3);
  const [list, , total] = await amounts.allInnerTexts();
  await visit(page, "/evidence");
  await expect(await check(page, "this month's bill")).toContainText(`requests so far this month: ${list} at list price, ${total} to pay after the free tier`);
});

test.describe("the lab", () => {
  test.use({ expectedLogs: /status of 503/ });

  test("really holds a request for as long as it was asked to, and really fails some", async ({ page }) => {
    await visit(page, "/evidence");
    const answer = await check(page, "the fault-injection lab");
    await expect(answer).toContainText(/Asked to fail at 60% odds, it answered [0-5] of 5 with a 503 and Retry-After\./);
    const held = (await answer.innerText()).match(/Asked to hold a request for 500 ms, the server answered after (\d+) ms \(X-Fault: slow\)\./);
    expect(Number(held![1])).toBeGreaterThanOrEqual(500);
  });
});

test("every button says which claim it is for", async ({ page }) => {
  await visit(page, "/evidence");
  for (const name of [
    "Check it now: the availability",
    "Check it now: the running commit",
    "Check it now: the MCP server",
    "Copy the command that checks the availability",
    "Copy the command that checks the running commit",
  ]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(1);
  }
});

test("a claim from a private repository is labelled as private, and points at where it is made", async ({ page }) => {
  await visit(page, "/evidence");
  const merged = claim(page, /of my pull requests merged into a production IoT platform's repository/);
  await expect(merged).toContainText("Private");
  await expect(merged.getByRole("button", { name: /^Check/ })).toHaveCount(0);
  await expect(merged.getByRole("link", { name: /^claimed in:/ })).toHaveAttribute("href", "/");
});
