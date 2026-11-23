import type { Page } from "@playwright/test";
import { DESKTOP, PHONE } from "../support/screens.ts";
import { expectTop, sidewaysScroll, visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

const views = (page: Page) => page.locator("#ai-views");
const journey = (page: Page) => page.locator("#journey-panel");

test("the chapter's figures are the AI platform's, with none of the research's among them", async ({ page }) => {
  await visit(page, "/ai");
  const figures = page.locator("#ai dl").first();
  await expect(figures).toContainText(/\d/);
  await expect(figures).not.toContainText("96%");
  await expect(figures).not.toContainText("AI products");
});

test("the chapter's one case study is a card in it, under the page's title", async ({ page }) => {
  await visit(page, "/ai");
  const card = page.locator("#ai #case-ai-platform");
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { level: 2 })).toHaveText("Running an agentic AI platform");
});

for (const { screen, use } of [
  { screen: "a desktop", use: { ...DESKTOP, reducedMotion: "no-preference" as const } },
  { screen: "a phone", use: PHONE },
]) {
  test.describe(`on ${screen}`, () => {
    test.use(use);

    test("following a request from the case card opens the map below it, whatever view was open", async ({ page }) => {
      await visit(page, "/ai");
      const follow = page.getByRole("button", { name: /^Follow a request through the whole platform/ });
      await page.getByRole("tab", { name: "The AI infra stack" }).click();
      await expect(page.getByRole("tab", { name: "Follow a request" })).toHaveAttribute("aria-selected", "false");
      await follow.click();
      await expect(page.getByRole("tab", { name: "Follow a request" })).toHaveAttribute("aria-selected", "true");
      await expectTop(views(page), { from: 0, to: 200 });
      await expect(page).toHaveURL("/ai");
    });

    test("following a request from the case study's own page opens the map in the chapter", async ({ page }) => {
      await visit(page, "/work/ai-platform");
      await page.getByRole("button", { name: /^Follow a request through the whole platform/ }).click();
      await expect(page).toHaveURL("/ai#ai-map");
      await expect(page.getByRole("tab", { name: "Follow a request" })).toHaveAttribute("aria-selected", "true");
      await expectTop(views(page), { from: 0, to: 200 });
    });
  });
}

test.describe("the map", () => {
  for (const [width, height] of [
    [390, 844],
    [820, 1180],
    [1100, 800],
    [1366, 768],
  ] as const) {
    test(`can be read at ${width} px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await visit(page, "/ai#ai-views");
      await expect(journey(page)).toBeVisible();
      // A label in the drawing is scaled with it; the steps listed on smaller screens are set at their own size.
      const smallest = await journey(page).evaluate((panel) => {
        const sizes = [...panel.querySelectorAll<SVGTextElement | HTMLElement>("svg[role=img] text, ol p")]
          .filter((label) => label.getBoundingClientRect().width > 0)
          .map((label) => {
            const svg = label.closest("svg");
            const scale = svg ? svg.getBoundingClientRect().width / svg.viewBox.baseVal.width : 1;
            return parseFloat(getComputedStyle(label).fontSize) * scale;
          });
        return Math.min(...sizes);
      });
      expect(smallest).toBeGreaterThanOrEqual(10.5);
      expect(smallest).toBeLessThan(40);
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    });
  }

  test("keeps every label inside its box", async ({ page }) => {
    await visit(page, "/ai#ai-views");
    const labels = await journey(page).evaluate((panel) =>
      [...panel.querySelectorAll("svg[role=img] g")].flatMap((node) => {
        // A node's box is the rounded rectangle that fills it; the thin stripe in it is its product's colour.
        const boxes = [...node.querySelectorAll("rect")].sort((a, b) => b.width.baseVal.value - a.width.baseVal.value);
        const texts = [...node.querySelectorAll("text")];
        return boxes[0] ? texts.map((text) => ({ text: text.textContent, spare: boxes[0]!.width.baseVal.value - 12 - text.getBBox().width })) : [];
      }),
    );
    expect(labels.length).toBeGreaterThan(10);
    expect(labels.filter(({ spare }) => spare < 0)).toEqual([]);
  });

  test("dims what is not the owner's work when asked what is", async ({ page }) => {
    await visit(page, "/ai#ai-views");
    const dimmed = () => journey(page).evaluate((panel) => [...panel.querySelectorAll<SVGGElement>("svg[role=img] > g")].filter((node) => Number(node.style.opacity || 1) < 1).length);
    const lens = page.getByRole("button", { name: "Highlight what I own" });
    await expect(lens).toHaveAttribute("aria-pressed", "false");
    expect(await dimmed()).toBe(0);
    await lens.click();
    await expect(lens).toHaveAttribute("aria-pressed", "true");
    await expect.poll(dimmed).toBeGreaterThan(0);
  });
});
