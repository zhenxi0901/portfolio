import type { Page } from "@playwright/test";
import { DESKTOP, PHONE } from "../support/screens.ts";
import { visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

// The console on the page for AI agents: a small MCP client that sends real requests.
const tools = (page: Page) => page.getByRole("tablist", { name: "Tools" }).getByRole("tab");
const panel = (page: Page) => page.locator("#tool-panel");
const answer = (page: Page) => panel(page).getByText(/^what the server answered · HTTP \d+ · \d+ ms$/);

/** Picks a tool and calls it with what its form holds. */
async function call(page: Page, tool: string) {
  await panel(page).getByRole("button", { name: `Call ${tool}` }).click();
  await expect(answer(page)).toBeVisible();
}

for (const { screen, use } of [
  { screen: "a desktop", use: { ...DESKTOP, colorScheme: "dark" as const } },
  { screen: "a phone", use: PHONE },
]) {
  test.describe(`on ${screen}`, () => {
    test.use(use);

    test("the tools are listed as the server has just described them", async ({ page }) => {
      await visit(page, "/agents");
      await expect(page.getByText("5 tools · names, descriptions and inputs read from tools/list just now")).toBeVisible();
      await expect(tools(page)).toHaveText([/^ask/, /^search_facts/, /^list_topics/, /^get_status/, /^get_delivery/]);
    });

    test("a tool is called with a real request, shown with the answer it got", async ({ page }) => {
      await visit(page, "/agents");
      await call(page, "ask");
      await expect(answer(page)).toContainText("HTTP 200");
      await expect(panel(page)).toContainText("15%");
      const sent = panel(page).locator("pre").first();
      await expect(sent).toContainText("POST /mcp");
      await expect(sent).toContainText("MCP-Protocol-Version: 2026-07-28");
      await expect(sent).toContainText("Mcp-Name: ask");
    });

    test("a tool's form is built from the inputs the server says it takes", async ({ page }) => {
      await visit(page, "/agents");
      await tools(page).filter({ hasText: "search_facts" }).click();
      const limit = panel(page).getByRole("spinbutton", { name: /^limit · optional/ });
      await expect(panel(page).getByRole("textbox", { name: /^query/ })).toBeVisible();
      await expect(limit).toHaveAttribute("max", "5");
      await limit.fill("2");
      await call(page, "search_facts");
      await expect(panel(page)).toContainText("## ");
    });

    test("a tool with no inputs says so, and is called all the same", async ({ page }) => {
      await visit(page, "/agents");
      await tools(page).filter({ hasText: "get_delivery" }).click();
      await expect(panel(page)).toContainText("this tool takes no arguments");
      await call(page, "get_delivery");
      await expect(panel(page)).toContainText(/\d+ deploys? in the 30 days to/);
    });

    test("the terminal card is the text a real curl gets, the running commit included", async ({ page, request }) => {
      const card = await (await request.get("/api/card.txt")).text();
      await visit(page, "/agents");
      const figure = page.getByRole("figure").filter({ hasText: "the same text curl gets" });
      await expect(figure).toBeVisible();
      // The card without its colour codes, line by line.
      const lines = card.replace(/\u001b\[[\d;]*m/g, "").split("\n").map((line) => line.trim());
      const running = lines.find((line) => line.startsWith("running"))!;
      expect(running).toMatch(/commit \w+/);
      await expect(figure.locator("pre")).toContainText(running);
    });

    test("the ways to connect are a command, a file and a plain request", async ({ page }) => {
      await visit(page, "/agents");
      const ways = page.getByRole("tablist", { name: "Ways to connect" });
      const code = page.locator("#connect-panel pre");
      await expect(code).toContainText("mcp add --transport http");
      await ways.getByRole("tab", { name: "JSON config" }).click();
      await expect(code).toContainText('"mcpServers"');
      await ways.getByRole("tab", { name: "curl" }).click();
      await expect(code).toContainText("-H 'Mcp-Method: tools/list' \\");
    });
  });
}

test.describe("when the server turns this browser away", () => {
  test.use({ expectedLogs: /status of 429/ });

  test("the list of tools says so, and shows the names the page was built with", async ({ page }) => {
    await page.route("**/mcp", (route) =>
      route.fulfill({ status: 429, json: { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Too many requests" } } }),
    );
    await visit(page, "/agents");
    await expect(page.getByText("the server is rate limiting this browser · showing the names this page was built with")).toBeVisible();
    await expect(tools(page)).toContainText(["ask", "search_facts"]);
  });

  test("a call that gets plain text back shows the text, not an empty answer", async ({ page }) => {
    await visit(page, "/agents");
    await expect(page.getByText("read from tools/list just now")).toBeVisible();
    await page.route("**/mcp", (route) => route.fulfill({ status: 429, contentType: "text/plain", body: "Rate exceeded." }));
    await call(page, "ask");
    await expect(panel(page)).toContainText("Rate exceeded.");
    await expect(panel(page)).not.toContainText("An empty answer.");
  });
});

for (const { from, find } of [
  { from: "the status page", find: async (page: Page) => (await visit(page, "/status"), page.getByRole("main").getByRole("link", { name: /^For agents/ })) },
  { from: "the footer", find: async (page: Page) => (await visit(page, "/"), page.getByRole("contentinfo").getByRole("link", { name: "For agents" })) },
]) {
  test(`${from} leads to it`, async ({ page }) => {
    await expect(await find(page)).toHaveAttribute("href", "/agents");
  });
}

test("the decision behind the server's design is on the decisions page", async ({ page }) => {
  await visit(page, "/agents");
  await page.getByRole("link", { name: /^ADR \d+: why it has no sessions and no model/ }).click();
  await expect(page).toHaveURL("/decisions#mcp-without-sessions-or-a-model");
  await expect(page.locator("#mcp-without-sessions-or-a-model")).toBeInViewport();
});
