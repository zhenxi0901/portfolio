import { expect, type Locator, type Page } from "@playwright/test";
import { BASE_URL } from "./env.ts";

/** Opens a page and waits until its script is running, so a press is never lost on a page that is still starting. */
export async function visit(page: Page, path: string) {
  const response = await page.goto(path);
  await running(page);
  return response;
}

/** The page's script draws the icon on the theme button; the server sends the button empty. */
export async function running(page: Page) {
  await expect(page.locator('header button[aria-label^="Switch to"] svg')).toBeAttached();
}

/** Every page in the sitemap, as paths: the list the tests of every page work through, however many there are. */
export async function sitemapPaths(): Promise<string[]> {
  let response: Response;
  try {
    response = await fetch(new URL("/sitemap.xml", BASE_URL));
  } catch (cause) {
    throw new Error(`There is no site at ${BASE_URL}. Start one, or set BASE_URL to where it is.`, { cause });
  }
  const xml = await response.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => new URL(url!).pathname);
}

/** How far the page is wider than the screen, in pixels: what a visitor would have to scroll sideways. */
export const sidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** The element comes to rest with its top edge this far below the top of the screen, in pixels. */
export async function expectTop(element: Locator, { from, to }: { from: number; to: number }) {
  await expect(async () => {
    const top = await element.evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(from);
    expect(top).toBeLessThanOrEqual(to);
  }).toPass({ timeout: 8_000 });
}
