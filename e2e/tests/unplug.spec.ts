import type { Page } from "@playwright/test";
import { expectAccessible } from "../support/accessibility.ts";
import { PHONE } from "../support/screens.ts";
import { sidewaysScroll, visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

// The switches under the map at the top of the home page: each takes one part of the site away, in this tab only.
const toggle = (page: Page) => page.locator("[aria-controls=unplug-parts]");
const parts = (page: Page) => page.getByRole("group", { name: /^Take one part of this site away/ });
const part = (page: Page, name: string) => parts(page).getByRole("button", { name, exact: true });
// Under the top bar of every page while something is unplugged.
const strip = (page: Page) => page.locator("header").getByRole("status");
const effect = (page: Page) => page.locator("#top figcaption dl");
const reading = (page: Page, name: string) => page.locator("#explore").getByRole("link", { name });
/** The readings are taken when the ledger comes near the screen. */
const toLedger = (page: Page) => reading(page, "Availability").scrollIntoViewIfNeeded();

async function unplug(page: Page, name: string) {
  if ((await toggle(page).getAttribute("aria-expanded")) === "false") await toggle(page).click();
  await part(page, name).click();
  await expect(strip(page)).toContainText(`${name} is unplugged, in this tab only`);
}

// A copy that was not built from a commit says so.
const COMMIT = /[0-9a-f]{7}|unknown/;
// Which parts every page needs: with one of them gone, the top bar has no commit to show.
const PARTS = [
  { name: "Google front end", commit: false },
  { name: "Cloud Run", commit: false },
  { name: "/api", commit: false },
  { name: "Cloud Monitoring", commit: true },
  { name: "Uptime checks", commit: true },
  { name: "GitHub Actions", commit: true },
];

test("the switches are put away until they are asked for", async ({ page }) => {
  await visit(page, "/");
  await expect(toggle(page)).toHaveText("Unplug something");
  await expect(parts(page)).toBeHidden();
  await toggle(page).click();
  await expect(parts(page).getByRole("button")).toHaveText(PARTS.map(({ name }) => name));
  await expect(strip(page)).toHaveCount(0);
});

for (const { name, commit } of PARTS) {
  test(`without ${name}, the map and the top bar show it, and the caption says what that costs`, async ({ page }) => {
    await visit(page, "/");
    await unplug(page, name);
    await expect(part(page, name)).toHaveAttribute("aria-pressed", "true");
    await expect(part(page, name)).toBeFocused();
    await expect(parts(page).locator("[aria-pressed=true]")).toHaveCount(1);
    await expect(page.locator("#top figure").getByRole("link").filter({ hasText: "unplugged", visible: true })).toHaveCount(1);
    await expect(effect(page).locator("dt")).toHaveText(["Lost", "Still works", "Comes back", "Why I accept it"]);
    for (const answer of await effect(page).locator("dd").all()) await expect(answer).toContainText(/\w{3,}.*\.$/);
    // All of it on the screen, without the visitor having to look for it.
    await expect(effect(page)).toBeInViewport({ ratio: 1 });
    const running = page.getByRole("banner").locator('a[href="/status"]');
    if (commit) await expect(running).toContainText(COMMIT);
    else await expect(running).not.toContainText(COMMIT);
  });
}

test("one part at a time: another takes its place", async ({ page }) => {
  await visit(page, "/");
  await unplug(page, "/api");
  await unplug(page, "GitHub Actions");
  await expect(part(page, "/api")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#top figure").getByRole("link").filter({ hasText: "unplugged", visible: true })).toHaveAccessibleName(/^GitHub Actions/);
});

test("without the API the readings are gone, and plugging it back in brings them back without a reload", async ({ page }) => {
  await visit(page, "/#explore");
  await expect(reading(page, "Availability")).toHaveAccessibleName(/^Availability \d/);
  await unplug(page, "/api");
  await toLedger(page);
  await expect(reading(page, "Availability")).toHaveAccessibleName(/^Availability not available/);
  await expect(reading(page, "This month's bill")).toHaveAccessibleName(/^This month's bill not available/);
  await page.evaluate(() => ((window as { mark?: boolean }).mark = true));
  await strip(page).getByRole("button", { name: "Plug it back in" }).click();
  await expect(reading(page, "Availability")).toHaveAccessibleName(/^Availability \d/);
  await expect(strip(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as { mark?: boolean }).mark)).toBe(true);
  // Nothing of it is left behind: what the page asks with is the browser's own again.
  expect(await page.evaluate(() => Function.prototype.toString.call(window.fetch))).toContain("[native code]");
});

test("without Cloud Monitoring the last readings stay, with their age and without the colour that means live", async ({ page }) => {
  await visit(page, "/#explore");
  const value = reading(page, "Availability").locator("xpath=ancestor::li").locator("span.text-xl");
  await expect(reading(page, "Availability")).toHaveAccessibleName(/^Availability \d/);
  const colour = () => value.evaluate((el) => getComputedStyle(el).color);
  const live = await colour();
  await unplug(page, "Cloud Monitoring");
  await toLedger(page);
  await expect(reading(page, "Availability")).toContainText("the last good reading");
  await expect(reading(page, "This month's bill")).toContainText("the last good reading");
  const ink = await page.getByRole("heading", { level: 1 }).evaluate((el) => getComputedStyle(el).color);
  expect(live).not.toBe(ink);
  await expect.poll(colour).toBe(ink);
});

test("it stays unplugged on the next page in the tab, and nowhere else", async ({ page, context }) => {
  await visit(page, "/");
  await unplug(page, "Cloud Monitoring");
  await visit(page, "/status");
  await expect(strip(page)).toContainText("Cloud Monitoring is unplugged, in this tab only");
  const other = await context.newPage();
  await visit(other, "/status");
  await expect(strip(other)).toHaveCount(0);
  // That page drew itself without the part, so it is loaded again.
  await Promise.all([page.waitForEvent("load"), strip(page).getByRole("button", { name: "Plug it back in" }).click()]);
  await expect(strip(page)).toHaveCount(0);
});

for (const name of ["Cloud Run", "Google front end"]) {
  test(`without ${name} no other page opens, and the one that is open still works`, async ({ page }) => {
    await visit(page, "/");
    await unplug(page, name);
    await page.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: "Research" }).click();
    await expect(page.getByText("That page would not load")).toBeVisible();
    await expect(page).toHaveURL("/");

    await page.getByRole("link", { name: "Get in touch" }).first().click();
    await expect(page).toHaveURL("/#contact");

    await page.keyboard.press("/");
    await page.keyboard.type("changelog");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page).toHaveURL("/#contact");
  });
}

test("it plugs itself back in after ten minutes", async ({ page }) => {
  await page.clock.install();
  await visit(page, "/");
  await unplug(page, "/api");
  await page.clock.fastForward("09:55");
  await expect(strip(page)).toHaveCount(1);
  await page.clock.fastForward("00:10");
  await expect(strip(page)).toHaveCount(0);
  await expect(toggle(page)).toHaveText("Leave it all plugged in");
});

test.describe("on a phone", () => {
  test.use(PHONE);

  test("the list of the request's stops says which one is gone, and nothing is wider than the screen", async ({ page }) => {
    await visit(page, "/");
    await unplug(page, "Cloud Run");
    await expect(page.getByRole("list", { name: /request/i }).getByRole("listitem").filter({ hasText: "Cloud Run" })).toContainText("unplugged");
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
  });
});

test("the page is accessible with a part unplugged and a link refused", async ({ page }) => {
  await visit(page, "/");
  await unplug(page, "Cloud Run");
  await page.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: "Research" }).click();
  await expect(page.getByText("That page would not load")).toBeVisible();
  // While the pointer is on it, a toast stays.
  await page.getByText("That page would not load").hover();
  await expectAccessible(page);
});
