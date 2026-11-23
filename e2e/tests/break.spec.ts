import type { Page } from "@playwright/test";
import { PHONE } from "../support/screens.ts";
import { expectTop, visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

// The faults are real answers of the server, so the browser's console reports them.
test.use({ expectedLogs: /status of (503|429)/ });

const status = (page: Page) => page.getByRole("status").first();
const result = (page: Page) => page.getByRole("region", { name: "3. What happened" });
const runs = (page: Page) => page.getByRole("region", { name: "Your runs, side by side" });
const timeline = (page: Page) => result(page).locator("svg[role=img]");
const figure = (page: Page, name: string) => result(page).locator("dl > div", { hasText: name }).getByRole("definition");
const send = (page: Page) => page.getByRole("button", { name: "Send 20 requests" });
const compare = (page: Page) => page.getByRole("button", { name: "Compare all four" });

const preset = (page: Page, name: "Healthy" | "Flaky" | "Slow" | "Brownout") => page.getByRole("button", { name, exact: true }).click();
const client = (page: Page, name: "Give up" | "Retry" | "Retry + circuit breaker" | "Hedge") => page.getByRole("radio", { name, exact: true }).check();
const errors = (page: Page) => page.getByRole("slider", { name: "Requests answered with a 503" });

/** Sends a run of 20 and waits for its end: how many calls went out to the server for them. */
async function sendAndCount(page: Page) {
  await send(page).click();
  await expect(status(page)).toHaveText(/^Done: /, { timeout: 20_000 });
  return Number((await figure(page, "calls to the server").innerText()).split(" ")[0]);
}

test("a preset sets what goes wrong", async ({ page }) => {
  await visit(page, "/break");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Break it yourself");
  await preset(page, "Healthy");
  await expect(errors(page)).toHaveAttribute("aria-valuetext", "0%");
  await preset(page, "Flaky");
  await expect(errors(page)).toHaveAttribute("aria-valuetext", "30%");
});

test.describe("each client against the faults it is for, on the real server", () => {
  // The server rolls its dice by the key a call carries. One seed for every run, instead of one a press, makes them the same each time.
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/lab/echo?*", async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set("key", url.searchParams.get("key")!.replace(/^[^-]+/, "e2e"));
      await route.continue({ url: url.href });
    });
  });

  const succeeded = async (page: Page) => parseInt(await figure(page, "succeeded for the user").innerText(), 10);

  test("giving up makes one call each, on the arrival schedule, and every fault reaches the user", async ({ page }) => {
    await visit(page, "/break");
    await preset(page, "Flaky");
    await client(page, "Give up");
    const started = Date.now();
    expect(await sendAndCount(page)).toBe(20);
    expect(Date.now() - started).toBeGreaterThanOrEqual(3_800);
    await expect(figure(page, "calls to the server")).toHaveText("20 (1.00 each)");
    const failed = 20 - (await succeeded(page));
    expect(failed).toBeGreaterThan(0);
    await expect(result(page)).toContainText(`${failed} requests of 20 failed for the user: with no retries, every error and timeout the server produced reached someone.`);
    // A lane for each request, numbered.
    await expect(timeline(page).getByText(/^(1|10|20)$/)).toHaveCount(3);
  });

  test("retrying makes more calls, so that fewer requests fail", async ({ page }) => {
    await visit(page, "/break");
    await errors(page).press("End");
    await expect(errors(page)).toHaveAttribute("aria-valuetext", "60%");
    await client(page, "Give up");
    await sendAndCount(page);
    const withoutRetries = await succeeded(page);
    await client(page, "Retry");
    const calls = await sendAndCount(page);
    expect(calls).toBeGreaterThan(20);
    expect(await succeeded(page)).toBeGreaterThan(withoutRetries);
    await expect(result(page)).toContainText(new RegExp(`The server failed \\d+ of ${calls} calls; with retries`));
  });

  test("hedging takes a quick error as final, with no second copy", async ({ page }) => {
    await visit(page, "/break");
    await preset(page, "Flaky");
    await client(page, "Hedge");
    expect(await sendAndCount(page)).toBe(20);
    expect(await succeeded(page)).toBeLessThan(20);
  });

  test("hedging sends a second copy of what is slow, and says so", async ({ page }) => {
    await visit(page, "/break");
    await preset(page, "Slow");
    await client(page, "Hedge");
    const calls = await sendAndCount(page);
    expect(calls).toBeGreaterThan(20);
    await expect(result(page)).toContainText(new RegExp(`Hedging sent ${calls - 20} extra cop(y|ies)`));
  });

  test("a circuit breaker in a brownout says whether it opened", async ({ page }) => {
    await visit(page, "/break");
    await preset(page, "Brownout");
    await client(page, "Retry + circuit breaker");
    await sendAndCount(page);
    await expect(result(page)).toContainText(/The breaker (opened and turned away d+ calls?|never opened)/);
  });
});

test("every request of a run can be read as a table", async ({ page }) => {
  await visit(page, "/break");
  await preset(page, "Healthy");
  await sendAndCount(page);
  await result(page).getByText("Every request, as a table").click();
  const rows = result(page).getByRole("table", { name: "Each request's attempts and outcome" }).getByRole("row");
  await expect(rows).toHaveCount(1 + 20);
  await expect(rows.last()).toContainText(/20\s*answered \d+ ms\s*succeeded\s*\d+ ms/);
});

