import type { Page } from "@playwright/test";
import { DESKTOP, PHONE } from "../support/screens.ts";
import { expectTop, visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

type Drill = "iot" | "ai";

const tab = (page: Page, drill: Drill) => page.getByRole("tab", { name: { iot: /Building IoT platform/, ai: /AI agent platform/ }[drill] });
const panel = (page: Page, drill: Drill) => page.locator(`#oncall-panel-${drill}`);
const move = (page: Page, drill: Drill, name: string) => panel(page, drill).getByRole("button", { name });

/** The debrief's checks as it scores them: whether each was met, and what it was. */
const scores = (page: Page, drill: Drill) =>
  panel(page, drill)
    .getByRole("listitem")
    .filter({ has: page.getByRole("img", { name: /^(Yes|No)$/ }) })
    .evaluateAll((checks) => checks.map((check) => `${check.querySelector("[aria-label]")!.getAttribute("aria-label")}: ${check.textContent!.trim()}`));

async function goOnCall(page: Page, drill: Drill) {
  await move(page, drill, "Go on call").click();
  await expect(panel(page, drill)).toContainText("PAGE, FIRING");
}

for (const { screen, use } of [
  { screen: "a desktop", use: { ...DESKTOP, colorScheme: "dark" as const } },
  { screen: "a phone", use: PHONE },
]) {
  test.describe(`on ${screen}`, () => {
    test.use(use);

    test("there are two drills, the first open, and it says what in it is real", async ({ page }) => {
      await visit(page, "/oncall");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("You're on call");
      await expect(page.getByRole("tab")).toHaveCount(2);
      await expect(tab(page, "iot")).toHaveAttribute("aria-selected", "true");
      await expect(panel(page, "iot")).toBeVisible();
      await expect(panel(page, "ai")).toBeHidden();
      await expect(panel(page, "iot")).toContainText("is a proposal, not yet agreed");
    });

    test("the arrow keys choose a drill, and the address follows so it can be shared", async ({ page }) => {
      await visit(page, "/oncall");
      await tab(page, "iot").focus();
      await page.keyboard.press("ArrowRight");
      await expect(tab(page, "ai")).toBeFocused();
      await expect(tab(page, "ai")).toHaveAttribute("aria-selected", "true");
      await expect(page).toHaveURL("/oncall#oncall-ai");
      await page.keyboard.press("Home");
      await expect(tab(page, "iot")).toHaveAttribute("aria-selected", "true");
      await expect(page).toHaveURL("/oncall#oncall-iot");
    });

    test("a link to a drill opens it", async ({ page }) => {
      await visit(page, "/oncall#oncall-ai");
      await expect(tab(page, "ai")).toHaveAttribute("aria-selected", "true");
      await expect(panel(page, "ai")).toBeVisible();
      await expect(panel(page, "iot")).toBeHidden();
    });

    test("an incident worked to its end moves the focus along, and is scored on what was done", async ({ page }) => {
      await visit(page, "/oncall#oncall-ai");
      await goOnCall(page, "ai");
      await expect(panel(page, "ai").getByText("Document assistant: slow answers, fast burn", { exact: true })).toBeFocused();

      // A look at something shows it once: looked at again, it costs nothing and tells nothing new.
      const latency = move(page, "ai", "Latency dashboard");
      await latency.click();
      await expect(latency).toBeFocused();
      await expect(latency).toHaveAttribute("aria-disabled", "true");
      await expect(panel(page, "ai")).toContainText("now (2 min in)");
      await page.keyboard.press("Enter");
      await expect(panel(page, "ai")).toContainText("now (2 min in)");

      await move(page, "ai", "Raise the API timeout to 120 s").click();
      await move(page, "ai", "One slow request's trace").click();
      await move(page, "ai", "Skip reranking").click();
      await expect(panel(page, "ai")).toContainText("MITIGATED, VERIFYING");
      const restore = move(page, "ai", "Get the reranker back on its GPU");
      await expect(restore).toBeFocused();
      await restore.click();

      await expect(panel(page, "ai")).toContainText("YOUR POSTMORTEM");
      await expect(panel(page, "ai").getByText("Burn stopped after 8 minutes, closed after 12")).toBeFocused();
      await expect(panel(page, "ai")).toContainText("One move did not help: raise the API timeout to 120 s.");
      expect(await scores(page, "ai")).toEqual([
        expect.stringMatching(/^Yes: Read a slow request's trace before acting/),
        expect.stringMatching(/^Yes: Stopped the slow answers within 12 minutes \(took 8\)/),
        expect.stringMatching(/^No: Found why before closing/),
        expect.stringMatching(/^Yes: Never silenced the page/),
        expect.stringMatching(/^Yes: Stayed inside the runbook/),
        expect.stringMatching(/^Yes: Restored full quality/),
      ]);
    });

    test("a drill left half-way is where it was left", async ({ page }) => {
      await visit(page, "/oncall");
      await goOnCall(page, "iot");
      await expect(panel(page, "iot").getByText("Telemetry fresh: fast burn", { exact: true })).toBeFocused();
      await move(page, "iot", "Changes: recent deploys").click();
      await tab(page, "ai").click();
      await goOnCall(page, "ai");
      await tab(page, "iot").click();
      await expect(panel(page, "iot")).toContainText("PAGE, FIRING");
      await expect(move(page, "iot", "Changes: recent deploys")).toHaveAttribute("aria-disabled", "true");
      await move(page, "iot", "Roll back the parser").click();
      await move(page, "iot", "Confirm recovery").click();
      await expect(panel(page, "iot")).toContainText("YOUR POSTMORTEM");
      expect((await scores(page, "iot"))[0]).toMatch(/^Yes: Checked what changed before rolling back/);
    });
  });
}

for (const { chapter, section, drill } of [
  { chapter: "/iot", section: "#platform", drill: "iot" },
  { chapter: "/ai", section: "#ai", drill: "ai" },
]) {
  test(`${chapter} leads to the drill on its platform`, async ({ page }) => {
    await visit(page, chapter);
    await expect(page.locator(section).getByRole("link", { name: /^Try being on call/ })).toHaveAttribute("href", `/oncall#oncall-${drill}`);
  });
}

// What a press produces has to come onto the screen, or the button seems to do nothing.
test.describe("what a move finds is on the screen", () => {
  for (const [width, height] of [
    [1366, 768],
    [1440, 900],
    [1280, 720],
  ] as const) {
    test(`on a ${width}x${height} laptop, under the alert, which stays while the moves scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await visit(page, "/oncall");
      await goOnCall(page, "iot");
      const alert = panel(page, "iot").getByText("Telemetry fresh: fast burn", { exact: true });
      await expectTop(alert, { from: 64, to: height * 0.4 });

      await move(page, "iot", "Overview dashboard").click();
      const found = panel(page, "iot").getByRole("region", { name: "What you have found" }).getByText(/^Dashboards load and the API answers/);
      await expect(found).toBeInViewport({ ratio: 1 });
      await expectTop(found, { from: 64, to: height });

      const scrolled = () => page.evaluate(() => window.scrollY);
      const before = await scrolled();
      await page.mouse.move(width * 0.75, height / 2);
      await page.mouse.wheel(0, 400);
      await expect.poll(scrolled).toBeGreaterThan(before);
      await expectTop(alert, { from: 50, to: height * 0.4 });
    });
  }

  test.describe("on a phone", () => {
    test.use(PHONE);

    test("at the top, with the pager's state and the budget, for a look and for an action", async ({ page }) => {
      await visit(page, "/oncall");
      await goOnCall(page, "iot");
      const alert = panel(page, "iot").getByText("Telemetry fresh: fast burn", { exact: true });
      await expectTop(alert, { from: 64, to: 844 * 0.4 });

      // The hint in the empty list is clear of the box's rounded corners.
      await expect(panel(page, "iot").getByText("Nothing yet.")).toHaveCSS("padding-left", "8px");

      // The newest result is shown a second time beside the buttons; the list that announces it is off the screen above.
      const latest = panel(page, "iot").locator('[aria-hidden="true"]').filter({ hasText: "of the budget spent" });
      for (const [name, text] of [
        ["Read the runbook", "Check monitoring is fresh."],
        ["Restart the parser pods", "The pods come back Ready, running the same image."],
      ] as const) {
        await move(page, "iot", name).tap();
        await expect(latest).toContainText(text);
        await expect(latest).toContainText(/PAGE, FIRING.*% of the budget spent/);
        await expectTop(latest, { from: 0, to: 844 / 2 });
      }
    });
  });
});
