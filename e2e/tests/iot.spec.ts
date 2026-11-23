import { PHONE } from "../support/screens.ts";
import { visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

test.describe("the case studies", () => {
  test("are one group, every card of it about this platform, with a link to the platform from the inside", async ({ page }) => {
    await visit(page, "/iot");
    const groups = page.locator("#work").getByRole("group", { name: /./ });
    await expect(groups).toHaveCount(1);
    await expect(groups.getByRole("article").first()).toContainText("One VM to a GKE platform");
    // The chapter says whose these are, so no card repeats it, and none belongs to another product.
    await expect(groups.getByRole("article").getByText(/^(Building IoT platform|AI agent platform|ARIES agent benchmarks)$/)).toHaveCount(0);
    await groups.getByRole("link", { name: /^Inside the platform/ }).click();
    await expect(page).toHaveURL("/iot#platform");
    await expect(page.locator("#platform").getByRole("heading", { level: 2 })).toBeInViewport();
  });

  test("each lead to a page of their own", async ({ page }) => {
    await visit(page, "/iot");
    const cards = page.locator("#work").getByRole("article");
    for (const card of await cards.all()) {
      const id = await card.getAttribute("id");
      await expect(card.getByRole("link", { name: "Read the case" })).toHaveAttribute("href", `/work/${id!.replace(/^case-/, "")}`);
    }
  });
});

// A button that does something for a while stays where it is, so the keyboard's focus does too.
test.describe("a working model worked from the keyboard", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the topic reaper keeps the focus while it runs, and hands it to Reset and back", async ({ page }) => {
    await visit(page, "/iot");
    const run = page.getByRole("button", { name: "Run the reaper" });
    const reset = page.locator("#case-reaper").getByRole("button", { name: "Reset" });
    await run.focus();
    await page.keyboard.press("Enter");
    await expect(run).toHaveAttribute("aria-disabled", "true");
    await expect(run).toBeFocused();
    await expect(reset).toBeFocused();
    await expect(page.locator("#case-reaper")).toContainText("914 / 914 reaped");
    await page.keyboard.press("Enter");
    await expect(run).toBeFocused();
  });

  test("the release pipeline asks for an approval and keeps the focus through the whole run", async ({ page }) => {
    await visit(page, "/iot");
    const run = page.getByRole("button", { name: "Run pipeline" });
    const approve = page.getByRole("button", { name: "Approve release" });
    await run.focus();
    await page.keyboard.press("Enter");
    await expect(run).toBeFocused();
    await expect(approve).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(run).toBeFocused();
    await expect(page.getByText("Deployed the exact digest that passed every gate.")).toBeVisible();
  });

  test("a bad image stops the release at the scan", async ({ page }) => {
    await visit(page, "/iot");
    await page.getByRole("button", { name: "Run with a bad image" }).click();
    await expect(page.getByText("Stopped at the scan. Nothing reached production.")).toBeVisible();
    await expect(page.locator("#case-pipeline")).toContainText("1 critical CVE");
  });

  test("the node alert keeps the focus on Stop with no node left to stop", async ({ page }) => {
    await visit(page, "/iot");
    const stop = page.getByRole("button", { name: "Stop a node" });
    await stop.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Quorum held, 2 of 3 up")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Critical: ZooKeeper quorum lost")).toBeVisible();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(stop).toBeFocused();
    await expect(stop).toHaveAttribute("aria-disabled", "true");
  });

  test("the SLO board keeps the focus while its incident plays", async ({ page }) => {
    await visit(page, "/iot#platform-signals");
    await page.getByRole("button", { name: "Simulate an incident" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Incident running" })).toBeFocused();
  });

  test("the cost review keeps the focus on Next at its last move", async ({ page }) => {
    await visit(page, "/iot#platform-cost");
    const moves = page.getByRole("tablist", { name: "Cost moves" }).getByRole("tab");
    const next = page.getByRole("button", { name: "Next move" });
    await next.focus();
    // More presses than there are moves.
    for (let press = 0; press <= (await moves.count()); press++) await page.keyboard.press("Enter");
    await expect(moves.last()).toHaveAttribute("aria-selected", "true");
    await expect(next).toBeFocused();
    await expect(next).toHaveAttribute("aria-disabled", "true");
  });
});

test.describe("on a phone", () => {
  test.use({ ...PHONE, reducedMotion: "no-preference" });

  test("the cluster's card shows the platform it became, and never grows under a reader scrolling past", async ({ page }) => {
    await visit(page, "/iot");
    const card = page.locator("#case-gke");
    // Scrolled in steps, as a thumb would, from before the card shows until it has gone by.
    const heights: number[] = [];
    for (;;) {
      await page.mouse.wheel(0, 300);
      const { top, bottom, height, end } = await card.evaluate(async (el) => {
        await new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn)));
        const box = el.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, height: box.height, end: window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1 };
      });
      if (top < 844 && bottom > 0) heights.push(height);
      if (bottom < 0 || end) break;
    }
    expect(heights.length).toBeGreaterThan(3);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
    await expect(card.getByRole("radio", { name: "After" })).toHaveAttribute("aria-checked", "true");
    await expect(card).toContainText("Regional GKE, 3 zones");
  });
});
