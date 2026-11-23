import type { Page } from "@playwright/test";
import { DESKTOP, PHONE } from "../support/screens.ts";
import { visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

// Drawn in software where there is no graphics card, which the driver then says in the console.
test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] }, expectedLogs: /GL Driver Message/ });

/** The scripts a page has loaded that hold the 3D library. */
function scriptsIn3D(page: Page) {
  const found: string[] = [];
  page.on("response", async (response) => {
    if (response.request().resourceType() !== "script") return;
    const code = await response.text().catch(() => "");
    if (code.includes("WebGLRenderer")) found.push(response.url());
  });
  return found;
}

test.describe("on a desktop", () => {
  test.use(DESKTOP);

  test("the one-page version keeps its 3D hero, and the home page loads none of it", async ({ page }) => {
    const in3D = scriptsIn3D(page);
    await visit(page, "/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#top canvas")).toHaveCount(0);
    expect(in3D).toEqual([]);

    await visit(page, "/v1");
    await expect(page.locator("#top canvas")).toBeVisible();
    await expect.poll(() => in3D.length).toBeGreaterThan(0);
    // The old page's hero, not the live map.
    await expect(page.locator("#top figure")).toHaveCount(0);
  });
});

test.describe("on a phone", () => {
  test.use(PHONE);

  test("the one-page version's hero is a drawing of what it links to, with no 3D to load", async ({ page }) => {
    const in3D = scriptsIn3D(page);
    await visit(page, "/v1");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#top canvas")).toHaveCount(0);
    expect(in3D).toEqual([]);
    await page.getByRole("button", { name: "Kafka: jump to related work" }).filter({ visible: true }).click();
    await expect(page.locator("#case-reaper")).toBeInViewport();
  });
});
