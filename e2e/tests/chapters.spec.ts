import type { Locator, Page } from "@playwright/test";
import { DESKTOP, PHONE } from "../support/screens.ts";
import { visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

const CHAPTERS = [
  { path: "/iot", tab: "IoT", title: /^The building IoT platform/, before: "Home", after: "AI agent platform" },
  { path: "/ai", tab: "AI", title: /^The AI agent platform/, before: "IoT platform", after: "Research" },
  { path: "/research", tab: "Research", title: /^What does an AI agent actually cost to run\?/, before: "AI agent platform", after: "Writing" },
  { path: "/writing", tab: "Writing", title: /^Writing/, before: "Research", after: "About" },
  { path: "/about", tab: "About", title: /^Li ZhenXi/, before: "Writing", after: null },
];

// The chapters are named along the top of a wide screen, and as tabs along the bottom of a phone.
const topMenu = (page: Page) => page.getByRole("navigation", { name: "Chapters" });
const tabs = (page: Page) => page.getByRole("navigation", { name: "Pages" });
const marked = (menu: Locator) => menu.locator("[aria-current]");

for (const { screen, use, menu } of [
  { screen: "a desktop", use: DESKTOP, menu: topMenu },
  { screen: "a phone", use: PHONE, menu: tabs },
]) {
  test.describe(`on ${screen}`, () => {
    test.use(use);

    for (const { path, title, before, after } of CHAPTERS) {
      test(`${path} has its title, is marked in the menu, and leads to the chapters on either side`, async ({ page }) => {
        await visit(page, path);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
        await expect(marked(menu(page))).toHaveCount(1);
        await expect(marked(menu(page))).toBeVisible();
        await expect(marked(menu(page))).toHaveAttribute("href", path);
        await expect(marked(menu(page))).toHaveAttribute("aria-current", "page");
        const pager = page.getByRole("navigation", { name: "Previous and next chapter" });
        await expect(pager.locator('a[rel="prev"]')).toHaveText(new RegExp(`^\\s*Previous\\s*${before}$`));
        if (after) await expect(pager.locator('a[rel="next"]')).toHaveText(new RegExp(`^\\s*Next\\s*${after}$`));
        else await expect(pager.locator('a[rel="next"]')).toHaveCount(0);
      });
    }

    // Until November 2026 the whole site was one page, and links into it are out there.
    for (const { old, now, landed } of [
      { old: "/#research", now: "/research#research", landed: (page: Page) => expect(page.locator("#research")).toBeInViewport() },
      { old: "/#case-gke", now: "/iot#case-gke", landed: (page: Page) => expect(page.locator("#case-gke")).toBeInViewport() },
      { old: "/#case-ai-platform", now: "/ai#case-ai-platform", landed: (page: Page) => expect(page.locator("#case-ai-platform")).toBeInViewport() },
      { old: "/#experience", now: "/about#experience", landed: (page: Page) => expect(page.locator("#experience")).toBeInViewport() },
      { old: "/#postmortems", now: "/writing#postmortems", landed: (page: Page) => expect(page.locator("#postmortems")).toBeInViewport() },
      { old: "/#platform-cost", now: "/iot#platform-cost", landed: (page: Page) => expectTab(page, "Cost review") },
      { old: "/#ai-trace", now: "/ai#ai-trace", landed: (page: Page) => expectTab(page, "Inside one request") },
      { old: "/#work-ai", now: "/ai#work-ai", landed: (page: Page) => expect(page.getByRole("heading", { level: 1 })).toBeInViewport() },
    ]) {
      test(`an old link to ${old} lands on ${now}`, async ({ page }) => {
        await page.goto(old);
        await expect(page).toHaveURL(now);
        await landed(page);
      });
    }
  });
}

async function expectTab(page: Page, name: string) {
  await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name })).toBeInViewport();
}

test("an old link keeps its query", async ({ page }) => {
  await page.goto("/?ref=x#stack");
  await expect(page).toHaveURL("/about?ref=x#stack");
  await expect(page.locator("#stack")).toBeInViewport();
});

test("a link to a section that is still on the home page stays there", async ({ page }) => {
  await visit(page, "/#contact");
  await expect(page.locator("#contact").getByRole("heading", { name: "Get in touch" })).toBeInViewport();
  await expect(page).toHaveURL("/#contact");
});

test("a link that cannot be read leaves the home page standing", async ({ page }) => {
  await visit(page, "/#100%");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
});

test("a desktop has no tabs along the bottom", async ({ page }) => {
  await visit(page, "/");
  await expect(topMenu(page)).toBeVisible();
  await expect(tabs(page)).toBeHidden();
});

test("the top menu marks the chapter a case study belongs to", async ({ page }) => {
  await visit(page, "/work/ai-platform");
  await expect(marked(topMenu(page))).toHaveText(["AI agent platform"]);
  await expect(marked(topMenu(page))).toHaveAttribute("aria-current", "true");
});

test("a case study leads back to its card in its chapter, by the product's name", async ({ page }) => {
  await visit(page, "/work/ai-platform");
  const back = page.getByRole("main").getByRole("link").first();
  await expect(back).toHaveText("AI agent platform");
  await back.click();
  await expect(page).toHaveURL("/ai#case-ai-platform");
  await expect(page.locator("#case-ai-platform")).toBeInViewport();
});

test.describe("at an address with no page", () => {
  // Chrome logs the 404 of the page itself.
  test.use({ expectedLogs: /status of 404/ });

  test("the answer is a 404 that says so and offers every chapter", async ({ page }) => {
    const response = await visit(page, "/this-page-does-not-exist");
    expect(response!.status()).toBe(404);
    await expect(page).toHaveTitle(/^Page not found/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nothing lives here");
    await expect(topMenu(page)).toBeVisible();
    for (const path of ["/", ...CHAPTERS.map((chapter) => chapter.path)]) {
      await expect(page.getByRole("main").locator(`a[href="${path}"]`)).toBeVisible();
    }
  });
});

test.describe("on a phone", () => {
  test.use(PHONE);

  test("the tabs are the six chapters by name, with Home marked", async ({ page }) => {
    await visit(page, "/");
    await expect(tabs(page).getByRole("link")).toHaveText(["Home", ...CHAPTERS.map((chapter) => chapter.tab)]);
    await expect(marked(tabs(page))).toHaveText(["Home"]);
  });

  test("a tab opens its chapter and is marked there", async ({ page }) => {
    await visit(page, "/");
    await tabs(page).getByRole("link", { name: "Research" }).click();
    await expect(page).toHaveURL("/research");
    await expect(marked(tabs(page))).toHaveText(["Research"]);
  });

  for (const { path, tab, name } of [
    { path: "/work/gke", tab: "IoT", name: "IoT platform" },
    { path: "/writing/serving-llm-agents", tab: "Writing", name: "Writing" },
    { path: "/postmortems/contact-form", tab: "Writing", name: "Writing" },
  ]) {
    test(`${path} has the tabs too, with ${name} marked as the chapter it belongs to`, async ({ page }) => {
      await visit(page, path);
      await expect(marked(tabs(page))).toHaveText([tab]);
      await expect(marked(tabs(page))).toHaveAccessibleName(name);
      await expect(marked(tabs(page))).toHaveAttribute("aria-current", "true");
      await expect(marked(tabs(page))).toBeVisible();
    });
  }
});
