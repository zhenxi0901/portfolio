import type { Page } from "@playwright/test";
import { PHONE } from "../support/screens.ts";
import { expectTop, visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

// Where a link to a section lands: its heading just under the top bar, or as near to it as the end of the page allows.
test.describe("a link to a section lands on its heading", () => {
  const LINKS = [
    "/#now",
    "/#chapters",
    "/#explore",
    "/#latest",
    "/#contact",
    "/iot#work",
    "/iot#platform",
    "/iot#case-two-step",
    "/iot#case-reaper",
    "/ai#ai",
    "/ai#ai-views",
    "/research#research",
    "/research#capacity",
    "/writing#writing",
    "/writing#postmortems",
    "/about#experience",
    "/about#stack",
    "/about#ask",
    "/status#visit-trace",
    "/status#replay",
    "/decisions#chapters-not-one-page",
    "/v1#work",
    "/v1#status",
    "/v1#contact",
    "/v1#experience",
  ].map((link) => ({ link, id: link.split("#")[1]! }));
  // A tab has a link too, which opens it and lands on its section.
  const TAB_LINKS = [
    { link: "/oncall#oncall-ai", id: "oncall" },
    { link: "/iot#platform-cost", id: "platform" },
    { link: "/ai#ai-trace", id: "ai-views" },
  ];

  for (const { screen, use } of [
    { screen: "a laptop", use: {} },
    { screen: "a phone", use: PHONE },
  ]) {
    test.describe(`on ${screen}`, () => {
      test.use(use);

      for (const { link, id } of [...LINKS, ...TAB_LINKS]) {
        test(link, async ({ page }) => {
          await visit(page, link);
          await page.waitForLoadState("networkidle");
          await expect(async () => {
            const { top, end } = await page.evaluate((section) => {
              const target = document.getElementById(section)!;
              const heading = target.matches("h1, h2, h3") ? target : (target.querySelector("h1, h2, h3, h4") ?? target);
              const left = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
              return { top: heading.getBoundingClientRect().top, end: left < 4 };
            }, id);
            expect(top).toBeGreaterThanOrEqual(64);
            if (!end) expect(top).toBeLessThanOrEqual(180);
          }).toPass({ timeout: 8_000 });
        });
      }
    });
  }
});

test.describe("on a phone", () => {
  test.use(PHONE);

  for (const id of ["replay", "visit-trace"]) {
    test(`a link to /status#${id} stays on it while the panels above fill in, until the visitor does something`, async ({ page }) => {
      await visit(page, `/status#${id}`);
      await page.waitForLoadState("networkidle");
      // As in Safari, which does not keep a reader's place by itself.
      await page.addStyleTag({ content: "* { overflow-anchor: none }" });
      const place = page.locator(`#${id}`);
      // Where the browser puts what it jumps to: under the top bar, less the section's own margin.
      const rest = await place.evaluate((el) => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) + parseFloat(getComputedStyle(el).scrollMarginTop));
      await expectTop(place, { from: rest - 4, to: rest + 4 });
      // What a panel that fills in late does to everything below it.
      const push = (pixels: number) => page.getByRole("heading", { level: 1 }).evaluate((title, by) => (title.style.marginBottom = `${by}px`), pixels);
      await push(400);
      await expectTop(place, { from: rest - 4, to: rest + 4 });
      await page.keyboard.press("Shift");
      await push(800);
      await expectTop(place, { from: rest + 390, to: rest + 410 });
    });
  }
});

