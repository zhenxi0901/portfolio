import type { Page } from "@playwright/test";
import { PHONE } from "../support/screens.ts";
import { visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

const receipt = (page: Page) => page.locator("figure.receipt");
const table = (page: Page) => page.getByRole("table", { name: /^This month's usage at list price/ });
/** An amount as printed, in ten-thousandths of a dollar, so that adding them up is exact. */
const amount = (printed: string) => Math.round(Number(printed.replace("−", "-").replace(/[^\d.-]/g, "")) * 10_000);

// One of the numbers of the month the what-if describes.
const whatIf = (page: Page, name: string) => page.locator("dl > div").filter({ has: page.getByText(name, { exact: true }) }).getByRole("definition");
const visitors = (page: Page) => page.getByRole("slider", { name: "Visitors a day" });

test("the month so far is a receipt, and it adds up", async ({ page }) => {
  await visit(page, "/cost");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What this site costs");
  const items = table(page).getByRole("rowheader");
  await expect(items).toHaveText([/^CPU/, /^Memory/, /^Requests/, /^Data to the internet/, /^List price/, /^Free tier/, /^To pay, estimated/]);
  const [cpu, memory, requests, data, list, free, toPay] = (await table(page).getByRole("cell").allInnerTexts()).map(amount);
  expect(cpu! + memory! + requests! + data!).toBe(list);
  expect(list! + free!).toBe(toPay);
  expect(toPay).toBeGreaterThan(0);
});

test("the receipt says which days it covers, what the month would come to and when the meters were read", async ({ page, readings }) => {
  await visit(page, "/cost");
  const { prices, updated } = readings.cost.recording;
  await expect(receipt(page)).toContainText(/1 \w{3,4} to \d+ \w{3,4} \d{4} · [\d.]+ days/);
  await expect(receipt(page)).toContainText(/The whole month at this pace: US\$[\d.]+ at list price, US\$[\d.]+ to pay\./);
  await expect(receipt(page)).toContainText(`List prices as of ${prices.as_of} · meters read ${updated.slice(11, 16)} UTC`);
});

test("three things the receipt does not say by itself are beside it", async ({ page, readings }) => {
  await visit(page, "/cost");
  const inTen = Math.round(readings.cost.recording.probe_share * 10);
  await expect(page.getByRole("main").getByRole("heading", { level: 3 })).toContainText([
    `${inTen} in 10 requests are the site checking on itself`,
    /^Billed \d+ ms a request/,
    "The free tier pays for the compute",
  ]);
});

test("what caps the bill is on the page, and the prices link to Google's own", async ({ page, readings }) => {
  await visit(page, "/cost");
  const ceiling = Math.round(readings.cost.recording.prices.ceiling_per_month);
  await expect(page.getByRole("main")).toContainText(`compute would list at US$${ceiling}`);
  await expect(page.getByRole("link", { name: /^Cloud Run with request-based billing/ })).toHaveAttribute("href", "https://cloud.google.com/run/pricing");
  await expect(page.getByRole("link", { name: /^Premium Tier data transfer/ })).toHaveAttribute("href", "https://cloud.google.com/vpc/network-pricing");
});

test("the what-if starts at this month's pace, where it agrees with the receipt to the last digit", async ({ page }) => {
  await visit(page, "/cost");
  await expect(receipt(page)).toContainText("at this pace: ");
  const projected = (await receipt(page).innerText()).match(/at this pace: (US\$[\d.]+) at list price, (US\$[\d.]+) to pay/)!;
  await expect(page.getByRole("button", { pressed: true })).toHaveText(/^This month's pace/);
  await expect(whatIf(page, "at list price")).toHaveText(projected[1]!);
  await expect(whatIf(page, "to pay, after the free tier")).toHaveText(projected[2]!);
});

test("a busier day costs more, and the slider says how much in words", async ({ page }) => {
  await visit(page, "/cost");
  const toPay = whatIf(page, "to pay, after the free tier");
  await expect(page.getByRole("button", { pressed: true })).toHaveText(/^This month's pace/);
  const pace = amount(await toPay.innerText());
  const frontPage = page.getByRole("button", { name: /^Hacker News front page/ });
  await frontPage.click();
  await expect(frontPage).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { pressed: true })).toHaveCount(1);
  expect(amount(await toPay.innerText())).toBeGreaterThan(pace);
  await visitors(page).press("End");
  await expect(visitors(page)).toHaveAttribute("aria-valuetext", /^1,000,000 visitors a day: US\$[\d,.]+ a month to pay$/);
  await visitors(page).press("Home");
  await expect(visitors(page)).toHaveAttribute("aria-valuetext", /^1 visitor a day: US\$[\d.]+ a month to pay$/);
});

test("the status page leads to it", async ({ page }) => {
  await visit(page, "/status");
  await expect(page.getByRole("main").getByRole("link", { name: /^What it costs/ })).toHaveAttribute("href", "/cost");
});

for (const { screen, use } of [
  { screen: "a desktop", use: { viewport: { width: 1350, height: 940 } } },
  { screen: "a phone", use: { ...PHONE, viewport: { width: 412, height: 823 } } },
]) {
  test.describe(`on ${screen}`, () => {
    test.use(use);

    test("the page holds its layout while the meters are being read", async ({ page, readings }) => {
      await page.addInitScript(() => {
        const shifts = { total: 0 };
        Object.assign(window, { shifts });
        new PerformanceObserver((list) => {
          for (const shift of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
            if (!shift.hadRecentInput) shifts.total += shift.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
      const height = async () => (await receipt(page).boundingBox())!.height;

      const answer = readings.cost.hold();
      await visit(page, "/cost");
      await expect(receipt(page)).toContainText("Reading this month's meters");
      const reading = await height();
      answer();
      await expect(table(page)).toBeVisible();
      // The what-if is the last part to settle: it measures this visit first.
      await expect(visitors(page)).toBeVisible();
      expect(Math.abs((await height()) - reading)).toBeLessThanOrEqual(60);
      expect(await page.evaluate(() => (window as unknown as { shifts: { total: number } }).shifts.total)).toBeLessThan(0.01);
    });
  });
}

test.describe("where there are no meters to read, as anywhere but the live site", () => {
  test.use(PHONE);

  test("the receipt is the price list instead, and the what-if still works", async ({ page, readings }) => {
    readings.cost.passThrough();
    await visit(page, "/cost");
    await expect(receipt(page)).toContainText("Measured on the live site only. The price list it uses:");
    await expect(receipt(page)).toContainText("per vCPU-second");
    await expect(visitors(page)).toBeVisible();
    await expect(page.getByRole("button", { name: /^This month's pace/ })).toBeHidden();
  });
});

test("a reading the server could not refresh is printed as the last good one", async ({ page, readings }) => {
  readings.cost.change({ stale: true });
  await visit(page, "/cost");
  await expect(receipt(page)).toContainText("Cloud Monitoring isn't answering; this is the last good reading.");
});

test.describe("when the meters cannot be had", () => {
  test.use({ expectedLogs: /Failed to load resource/ });

  test("a copy of the site with no API says it is a copy", async ({ page, readings }) => {
    readings.cost.fail(404);
    await visit(page, "/cost");
    await expect(receipt(page)).toContainText("The meters aren't reachable from this copy of the site.");
    await expect(page.getByRole("main")).toContainText("which this copy of the site can't reach");
  });

  test("an API that does not answer says to try again, and blames no copy", async ({ page, readings }) => {
    readings.cost.drop();
    await visit(page, "/cost");
    await expect(receipt(page)).toContainText("The meters didn't answer just now. Try again in a minute.");
    await expect(page.getByRole("main")).toContainText("which didn't load just now");
    await expect(page.getByRole("main")).not.toContainText("this copy");
  });

  test("an API that turns this browser away says so", async ({ page, readings }) => {
    readings.cost.fail(429);
    await visit(page, "/cost");
    await expect(receipt(page)).toContainText("The API is turning this browser away for a minute");
  });
});
