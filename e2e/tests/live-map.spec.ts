import type { Page } from "@playwright/test";
import { DESKTOP, PHONE } from "../support/screens.ts";
import { running, sidewaysScroll, visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

// The figure beside the name: this visit's own request, drawn with its own numbers.
const map = (page: Page) => page.locator("#top figure");
const box = (page: Page, name: RegExp) => map(page).getByRole("link", { name });
// Drawn on the map and listed on a phone, whichever fits; only one of them shows.
const timing = (page: Page, text: RegExp) => map(page).getByText(text).filter({ visible: true });

test.describe("on a desktop", () => {
  test.use({ ...DESKTOP, reducedMotion: "no-preference" });

  test("every box on the map is a link that says where it goes", async ({ page }) => {
    await visit(page, "/");
    for (const [name, href] of [
      [/^You\b.*Your visit's trace is on the status page/, "/status#visit-trace"],
      [/^Google front end\b.*the decision records/, "/decisions"],
      [/^Cloud Run\b.*The status page/, "/status"],
      [/^This page\b.*What the site costs/, "/cost"],
      [/^\/api\b.*for agents/, "/agents"],
      [/^GitHub Actions\b.*The changelog/, "/changelog"],
      [/^Uptime checks\b.*The status page/, "/status"],
      [/^Cloud Monitoring\b.*The status page/, "/status"],
    ] as const) {
      await expect(box(page, name)).toBeVisible();
      await expect(box(page, name)).toHaveAttribute("href", href);
    }
  });

  test("the boxes show the instance that answered and the page it sent, and the path this visit's own timings", async ({ page, request }) => {
    await visit(page, "/");
    await expect(box(page, /^Cloud Run/)).toContainText(/up \d+ (min|h|days)/);
    await expect(box(page, /^This page/)).toContainText(/\d+ KB · [\d.]+ m?s/);
    await expect(timing(page, /^(connect [\d.]+ m?s|setup [\d.]+ m?s|connection reused)$/)).toBeVisible();
    await expect(timing(page, /^1st byte [\d.]+ m?s$/)).toBeVisible();
    await expect(timing(page, /^Go [\d.]+ m?s$/)).toBeVisible();
    const { commit } = await (await request.get("/api/status")).json();
    const caption = new RegExp(`the first byte came back in [\\d.]+ m?s, [\\d.]+ m?s of it in the Go server, from commit ${commit}`);
    await expect(map(page).locator("figcaption")).toContainText(caption);
  });

  for (const width of [1440, 1280, 1100, 1024]) {
    for (const answered of [true, false]) {
      test(`at ${width} px, ${answered ? "with" : "before"} an answer from the server, no timing is on a line of the map or under a box`, async ({ page }) => {
        // Until it has answered, the box of the instance holds its region, which is wider.
        if (!answered) await page.route("**/api/status", () => {});
        await page.setViewportSize({ width, height: 900 });
        await visit(page, "/");
        await expect(timing(page, /^Go [\d.]+ m?s$/)).toBeVisible();
        if (answered) await expect(box(page, /^Cloud Run/)).toContainText(/up \d/);
        expect(await map(page).evaluate(under, "lines" as const)).toEqual([]);
        expect(await map(page).evaluate(under, "boxes" as const)).toEqual([]);

        // Flatter, with the switches under it.
        await page.getByRole("button", { name: "Unplug something" }).click();
        await expect(page.getByRole("group", { name: /^Take one part of this site away/ })).toBeVisible();
        expect(await map(page).evaluate(under, "lines" as const)).toEqual([]);
        expect(await map(page).evaluate(under, "boxes" as const)).toEqual([]);
      });
    }
  }

  test("the map asks the server again every 30 seconds while it is on the screen, and not once it is scrolled away", async ({ page }) => {
    let asked = 0;
    await page.route("**/api/status", async (route) => {
      asked++;
      await route.continue();
    });
    // Two seconds at a time. The page gives up on an answer after four, so one leap of thirty would give up on what it had just asked for
    // before it was sent. What it does ask for is counted by the time a request made after it is answered.
    const wait = async (seconds: number) => {
      for (let passed = 0; passed < seconds; passed += 2) {
        await page.clock.runFor(2_000);
        await page.evaluate(() => fetch("/api/health").then((answer) => answer.text()));
      }
    };
    await page.clock.install();
    await visit(page, "/");
    await expect(box(page, /^Cloud Run/)).toContainText(/up \d/);

    const atFirst = asked;
    await wait(20);
    expect(asked).toBe(atFirst);
    await wait(12);
    expect(asked).toBe(atFirst + 1);

    await page.locator("#latest").scrollIntoViewIfNeeded();
    await expect(map(page)).not.toBeInViewport();
    // The ledger takes a reading of its own when it comes near the screen.
    await expect(page.locator("#explore").getByRole("link", { name: "Time in the Go server" })).toContainText(/\d ms/);
    const scrolledAway = asked;
    await wait(40);
    expect(asked).toBe(scrolledAway);

    await map(page).scrollIntoViewIfNeeded();
    await expect.poll(() => asked).toBe(scrolledAway + 1);
  });

  test("a release that goes out while the page is open is named, with a button that loads it", async ({ page }) => {
    let released = false;
    await page.route("**/api/status", async (route) => {
      const response = await route.fetch();
      const status = await response.json();
      await route.fulfill({ response, json: released ? { ...status, commit: "beef123" } : status });
    });
    const caption = map(page).locator("figcaption");
    const reload = page.getByRole("button", { name: "Reload for it" });
    await page.clock.install();
    await visit(page, "/");
    await expect(box(page, /^Cloud Run/)).toContainText(/up \d/);
    await expect(caption).not.toContainText("went out while you were here");
    await expect(reload).toBeHidden();

    released = true;
    await page.clock.runFor(30_000);
    await expect(caption).toContainText("Commit beef123 went out while you were here. Reload for it.");

    await reload.click();
    await running(page);
    await expect(box(page, /^Cloud Run/)).toContainText(/up \d/);
    await expect(caption).not.toContainText("went out while you were here");
    await expect(reload).toBeHidden();
  });

  test.describe("in another time zone", () => {
    test.use({ timezoneId: "America/Los_Angeles" });

    test("the map names the clock the browser keeps, and claims no place", async ({ page }) => {
      await visit(page, "/");
      await expect(box(page, /^You/)).toHaveAccessibleName(/^You Pacific time /);
      await expect(map(page)).not.toContainText(/Los Angeles|California/);
    });
  });
});

test.describe("on a phone", () => {
  test.use(PHONE);

  test("the map is the path in four steps, the third of them the instance that is running", async ({ page }) => {
    await visit(page, "/");
    const steps = page.getByRole("list", { name: "The request that loaded this page, step by step" }).getByRole("listitem");
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toContainText("You");
    await expect(steps.nth(1)).toContainText(/Google front end.*first byte [\d.]+ m?s/);
    await expect(steps.nth(2)).toContainText(/Cloud Run · Go server.*up \d+ (min|h|days)/);
    await expect(steps.nth(3)).toContainText(/This page.*\d+ KB.*end to end/);
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
  });
});

/** The timings that one of the map's lines crosses, or one of its boxes covers, a couple of pixels of air included. */
function under(figure: Element, what: "lines" | "boxes") {
  const timings = [...figure.querySelectorAll("span")].filter(
    (span) => /^(connect |setup |connection reused|1st byte |Go )/.test(span.textContent!) && span.getBoundingClientRect().width > 0,
  );
  const boxes = [...figure.querySelectorAll("a")].map((link) => link.getBoundingClientRect());
  const lines = [...figure.querySelectorAll("line")].map((line) => {
    const toScreen = line.ownerSVGElement!.getScreenCTM()!;
    const end = (n: 1 | 2) => new DOMPoint(Number(line.getAttribute(`x${n}`)), Number(line.getAttribute(`y${n}`))).matrixTransform(toScreen);
    return [end(1), end(2)] as const;
  });
  return timings
    .filter((span) => {
      const { left, right, top, bottom } = span.getBoundingClientRect();
      const overlaps = (x1: number, x2: number, y1: number, y2: number) => x1 < right + 2 && x2 > left - 2 && y1 < bottom + 2 && y2 > top - 2;
      if (what === "boxes") return boxes.some((b) => overlaps(b.left, b.right, b.top, b.bottom));
      return lines.some(([from, to]) => {
        const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y));
        return Array.from({ length: steps + 1 }, (_, i) => i / steps).some((along) => {
          const x = from.x + along * (to.x - from.x);
          const y = from.y + along * (to.y - from.y);
          return overlaps(x, x, y, y);
        });
      });
    })
    .map((span) => span.textContent);
}
