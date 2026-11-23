import { PHONE } from "../support/screens.ts";
import { visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

/** Every row of tabs, and the tabs to open first for the ones inside another row's panel. */
const CHAPTER_TABS: { path: string; row: string; inside?: string[] }[] = [
  { path: "/iot", row: "Platform views" },
  { path: "/iot", row: "Traffic paths" },
  { path: "/iot", row: "Monitoring views", inside: ["What I monitor"] },
  { path: "/iot", row: "Failure modes", inside: ["What I monitor", "Cause alerts"] },
  { path: "/iot", row: "Cost moves", inside: ["Cost review"] },
  { path: "/ai", row: "AI platform views" },
  { path: "/ai", row: "Journeys through the AI products" },
  { path: "/research", row: "What the cluster does not allow" },
];
const TABS = [
  ...CHAPTER_TABS,
  // The one-page version has them all.
  ...CHAPTER_TABS.map((tabs) => ({ ...tabs, path: "/v1" })),
  { path: "/agents", row: "Tools" },
  { path: "/agents", row: "Ways to connect" },
  { path: "/oncall", row: "Which incident" },
];

for (const { path, row, inside = [] } of TABS) {
  test(`"${row}" on ${path}: one stop for Tab, then the arrows, Home and End move and select`, async ({ page }) => {
    await visit(page, path);
    for (const name of inside) await page.getByRole("tab", { name, exact: true }).click();
    const tabs = page.getByRole("tablist", { name: row, exact: true }).getByRole("tab");
    const last = (await tabs.count()) - 1;
    const at = async (i: number) => {
      await expect(tabs.nth(i)).toBeFocused();
      await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true");
      await expect(tabs.and(page.locator('[tabindex="0"]'))).toHaveCount(1);
    };

    await tabs.first().click();
    await at(0);
    for (const [key, i] of [
      ["ArrowRight", 1],
      ["End", last],
      ["ArrowRight", 0],
      ["ArrowLeft", last],
      ["Home", 0],
    ] as const) {
      await page.keyboard.press(key);
      await at(i);
    }

    // Each tab names the panel it opens, and the open one is there.
    for (const tab of await tabs.all()) await expect(tab).toHaveAttribute("aria-controls", /./);
    const panel = page.locator(`[id="${await tabs.first().getAttribute("aria-controls")}"]`);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveRole("tabpanel");
  });
}

for (const [width, height] of [
  [1440, 900],
  [768, 1024],
] as const) {
  test(`at ${width} px wide, neither Tab nor Shift+Tab takes the focus under the bar at the top or the tabs at the bottom`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await visit(page, "/");
    const covered: string[] = [];

    /** Presses a key until it has gone past everything on the page: how many things it stopped at. */
    const walk = async (key: "Tab" | "Shift+Tab") => {
      let stops = 0;
      for (let press = 0; press < 300; press++) {
        await page.keyboard.press(key);
        const focus = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return { name: null, covered: false };
          const name = (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40);
          // The bars themselves, and the skip link, which lies over the top one on purpose.
          if (el.closest('header, nav[aria-label="Pages"]') || el.getAttribute("href") === "#main") return { name, covered: false };
          const box = el.getBoundingClientRect();
          const top = document.querySelector("header")!.getBoundingClientRect().bottom;
          const tabs = document.querySelector('nav[aria-label="Pages"]')!;
          const bottom = getComputedStyle(tabs).display === "none" ? window.innerHeight : tabs.getBoundingClientRect().top;
          return { name, covered: box.top < top - 1 || box.bottom > bottom + 1 };
        });
        if (focus.name === null && stops > 0) break;
        if (focus.name !== null) stops++;
        if (focus.covered) covered.push(`${key}: ${focus.name}`);
      }
      return stops;
    };

    // On the way down the page things come in from the bottom of the screen, and on the way back up from its top.
    expect(await walk("Tab")).toBeGreaterThan(40);
    expect(await walk("Shift+Tab")).toBeGreaterThan(40);
    expect(covered).toEqual([]);
  });
}

test("after Get in touch, the next Tab is in the contact section", async ({ page }) => {
  await visit(page, "/");
  await page.locator("#top").getByRole("link", { name: "Get in touch" }).click();
  await expect(page.locator("#contact").getByRole("heading", { name: "Get in touch" })).toBeInViewport();
  await page.keyboard.press("Tab");
  await expect(page.locator("#contact :focus")).toHaveCount(1);
});

test.describe("on a phone", () => {
  test.use(PHONE);

  test("a page starts with a link past its menus to its content", async ({ page }) => {
    await visit(page, "/work/gke");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("main").locator(":focus")).toHaveCount(1);
  });
});
