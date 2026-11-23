import type { Page } from "@playwright/test";
import { DESKTOP, PHONE } from "../support/screens.ts";
import { visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

// The site as it was until November 2026, one long page, kept at /v1.
const work = (page: Page) => page.locator("#work");
const meta = (page: Page, selector: string, attribute: string) => page.locator(`head > ${selector}`).getAttribute(attribute);

test("it is out of search, names itself as the page it is, and has a share image", async ({ page }) => {
  await visit(page, "/v1");
  expect(await meta(page, 'meta[name="robots"]', "content")).toContain("noindex");
  // Left out of search with another page as its canonical, it would give search engines two answers.
  expect(new URL((await meta(page, 'link[rel="canonical"]', "href"))!, page.url()).pathname).toBe("/v1");
  expect(await meta(page, 'meta[property="og:image"]', "content")).toBeTruthy();
});

test("it says what it is, and links to the decision that split it", async ({ page }) => {
  await visit(page, "/v1");
  await expect(page.getByRole("complementary", { name: "About this version" })).toContainText("Version 1, kept as a record.");
  await page.getByRole("link", { name: "decision 11" }).click();
  await expect(page).toHaveURL("/decisions#chapters-not-one-page");
  await expect(page.locator("#chapters-not-one-page").getByRole("heading", { level: 2 })).toBeInViewport();
});

test("it holds every section of the old page, in the old order", async ({ page }) => {
  await visit(page, "/v1");
  const sections = ["work", "work-iot", "platform", "ai", "case-ai-platform", "ai-views", "research", "experience", "ask", "status", "postmortems", "writing", "contact"];
  const tops = await page.evaluate((ids) => ids.map((id) => document.getElementById(id)?.getBoundingClientRect().top), sections);
  for (const [i, top] of tops.entries()) {
    expect(top, sections[i]).toBeDefined();
    if (i) expect(top!, `${sections[i]} after ${sections[i - 1]}`).toBeGreaterThan(tops[i - 1]!);
  }
});

test("its case studies are the chapters', each with its product: the IoT ones in Work, tagged, and the AI one in the AI section", async ({ page }) => {
  await visit(page, "/iot");
  const ids = (group: ReturnType<typeof work>) => group.getByRole("article").evaluateAll((cards) => cards.map((card) => card.id));
  const inChapter = await ids(work(page));

  await visit(page, "/v1");
  expect(await ids(work(page))).toEqual(inChapter);
  const groups = work(page).getByRole("group", { name: /./ });
  await expect(groups).toHaveCount(1);
  await expect(groups).toHaveAccessibleName("Building IoT platform");
  for (const card of await work(page).getByRole("article").all()) await expect(card.getByText("Building IoT platform", { exact: true })).toBeVisible();
  await expect(page.locator("#ai #case-ai-platform").getByRole("heading", { level: 3 })).toHaveText("Running an agentic AI platform");
});

test("in Work the headings nest: the section, its product, its cases", async ({ page }) => {
  await visit(page, "/v1");
  const levels = await work(page).evaluate((section) => [...section.querySelectorAll("h2, h3, h4")].map((heading) => heading.tagName).join(" "));
  expect(levels).toMatch(/^H2( H3( H4)+)+$/);
});

test("the AI section's figures are the AI platform's own", async ({ page }) => {
  await visit(page, "/v1");
  const figures = page.locator("#ai dl").first();
  await expect(figures).toContainText(/\d/);
  await expect(figures).not.toContainText("96%");
});

for (const { screen, use } of [
  { screen: "a desktop", use: { ...DESKTOP, reducedMotion: "no-preference" as const } },
  { screen: "a phone", use: PHONE },
]) {
  test.describe(`on ${screen}`, () => {
    test.use(use);

    for (const { press, inside, lands } of [
      { press: "Building IoT platform", inside: "#work", lands: "#work-iot" },
      { press: "AI agent platform", inside: "#work", lands: "#ai" },
      { press: "ARIES agent benchmarks", inside: "#work", lands: "#research" },
      { press: "Its case study", inside: "#experience", lands: "#case-ai-platform" },
      { press: /^Its \d+ case studies/, inside: "#experience", lands: "#work-iot" },
    ]) {
      test(`${press} in ${inside} goes to ${lands}, on this page`, async ({ page }) => {
        await visit(page, "/v1");
        await page.locator(inside).getByRole("button", { name: press }).first().click();
        await expect.poll(() => page.locator(lands).evaluate((el) => el.getBoundingClientRect().top < window.innerHeight * 0.6 && el.getBoundingClientRect().bottom > 60)).toBe(true);
        expect(new URL(page.url()).pathname).toBe("/v1");
      });
    }

    test("the link of the group of case studies goes to the platform from the inside", async ({ page }) => {
      await visit(page, "/v1");
      await page.locator("#work-iot").getByRole("link", { name: /^Inside the platform/ }).click();
      await expect.poll(() => page.locator("#platform").evaluate((el) => Math.abs(el.getBoundingClientRect().top))).toBeLessThan(200);
    });

    test("following a request from the AI case opens the map below it, whatever view was open", async ({ page }) => {
      await visit(page, "/v1");
      const views = page.getByRole("tablist", { name: "AI platform views" });
      await views.getByRole("tab", { name: "The AI infra stack" }).click();
      await page.getByRole("button", { name: /^Follow a request through the whole platform/ }).click();
      await expect(views.getByRole("tab", { name: "Follow a request" })).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("#ai-views")).toBeInViewport();
    });
  });
}