test.describe("the bars along the top and the bottom", () => {
  const topBar = (page: Page) => page.getByRole("banner");
  const tabs = (page: Page) => page.getByRole("navigation", { name: "Pages" });
  const halfway = (page: Page) => page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight / 2, behavior: "instant" }));

  for (const [width, height] of [
    [844, 390],
    [683, 384],
    [342, 192],
  ] as const) {
    test(`leave a ${width}x${height} screen, a phone on its side or a page zoomed far in, to what is being read`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await visit(page, "/status");
      await expect(topBar(page)).toBeInViewport();
      await halfway(page);
      await expect(topBar(page)).not.toBeInViewport();
      await expect(tabs(page)).not.toBeInViewport();
      await tabs(page).scrollIntoViewIfNeeded();
      await expect(tabs(page)).toBeInViewport();
    });
  }

  test("stay on a phone held upright", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await visit(page, "/status");
    await halfway(page);
    await expect(topBar(page)).toBeInViewport({ ratio: 1 });
    await expect(tabs(page)).toBeInViewport({ ratio: 1 });
  });

  test("leave a laptop only the one along the top", async ({ page }) => {
    await visit(page, "/status");
    await halfway(page);
    await expect(topBar(page)).toBeInViewport({ ratio: 1 });
    await expect(tabs(page)).toBeHidden();
  });
});

test.describe("a column pinned beside a longer one", () => {
  for (const [width, height] of [
    [1024, 768],
    [1366, 768],
    [1920, 1080],
  ] as const) {
    test(`on /research keeps all of itself on a ${width}x${height} screen while the charts go by`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await visit(page, "/research");
      for (const chart of ["Why a long agent run doesn't recompute everything", "The same stack on a supercomputer, without root"]) {
        await page.getByText(chart, { exact: true }).evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
        await expect(page.locator("#research dl").first()).toBeInViewport({ ratio: 1 });
        await expect(page.getByRole("link", { name: "ARIES on GitHub" })).toBeInViewport({ ratio: 1 });
      }
    });

    test(`on /decisions, the index, can be read to its last record on a ${width}x${height} screen`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await visit(page, "/decisions");
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight / 2, behavior: "instant" }));
      const index = page.getByRole("navigation", { name: "Decisions" });
      await expect(index).toBeInViewport({ ratio: 1 });
      const last = index.getByRole("link").last();
      await last.focus();
      await expect(last).toBeInViewport({ ratio: 1 });
      const inside = await last.evaluate((link) => {
        const [record, list] = [link.getBoundingClientRect(), link.closest("nav")!.getBoundingClientRect()];
        return record.top >= list.top - 1 && record.bottom <= list.bottom + 1;
      });
      expect(inside).toBe(true);
    });
  }
});

test.describe("printed, from the dark theme", () => {
  test.use({ colorScheme: "dark", viewport: { width: 794, height: 1123 } });

  test("every line reads on white paper, and every role is open", async ({ page }) => {
    await visit(page, "/about");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await page.emulateMedia({ media: "print" });

    const faint = await page.getByRole("main").evaluate((main) => {
      const luminance = (color: string) => {
        const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map((part) => {
          const value = Number(part) / 255;
          return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      /** What the text is printed on: the nearest filled box behind it, or the paper. */
      const behind = (el: Element | null): number => {
        if (!el) return 1;
        const fill = getComputedStyle(el).backgroundColor;
        return /^rgb\(/.test(fill) ? luminance(fill) : behind(el.parentElement);
      };
      const found: string[] = [];
      let lines = 0;
      const texts = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      for (let node = texts.nextNode(); node; node = texts.nextNode()) {
        const el = node.parentElement!;
        const { width, height } = el.getBoundingClientRect();
        if (!node.textContent!.trim() || !width || !height || getComputedStyle(el).visibility === "hidden") continue;
        lines++;
        const [text, paper] = [luminance(getComputedStyle(el).color), behind(el)];
        const contrast = (Math.max(text, paper) + 0.05) / (Math.min(text, paper) + 0.05);
        if (contrast < 4.5) found.push(`${contrast.toFixed(1)}: ${node.textContent!.trim().slice(0, 40)}`);
      }
      return { lines, found };
    });
    expect(faint.lines).toBeGreaterThan(50);
    expect(faint.found).toEqual([]);

    const roles = page.locator("#experience details");
    expect(await roles.count()).toBeGreaterThan(1);
    for (const role of await roles.all()) expect((await role.locator("summary + div").boundingBox())!.height).toBeGreaterThan(40);
  });
});
