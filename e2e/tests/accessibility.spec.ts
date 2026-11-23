import type { Page } from "@playwright/test";
import { expectAccessible } from "../support/accessibility.ts";
import { PHONE } from "../support/screens.ts";
import { sitemapPaths, visit } from "../support/site.ts";
import { Terminal } from "../support/terminal.ts";
import { expect, test } from "../support/test.ts";

for (const path of await sitemapPaths()) {
  test(`${path} is accessible in both themes`, async ({ page }) => {
    await visit(page, path);
    await page.waitForLoadState("networkidle");
    await expectAccessible(page);
  });
}

// What a page becomes once it is used: an open dialog, a form with something missing, the colours of a failure.
test.describe("still accessible", () => {
  for (const tab of ["The AI infra stack", "Inside one request", "What I measure"]) {
    test(`with "${tab}" open on the AI platform`, async ({ page }) => {
      await visit(page, "/ai#ai-views");
      await page.getByRole("tab", { name: tab }).click();
      await expectAccessible(page);
    });
  }

  test("with a GPU too small for its model", async ({ page }) => {
    await visit(page, "/research#capacity");
    await page.locator("#capacity").getByLabel("GPU", { exact: true }).selectOption({ label: "L4" });
    await expect(page.locator("#capacity")).toContainText("Over: 4 agents");
    await expectAccessible(page);
  });

  test.describe("after a run in the lab", () => {
    test.use({ expectedLogs: /status of (503|429)/ });

    test("with its chart, its figures and its table", async ({ page }) => {
      await visit(page, "/break");
      await page.getByRole("button", { name: "Brownout", exact: true }).click();
      await page.getByRole("radio", { name: "Retry + circuit breaker", exact: true }).check();
      await page.getByRole("button", { name: "Send 20 requests" }).click();
      await expect(page.getByRole("status").first()).toHaveText(/^Done: /, { timeout: 20_000 });
      await page.getByText("Every request, as a table").click();
      await expectAccessible(page);
    });
  });

  test("with an incident under way in the drill, and with it closed", async ({ page }) => {
    await visit(page, "/oncall#oncall-ai");
    const drill = page.locator("#oncall-panel-ai");
    await drill.getByRole("button", { name: "Go on call" }).click();
    await drill.getByRole("button", { name: "Latency dashboard" }).click();
    await expectAccessible(page);
    await drill.getByRole("button", { name: "Skip reranking" }).click();
    await drill.getByRole("button", { name: "Get the reranker back on its GPU" }).click();
    await expect(drill).toContainText("YOUR POSTMORTEM");
    await expectAccessible(page);
  });

  test("with an answer and its trace open in Ask", async ({ page }) => {
    await visit(page, "/about");
    await page.getByRole("button", { name: "How did you cut the cloud bill?" }).click();
    await page.getByRole("button", { name: /^This answer's trace/ }).click();
    await expectAccessible(page);
  });

  test("with a tool called from the console for agents", async ({ page }) => {
    await visit(page, "/agents");
    await page.getByRole("button", { name: "Call ask" }).click();
    await expect(page.getByText(/^what the server answered/)).toBeVisible();
    await expectAccessible(page);
  });

  test("with something missing in the contact form", async ({ page }) => {
    await visit(page, "/#contact");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expectAccessible(page);
  });

  for (const { screen, use } of [
    { screen: "a laptop", use: {} },
    { screen: "a phone", use: PHONE },
  ]) {
    test.describe(`on ${screen}`, () => {
      test.use(use);

      test("with the search open", async ({ page }) => {
        await visit(page, "/");
        await page.getByRole("button", { name: "Jump anywhere" }).click();
        await expect(page.getByRole("option").first()).toBeVisible();
        await expectAccessible(page);
      });

      test("with the terminal open", async ({ page }) => {
        await visit(page, "/");
        await page.getByRole("button", { name: "Open the terminal", exact: true }).click();
        const terminal = new Terminal(page);
        await terminal.run("help");
        await terminal.run("nonsense");
        await terminal.run("slo");
        await expectAccessible(page);
      });

      test("with the tour running", async ({ page }) => {
        await visit(page, "/?tour");
        await expect(page.getByRole("dialog", { name: "A 60-second tour of this site" })).toBeVisible();
        await expectAccessible(page);
      });
    });
  }
});

test.describe("the tabs of the IoT platform are accessible", () => {
  const signal = (page: Page) => page.locator("#signal-panel");

  for (const { state, reach } of [
    {
      state: "with an incident on the SLO board",
      reach: async (page: Page) => {
        await page.clock.install();
        await visit(page, "/iot#platform-signals");
        await page.getByRole("button", { name: "Simulate an incident" }).click();
        const alert = page.getByRole("table", { name: "Alert rules on the error budget" }).getByText("Firing").first();
        // Five simulated minutes a tick, each drawn before the next.
        for (let tick = 0; tick < 48 && !(await alert.isVisible()); tick++) await page.clock.runFor(280);
        await expect(alert).toBeVisible();
      },
    },
    {
      state: "with a signal broken and its alert firing",
      reach: async (page: Page) => {
        await page.clock.install();
        await visit(page, "/iot#platform-signals");
        await page.getByRole("tab", { name: "Cause alerts" }).click();
        await signal(page).getByRole("button").first().click();
        await page.clock.runFor(10_000);
        await expect(signal(page).getByRole("status")).toContainText("Firing");
      },
    },
    {
      state: "with the objectives and what happens when their budget burns",
      reach: async (page: Page) => {
        await visit(page, "/iot#platform-signals");
        await expect(page.getByRole("heading", { name: "Error budget policy" })).toBeAttached();
      },
    },
    {
      state: "with how a problem is investigated",
      reach: async (page: Page) => {
        await visit(page, "/iot#platform-signals");
        await page.getByRole("tab", { name: "How I investigate" }).click();
      },
    },
  ]) {
    test(state, async ({ page }) => {
      await reach(page);
      await expectAccessible(page);
    });
  }

  test("with each move of the cost review, which draw their savings differently", async ({ page }) => {
    await visit(page, "/iot#platform-cost");
    const moves = page.getByRole("tablist", { name: "Cost moves" }).getByRole("tab");
    await expect(moves.first()).toBeVisible();
    for (const [i, move] of (await moves.all()).entries()) {
      await move.click();
      await expect(move).toHaveAttribute("aria-selected", "true");
      await expectAccessible(page, i === 0 ? undefined : "#cost-panel");
    }
  });
});
