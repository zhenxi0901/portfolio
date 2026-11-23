import type { Page } from "@playwright/test";
import { DESKTOP, PHONE } from "../support/screens.ts";
import { expectTop, visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

const tour = (page: Page) => page.getByRole("dialog", { name: "A 60-second tour of this site" });
const next = (page: Page) => tour(page).getByRole("button", { name: "Next", exact: true });
const start = (page: Page) => page.getByRole("contentinfo").getByRole("button", { name: "Take the 60-second tour" });

/** Which stop the tour is at, and how many there are. */
async function stop(page: Page) {
  const [at, of] = (await tour(page).getByText(/^\d of \d$/).innerText()).split(" of ").map(Number);
  return { at: at!, of: of! };
}

for (const { screen, use } of [
  { screen: "a desktop", use: DESKTOP },
  { screen: "a phone", use: PHONE },
]) {
  test.describe(`on ${screen}`, () => {
    test.use(use);

    test("every stop is on the home page, and the last is the writing, on the screen", async ({ page }) => {
      await visit(page, "/");
      await start(page).click();
      await expect(tour(page)).toBeFocused();
      const { at, of } = await stop(page);
      expect(at).toBe(1);
      expect(of).toBeGreaterThanOrEqual(5);
      for (let shown = 2; shown <= of; shown++) {
        await next(page).click();
        await expect(tour(page).getByText(`${shown} of ${of}`)).toBeVisible();
        expect(new URL(page.url()).pathname).toBe("/");
      }
      await expect(tour(page)).toContainText("Latest writing");
      await expect(tour(page)).toContainText("postmortems");
      await expect(page.locator("#latest").getByRole("heading")).toBeInViewport();
      await tour(page).getByRole("button", { name: "Done" }).click();
      await expect(tour(page)).toBeHidden();
    });

    test("a stop lands under the top bar, with its heading marked", async ({ page }) => {
      await visit(page, "/");
      await start(page).click();
      await next(page).click();
      await next(page).click();
      await expect(tour(page)).toContainText("Two platforms and a research project");
      const heading = page.locator("#chapters").getByRole("heading");
      await expectTop(heading, { from: 64, to: 300 });
      await expect(heading).toHaveCSS("text-decoration-line", "underline");
    });
  });
}

test("a link with ?tour starts it, and tidies only that out of the address", async ({ page }) => {
  await visit(page, "/?tour&utm_source=x#contact");
  await expect(tour(page)).toBeVisible();
  await expect(page).toHaveURL("/?utm_source=x#contact");
});

test("Esc ends it, and gives the focus back to what started it", async ({ page }) => {
  await visit(page, "/");
  await start(page).click();
  await expect(tour(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(tour(page)).toBeHidden();
  await expect(start(page)).toBeFocused();
});

test("it can be started from another page", async ({ page }) => {
  await visit(page, "/status");
  await start(page).click();
  await expect(page).toHaveURL("/");
  await expect(tour(page)).toBeVisible();
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("it goes on by itself, waits under an open dialog, and can be paused", async ({ page }) => {
    await page.clock.install();
    await visit(page, "/");
    await start(page).click();
    await expect(tour(page).getByText("1 of")).toBeVisible();
    await page.clock.runFor(9_000);
    await expect(tour(page).getByText("2 of")).toBeVisible();

    await page.keyboard.press("/");
    await expect(page.getByRole("dialog", { name: "Jump anywhere" })).toBeVisible();
    await page.clock.runFor(20_000);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Jump anywhere" })).toBeHidden();
    await expect(tour(page).getByText("2 of")).toBeVisible();

    await tour(page).getByRole("button", { name: "Pause the tour" }).click();
    await page.clock.runFor(20_000);
    await expect(tour(page).getByText("2 of")).toBeVisible();
    await expect(tour(page).getByRole("button", { name: "Play the tour" })).toBeVisible();
  });
});