test("a second press while a run is out starts nothing, and a run is added to the table that can be scrolled with the keyboard", async ({ page }) => {
  await visit(page, "/break");
  await preset(page, "Healthy");
  await send(page).click();
  // Forced, because the buttons say they are disabled and a visitor can press them all the same.
  await send(page).click({ force: true });
  await compare(page).click({ force: true });
  await expect(status(page)).toHaveText(/^Done: /, { timeout: 20_000 });
  await expect(runs(page).getByRole("rowheader")).toHaveCount(1);
  await expect(send(page)).not.toHaveAttribute("aria-disabled", "true");
  const scroller = runs(page).getByRole("region", { name: /scrolls sideways/ });
  await scroller.focus();
  await expect(scroller).toBeFocused();
});

test("comparing all four gives each client the same faults, with new ones for the next run", async ({ page }) => {
  test.slow();
  const keys: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/lab/echo")) keys.push(new URL(request.url()).searchParams.get("key") ?? "none");
  });
  await visit(page, "/break");
  await preset(page, "Flaky");
  await compare(page).click();
  await expect(status(page)).toHaveText(
    /^Compared against 30% errors, the same faults for each: Give up \d+ of 12, Retry \d+ of 12, Retry \+ circuit breaker \d+ of 12, Hedge \d+ of 12 succeeded for the user\.$/,
    { timeout: 40_000 },
  );
  await expect(runs(page).getByRole("rowheader")).toHaveText(["Hedge", "Retry + circuit breaker", "Retry", "Give up"]);

  // The server rolls its dice by the key: the run's seed, the request, and which attempt at it.
  expect(keys.length).toBeGreaterThanOrEqual(48);
  for (const key of keys) expect(key).toMatch(/^[a-z0-9]{1,8}-(\d|1[01])-\d+$/);
  const seeds = new Set(keys.map((key) => key.split("-")[0]));
  expect(seeds.size).toBe(1);
  const [seed] = seeds;
  for (let request = 0; request < 12; request++) expect(keys.filter((key) => key === `${seed}-${request}-0`)).toHaveLength(4);

  keys.length = 0;
  await client(page, "Give up");
  await sendAndCount(page);
  const next = new Set(keys.map((key) => key.split("-")[0]));
  expect(next.size).toBe(1);
  expect(next.has(seed!)).toBe(false);
});

// What happens has to be on the screen as it happens, not below the buttons.
for (const { screen, use, height } of [
  { screen: "a laptop", use: { viewport: { width: 1366, height: 768 } }, height: 768 },
  { screen: "a phone", use: PHONE, height: 844 },
]) {
  test.describe(`on ${screen}`, () => {
    test.use(use);

    test.beforeEach(async ({ page }) => {
      // The same faults every time: every fourth call fails, and every fifth is slow.
      let calls = 0;
      await page.route("**/api/lab/echo?*", async (route) => {
        calls++;
        const fails = calls % 4 === 0;
        if (calls % 5 === 0) await new Promise((answer) => setTimeout(answer, 700));
        // A hedge that lost its race has hung up by now.
        await route.fulfill({ status: fails ? 503 : 200, headers: { "X-Fault": fails ? "error" : "none" }, json: {} }).catch(() => {});
      });
    });

    test("a run shows its result as it goes, and ends with the chart on the screen", async ({ page }) => {
      await visit(page, "/break");
      await send(page).click();
      await expect(status(page)).toHaveText("Sending…");
      await expectTop(result(page).getByRole("heading"), { from: 64, to: height * 0.45 });
      await expect(status(page)).toHaveText(/^Done: /, { timeout: 20_000 });
      await expectTop(timeline(page), { from: 64, to: height - 120 });
      await expect(figure(page, "the longest wait")).toHaveText(/ s$| ms$/);
      // Drawn at the size it is shown at, so its labels are as large as they say.
      const { shown, drawn } = await timeline(page).evaluate((svg) => ({ shown: svg.getBoundingClientRect().width, drawn: (svg as SVGSVGElement).viewBox.baseVal.width }));
      expect(Math.abs(shown - drawn)).toBeLessThanOrEqual(2);
    });

    test("a comparison fills in client by client, and ends with the four side by side on the screen", async ({ page }) => {
      test.slow();
      await visit(page, "/break");
      await compare(page).click();
      const four = result(page).getByRole("table", { name: /^The four clients against/ });
      await expect(four.getByRole("row", { name: /^Give up running/ })).toBeVisible();
      await expect(four.getByText("waiting its turn")).toHaveCount(3);
      await expect(four.getByRole("row", { name: /^Give up \d+ of 12/ })).toBeVisible();
      await expect(four.getByRole("row", { name: /^Retry running/ })).toBeVisible();
      await expect(status(page)).toHaveText(/succeeded for the user\.$/, { timeout: 40_000 });
      await expect(four.getByRole("row", { name: /\d+ of 12/ })).toHaveCount(4);
      await expect(four).toBeInViewport({ ratio: 1 });
    });
  });
}
