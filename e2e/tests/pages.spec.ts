import type { Page } from "@playwright/test";
import { DESKTOP, PHONE } from "../support/screens.ts";
import { sidewaysScroll, sitemapPaths, visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

// Every page in the sitemap, and the one-page version that is kept out of it. After each visit the console is checked too
// (support/test.ts), so a page that asks for something that is not there fails here.
const PAGES = [...(await sitemapPaths()), "/v1"];

/** What is wrong with the page's headings: one title, first, and no level skipped on the way down. */
const headingProblems = (page: Page) =>
  page.evaluate(() => {
    const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")]
      .filter((heading) => heading.checkVisibility() || heading.classList.contains("sr-only"))
      .map((heading) => ({ level: Number(heading.tagName[1]), text: heading.textContent!.trim().slice(0, 40) }));
    const problems: string[] = [];
    const titles = headings.filter(({ level }) => level === 1).length;
    if (titles !== 1) problems.push(`${titles} titles`);
    if (headings[0]?.level !== 1) problems.push(`starts with "${headings[0]?.text}"`);
    for (const [i, { level, text }] of headings.entries()) {
      const above = headings[i - 1];
      if (above && level > above.level + 1) problems.push(`h${above.level} then h${level}, "${text}"`);
    }
    return problems;
  });

/** Columns pinned beside a longer one that are taller than the screen below their top, so their end can never be read. */
const tooTallToPin = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main *")]
      .filter((el) => getComputedStyle(el).position === "sticky")
      .map((el) => ({ text: el.textContent!.trim().slice(0, 40), height: el.offsetHeight, room: window.innerHeight - (parseFloat(getComputedStyle(el).top) || 0) }))
      .filter(({ height, room }) => height > room),
  );

for (const path of PAGES) {
  test.describe(path, () => {
    test.describe("on a desktop", () => {
      test.use({ ...DESKTOP, colorScheme: "dark", reducedMotion: "no-preference" });

      test(`${path} is whole, with its headings in order and nothing wider or pinned taller than the screen`, async ({ page }) => {
        const response = await visit(page, path);
        expect(response!.status()).toBe(200);
        await page.waitForLoadState("networkidle");

        expect(await headingProblems(page)).toEqual([]);
        const description = (await page.locator('head > meta[name="description"]').getAttribute("content"))!;
        expect(description.length, "a description longer than a search result shows").toBeLessThanOrEqual(165);
        expect(description.length).toBeGreaterThan(40);

        for (const [width, height] of [
          [1920, 1080],
          [1440, 900],
          [1366, 768],
          [1280, 720],
          [1024, 768],
        ] as const) {
          await page.setViewportSize({ width, height });
          expect(await sidewaysScroll(page), `sideways scroll at ${width} px`).toBeLessThanOrEqual(0);
          await expect.poll(() => tooTallToPin(page), { message: `pinned taller than ${width}x${height}` }).toEqual([]);
        }
      });
    });

    test.describe("on a phone", () => {
      test.use(PHONE);

      test(`${path} is whole, with nothing wider than the screen, down to 320 px`, async ({ page }) => {
        await visit(page, path);
        await page.waitForLoadState("networkidle");
        for (const width of [390, 360, 320]) {
          await page.setViewportSize({ width, height: 844 });
          expect(await sidewaysScroll(page), `sideways scroll at ${width} px`).toBeLessThanOrEqual(0);
        }
      });
    });
  });
}

test.describe("the page for an address with nothing at it", () => {
  // Chrome logs the 404 of the page itself.
  test.use({ expectedLogs: /status of 404/ });

  test("has its headings in order, and nothing wider than a narrow phone", async ({ page }) => {
    await visit(page, "/no-such-page");
    expect(await headingProblems(page)).toEqual([]);
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
  });
});

test("the footer reaches the pages about the site itself, from every page", async ({ page }) => {
  for (const path of ["/", "/work/gke", "/v1"]) {
    await visit(page, path);
    const links = await page.getByRole("contentinfo").getByRole("link").evaluateAll((all) => all.map((link) => link.getAttribute("href")));
    expect(links).toEqual(expect.arrayContaining(["/status", "/cost", "/break", "/changelog", "/decisions", "/evidence", "/agents", "/oncall", "/v1"]));
  }
});

test("no page links to a page, or a section of one, that is not there", async ({ request }) => {
  const html = new Map<string, string>();
  const fetched = async (path: string) => {
    if (!html.has(path)) {
      const response = await request.get(path, { headers: { Accept: "text/html" }, maxRedirects: 0 });
      html.set(path, response.ok() ? await response.text() : "");
    }
    return html.get(path)!;
  };

  const links = new Map<string, string>();
  for (const path of PAGES) {
    for (const [, href] of (await fetched(path)).matchAll(/<a [^>]*href="(\/[^"]*|#[^"]+)"/g)) {
      const { pathname, hash } = new URL(href!.replaceAll("&amp;", "&"), `http://site${path}`);
      links.set(pathname + hash, path);
    }
  }
  expect(links.size).toBeGreaterThan(PAGES.length);

  const dead: string[] = [];
  for (const [link, from] of links) {
    const [path, section] = link.split("#") as [string, string?];
    const page = await fetched(path);
    if (!page) dead.push(`${link} (from ${from})`);
    // A tab has a link of its own, which its section reads: /iot#platform-cost, /ai#ai-trace, /oncall#oncall-ai.
    else if (section && !page.includes(`id="${section}"`) && !/^(platform|ai|oncall)-\w+$/.test(section)) dead.push(`${link} (from ${from})`);
  }
  expect(dead).toEqual([]);
});
