import type { Locator, Page } from "@playwright/test";
import { visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

const fact = (page: Page, name: string) => page.locator("dl > div").filter({ has: page.getByText(name, { exact: true }) }).getByRole("definition");

test("the page says whether the site is up, and the commit and region the server says", async ({ page, request }) => {
  const { commit, region } = await (await request.get("/api/status")).json();
  await visit(page, "/status");
  await expect(page.getByText("Operational", { exact: true })).toBeVisible();
  await expect(page.getByText(/^checked \d\d:\d\d:\d\d your time, again every minute$/)).toBeVisible();
  await expect(fact(page, "answered your browser in")).toHaveText(/^\d+ ms$/);
  await expect(fact(page, "live commit")).toHaveText(commit);
  await expect(fact(page, "region")).toHaveText(region);
  await expect(fact(page, "releases")).toHaveText("open");
});

test("with the error budget spent, it says releases are frozen", async ({ page, readings }) => {
  readings.slo.change({ budget_remaining: -0.2, downtime_minutes: 52, releases: "frozen" });
  await visit(page, "/status");
  await expect(page.getByText("Up, releases frozen")).toBeVisible();
  await expect(fact(page, "releases")).toHaveText("frozen: fixes only");
});

test("the instance that answered shows the latency of its last requests and its own numbers", async ({ page }) => {
  await visit(page, "/status");
  await page.getByText("Latency of the last requests").scrollIntoViewIfNeeded();
  await expect(page.getByRole("img", { name: /^Latency of the last \d+ requests, up to [\d.]+ ms, median [\d.]+ ms$/ })).toBeVisible();
  for (const number of ["Uptime", "Requests served", "p50 latency", "p95 latency", "Heap in use", "Goroutines"]) {
    await expect(fact(page, number)).toHaveText(/\d/);
  }
});

test("the postmortems are a link away, not somewhere below", async ({ page }) => {
  await visit(page, "/status");
  await expect(page.getByRole("main")).not.toContainText("postmortems below");
  await expect(page.getByRole("main").getByRole("link", { name: "postmortems", exact: true })).toHaveAttribute("href", "/writing#postmortems");
});

test.describe("the replay of the latest deploy", () => {
  const card = (page: Page) => page.locator("#replay");
  const button = (page: Page) => card(page).getByRole("button", { name: /^(Replay|Stop)$/ });
  const clock = (page: Page) => card(page).getByText(/^\d+:\d\d \/ \d+:\d\d$/);
  const bars = (page: Page) => card(page).getByRole("list").locator("span[style*='width'] span[style*='width']");

  const seconds = (time: string) => time.split(":").reduce((minutes, part) => minutes * 60 + Number(part), 0);
  /** How far the replay has got, and how long the deploy took, in seconds of the deploy. */
  async function progress(page: Page) {
    const [now, total] = (await clock(page).innerText()).split(" / ").map(seconds);
    return { now: now!, total: total! };
  }

  /** Scrolls until this much of it shows at the bottom of the screen, once the panels above it have settled. */
  async function showTop(page: Page, pixels: number) {
    await page.getByText("This site's own SLO, measured from outside").scrollIntoViewIfNeeded();
    await expect(page.getByText(/^availability over/)).toBeVisible();
    await card(page).evaluate((el, shown) => window.scrollBy({ top: el.getBoundingClientRect().top - (window.innerHeight - shown), behavior: "instant" }), pixels);
  }

  const toMiddle = (element: Locator) => element.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));

  test.describe("with motion", () => {
    test.use({ reducedMotion: "no-preference", viewport: { width: 1280, height: 800 } });

    test("plays once by itself when half of it is on the screen, and ends by itself within ten seconds", async ({ page }) => {
      await page.clock.install();
      await visit(page, "/status");
      await expect(card(page)).toContainText(/every step of that release at its real start and length, played \d+ times faster/);
      await showTop(page, 200);
      // It would have started by now.
      await page.waitForTimeout(300);
      await expect(button(page)).toHaveText("Replay");

      await toMiddle(card(page));
      await expect(button(page)).toHaveText("Stop");
      await page.clock.runFor(10_000);
      await expect(button(page)).toHaveText("Replay");
      const { now, total } = await progress(page);
      expect(now).toBe(total);

      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await expect(card(page)).not.toBeInViewport();
      await toMiddle(card(page));
      await page.waitForTimeout(300);
      await expect(button(page)).toHaveText("Replay");
    });

    test("a replay the visitor started goes on when they scroll to see all of it", async ({ page }) => {
      await page.clock.install();
      await visit(page, "/status");
      await showTop(page, 200);
      await button(page).click();
      await page.clock.runFor(1_200);
      const before = await progress(page);
      expect(before.now).toBeGreaterThan(0);
      await toMiddle(card(page));
      await page.clock.runFor(500);
      expect((await progress(page)).now).toBeGreaterThan(before.now);
      await expect(button(page)).toHaveText("Stop");
    });

    test("stopping it shows the finished run", async ({ page }) => {
      await page.clock.install();
      await visit(page, "/status");
      await showTop(page, 200);
      await button(page).click();
      await page.clock.runFor(1_000);
      // The line that moves along the bars while it plays.
      const playhead = card(page).locator("span.w-px");
      await expect(playhead.first()).toBeVisible();
      await button(page).click();
      await expect(button(page)).toHaveText("Replay");
      const { now, total } = await progress(page);
      expect(now).toBe(total);
      await expect(playhead).toHaveCount(0);
    });
  });

  test.describe("for a visitor who prefers reduced motion", () => {
    test("it is the finished run, with nothing to play", async ({ page }) => {
      await visit(page, "/status");
      await expect(card(page).getByRole("button")).toHaveCount(0);
      const widths = await bars(page).evaluateAll((all) => all.map((bar) => (bar as HTMLElement).style.width));
      expect(widths.length).toBeGreaterThan(5);
      expect(new Set(widths)).toEqual(new Set(["100%"]));
    });
  });

  test("what each step does opens and closes from the keyboard, and nothing is said only on hover", async ({ page }) => {
    await visit(page, "/status");
    const summary = card(page).getByText("What each step does");
    const explained = card(page).getByRole("term");
    await expect(explained.first()).toBeHidden();
    await summary.click();
    await expect(explained.first()).toBeVisible();
    expect(await explained.count()).toBeGreaterThan(5);
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(explained.first()).toBeHidden();
    await expect(card(page).locator("[title]")).toHaveCount(0);
  });
});
