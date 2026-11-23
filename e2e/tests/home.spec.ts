import type { Page } from "@playwright/test";
import { DESKTOP, PHONE } from "../support/screens.ts";
import { visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

for (const { screen, use, screens } of [
  { screen: "a desktop", use: DESKTOP, screens: 6 },
  { screen: "a phone", use: PHONE, screens: 9 },
]) {
  test.describe(`on ${screen}`, () => {
    test.use(use);

    test(`the home page keeps to its six sections and stays under ${screens} screens`, async ({ page }) => {
      await visit(page, "/");
      const sections = await page.locator("main > section").evaluateAll((all) => all.map((section) => section.id));
      expect(sections).toEqual(["top", "now", "chapters", "explore", "latest", "contact"]);
      expect(await page.evaluate(() => document.documentElement.scrollHeight / window.innerHeight)).toBeLessThan(screens);
    });

    test("the title is the name", async ({ page }) => {
      await visit(page, "/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Li ZhenXi");
    });

    test("a chapter's card opens the chapter", async ({ page }) => {
      await visit(page, "/");
      const cards = page.locator("#chapters").getByRole("link");
      expect(await cards.evaluateAll((all) => all.map((card) => card.getAttribute("href")))).toEqual(["/iot", "/ai", "/research"]);
      // The figure on a card changes with the work behind it, so only that there is one.
      for (const card of await cards.all()) await expect(card).toContainText(/\d/);
      await page.locator("#chapters").getByRole("link", { name: /AI agent platform/ }).click();
      await expect(page).toHaveURL("/ai");
    });
  });
}

test("the first screen says what has been done, in numbers", async ({ page }) => {
  await visit(page, "/");
  const proof = page.locator("#top p", { hasText: "pull requests" });
  await expect(proof).toContainText(/\d+ of my pull requests are merged into a production IoT platform/);
  await expect(proof).toContainText(/I benchmarked \d+ LLM agent runs/);
  await expect(proof).toBeInViewport({ ratio: 1 });
});

test.describe("the service's readings", () => {
  // A row's name is what it says: the reading, its value, and what the value is of.
  const reading = (page: Page, name: string) => page.locator("#explore").getByRole("link", { name });

  test("availability is the status page's figure, rounded down so it never claims more than was measured", async ({ page, readings }) => {
    readings.slo.change({ availability: 0.999899 });
    await visit(page, "/#explore");
    await expect(reading(page, "Availability")).toHaveAccessibleName(/^Availability 99\.98% over 30 days/);
    await visit(page, "/status");
    await page.getByText("This site's own SLO, measured from outside").scrollIntoViewIfNeeded();
    await expect(page.locator("dl > div", { hasText: "availability over" }).getByRole("definition")).toHaveText("99.98%");
  });

  test("a month with no failed check reads a plain 100%", async ({ page, readings }) => {
    readings.slo.change({ availability: 1 });
    await visit(page, "/#explore");
    await expect(reading(page, "Availability")).toHaveAccessibleName(/^Availability 100% over 30 days/);
  });

  test("the bill is the one on the receipt", async ({ page }) => {
    await visit(page, "/cost");
    const total = await page.getByRole("row", { name: /^To pay/ }).getByRole("cell").innerText();
    expect(total).toMatch(/^US\$\d/);
    await visit(page, "/#explore");
    await expect(reading(page, "This month's bill")).toContainText(total);
  });

  test("the time in the Go server is this visitor's own request", async ({ page }) => {
    await visit(page, "/#explore");
    await expect(reading(page, "Time in the Go server")).toHaveAccessibleName(/^Time in the Go server [\d.]+ ms spent on your request/);
  });

  test("a reading that cannot be taken says so, and shows no number", async ({ page, readings }) => {
    readings.slo.change({ available: false, reason: "Measured on the live site only." });
    readings.cost.change({ available: false, reason: "Measured on the live site only." });
    await visit(page, "/#explore");
    for (const name of ["Availability", "Error budget left", "This month's bill"]) {
      await expect(reading(page, name)).toHaveAccessibleName(new RegExp(`^${name} not available`));
    }
  });

  test("a reading the server could not refresh is shown with its age", async ({ page, readings }) => {
    readings.slo.change({ stale: true });
    await visit(page, "/#explore");
    await expect(reading(page, "Availability")).toContainText(/; the last good reading, from \d+ \w+, \d\d:\d\d your time/);
  });

  test("every reading opens the page behind it", async ({ page }) => {
    await visit(page, "/#explore");
    for (const [name, href] of [
      ["Availability", "/status"],
      ["Error budget left", "/status"],
      ["Time in the Go server", "/status"],
      ["This month's bill", "/cost"],
      ["Deploys", "/changelog"],
      ["Claims that hold", "/evidence"],
    ] as const) {
      await expect(reading(page, name)).toHaveAttribute("href", href);
    }
  });
});

test("the things to try start with breaking the site, and lead to the drill, the terminal, Ask, the tools and the decisions", async ({ page }) => {
  await visit(page, "/#explore");
  const tries = page.locator("#explore").getByRole("list").last();
  await expect(tries.getByRole("listitem").first()).toContainText("Break it yourself");
  for (const [name, href] of [
    ["Break it yourself", "/break"],
    ["Go on call", "/oncall"],
    ["Ask about my work", "/about#ask"],
    ["Point an agent at it", "/agents"],
    ["Read the decisions", "/decisions"],
  ] as const) {
    await expect(tries.getByRole("link", { name })).toHaveAttribute("href", href);
  }
  await tries.getByRole("button", { name: "Open the terminal" }).click();
  await expect(page.getByRole("log", { name: "Terminal output" })).toBeVisible();
});

test.describe("Recently", () => {
  const list = (page: Page) => page.getByRole("list", { name: "Recently" });
  const latestDeploy = (page: Page) => page.locator("#now").getByRole("link", { name: /^This site last deployed/ });

  test("lists the five latest pieces of work, newest first, with no deploy among them", async ({ page }) => {
    await visit(page, "/");
    const entries = list(page).getByRole("listitem");
    await expect(entries).toHaveCount(5);
    const times = await entries.locator("time").evaluateAll((all) => all.map((time) => Date.parse(time.getAttribute("datetime")!)));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    for (const entry of await entries.all()) await expect(entry).toContainText(/Merged|In review|Released|Wrote|Postmortem/);
    await expect(list(page)).not.toContainText("Deployed");
    await expect(latestDeploy(page)).toBeVisible();
  });

  test("a pull request merged since the build is on top, without its commit prefix", async ({ page, readings }) => {
    const { items } = readings.activity.recording;
    const merged = { ...items[0]!, kind: "merged" as const, title: "feat(api): answer sooner", number: 1234, at: new Date().toISOString() };
    readings.activity.change({ items: [merged, ...items] });
    await visit(page, "/");
    await expect(list(page).getByRole("link").first()).toHaveAccessibleName(/ Merged Answer sooner .*#1234/);
  });

  test.describe("read from another time zone", () => {
    // A morning in Singapore is the day before there.
    test.use({ timezoneId: "America/Los_Angeles" });

    test("keeps Singapore's days", async ({ page }) => {
      await visit(page, "/");
      const entries = await list(page)
        .locator("time")
        .evaluateAll((all) => all.map((time) => ({ at: time.getAttribute("datetime")!, day: time.textContent!.trim() })));
      expect(entries).not.toEqual([]);
      for (const { at, day } of entries) {
        const inSingapore = new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Singapore" });
        expect(day).toMatch(new RegExp(`^${inSingapore}\\b`));
      }
    });
  });

  test("says nothing about its age while GitHub answers, and how old it is when GitHub has not for hours", async ({ page, readings }) => {
    const answered = page.waitForResponse("**/api/activity");
    await visit(page, "/");
    await answered;
    await expect(page.getByText(/GitHub entries as of/)).toBeHidden();

    readings.activity.change({ updated: new Date(Date.now() - 5 * 3_600_000).toISOString() });
    await visit(page, "/");
    await expect(page.getByText(/GitHub entries as of \d+ \w+ \d{4}, \d\d:\d\d Singapore time/)).toBeVisible();
  });

  // What the pipeline baked into the build: the commit it was made from, and the deploys before it.
  type Delivery = { head: { sha: string; title: string }; recent: { sha: string; title: string }[] };

  test("the latest deploy is this build's commit once the server says it runs it", async ({ page, request }) => {
    const { head } = (await (await request.get("/delivery.json")).json()) as Delivery;
    const status = await (await request.get("/api/status")).json();
    await page.route("**/api/status", (route) => route.fulfill({ json: { ...status, commit: head.sha } }));
    await visit(page, "/");
    await expect(latestDeploy(page)).toContainText(head.title);
    await expect(latestDeploy(page)).toHaveAttribute("href", new RegExp(`/commit/${head.sha}$`));
  });

  test("the latest deploy is the newest the pipeline knew of while the server runs another commit", async ({ page, request }) => {
    const { recent } = (await (await request.get("/delivery.json")).json()) as Delivery;
    const status = await (await request.get("/api/status")).json();
    await page.route("**/api/status", (route) => route.fulfill({ json: { ...status, commit: "0000000" } }));
    const answered = page.waitForResponse("**/api/status");
    await visit(page, "/");
    await answered;
    await expect(latestDeploy(page)).toContainText(recent[0]!.title);
    await expect(latestDeploy(page)).toHaveAttribute("href", "/status#replay");
  });
});
