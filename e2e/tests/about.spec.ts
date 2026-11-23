import type { Page } from "@playwright/test";
import { DESKTOP, PHONE } from "../support/screens.ts";
import { visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

const roles = (page: Page) => page.locator("#experience ol > li");

for (const { screen, use } of [
  { screen: "a desktop", use: { ...DESKTOP, reducedMotion: "no-preference" as const } },
  { screen: "a phone", use: PHONE },
]) {
  test.describe(`the roles on ${screen}`, () => {
    test.use(use);

    test("the current one is open, split by product, and each part is about that product", async ({ page }) => {
      await visit(page, "/about");
      const role = roles(page).first();
      await expect(role.locator("details")).toHaveAttribute("open", "");
      await expect(role.getByRole("group", { name: /./ })).toHaveCount(3);
      const iot = role.getByRole("group", { name: "Building IoT platform" });
      const ai = role.getByRole("group", { name: "AI agent platform" });
      await expect(iot.getByRole("list").first()).toContainText("Modbus");
      await expect(iot.getByRole("list").first()).toContainText("pipeline");
      await expect(ai.getByRole("list").first()).toContainText("Cloud Run");
      await expect(ai.getByRole("list").first()).not.toContainText("Modbus");
      await expect(role.getByRole("group", { name: "Outside both platforms" })).toBeVisible();
    });

    test("a closed role names its products in its header, and an open one leaves that to its parts", async ({ page }) => {
      await visit(page, "/about");
      const role = roles(page).first();
      const header = role.locator("summary");
      await expect(header.getByText("Building IoT platform")).toBeHidden();
      await header.click();
      await expect(role.locator("details")).not.toHaveAttribute("open", "");
      await expect(header.getByText("Building IoT platform")).toBeVisible();
      await expect(header.getByText("AI agent platform")).toBeVisible();
    });

    test("the IoT part leads to its case studies", async ({ page }) => {
      await visit(page, "/about");
      await page.locator("#experience").getByRole("button", { name: /^Its \d+ case studies/ }).click();
      await expect(page).toHaveURL("/iot#work-iot");
      await expect(page.locator("#work-iot")).toBeInViewport();
    });

    test("the AI part leads to its one case study", async ({ page }) => {
      await visit(page, "/about");
      await page.locator("#experience").getByRole("button", { name: "Its case study" }).click();
      await expect(page).toHaveURL("/ai#case-ai-platform");
      await expect(page.locator("#case-ai-platform")).toBeInViewport();
    });

    test("another role opens with a press, and the research one leads to the research", async ({ page }) => {
      await visit(page, "/about");
      const role = roles(page).nth(1);
      await expect(role.getByRole("button", { name: "The research" })).toBeHidden();
      await role.locator("summary").click();
      await role.getByRole("button", { name: "The research" }).click();
      await expect(page).toHaveURL("/research#research");
    });
  });
}

test.describe("Ask", () => {
  const ask = (page: Page) => page.locator("#ask");

  test("suggests questions, one of them about running agents on a supercomputer", async ({ page }) => {
    await visit(page, "/about");
    await expect(ask(page).getByRole("button", { name: "How did you run agents on a supercomputer?" })).toBeVisible();
  });

  test("answers from the site's own facts, with its sources and the trace of how it was found", async ({ page }) => {
    await visit(page, "/about");
    await ask(page).getByRole("button", { name: "How did you cut the cloud bill?" }).click();
    await expect(ask(page)).toContainText("15%");
    await expect(ask(page).getByText("Sources", { exact: true })).toBeVisible();
    await ask(page).getByRole("button", { name: /^This answer's trace: \d+ spans, [<\d.]+ ms in the server/ }).click();
    await expect(ask(page).getByRole("list", { name: "Spans, in start order" })).toContainText("ask.parse");
  });

  test("says where a visitor's own assistant can ask instead", async ({ page }) => {
    await visit(page, "/about");
    await expect(ask(page).getByRole("link", { name: /point .* at it/ })).toHaveAttribute("href", "/agents");
  });
});
