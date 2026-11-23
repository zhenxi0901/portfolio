import type { Page } from "@playwright/test";
import { visit } from "../support/site.ts";
import { Terminal } from "../support/terminal.ts";
import { expect, test } from "../support/test.ts";

const dialog = (page: Page) => page.getByRole("dialog", { name: "Jump anywhere" });
const search = (page: Page) => dialog(page).getByRole("combobox");
const results = (page: Page) => dialog(page).getByRole("option");

/** Opens the palette with its key and types into it. */
async function find(page: Page, words: string) {
  await page.keyboard.press("/");
  await expect(search(page)).toBeFocused();
  await search(page).fill(words);
}

test.describe("what is typed finds what is meant", () => {
  for (const [words, first] of [
    ["terminal", "Open the terminal"],
    ["agents", "For agents: this site as an MCP server"],
    ["changelog", "Changelog"],
    ["gke", "One VM to a GKE platform"],
    ["kafka", "Finding a metrics bill in 914 orphaned Kafka topics"],
    ["on call", "Go on call: stale telemetry on the IoT platform"],
    ["slow answers", "Go on call: slow answers on the AI agent platform"],
    ["research", "Research"],
    ["cost", "Cost review"],
    ["site cost", "What this site costs"],
    ["copy email", "Copy email address"],
    ["postmortems", "Postmortems"],
    ["evidence", "Evidence: where the claims come from"],
    ["status", "Status page"],
    ["slo", "SLOs and monitoring"],
    ["dark", "Toggle dark mode"],
    ["remote control", "Remote control that fails safe"],
    ["writing", "Writing"],
    ["ai agent", "AI agent platform"],
    ["tour", "Take the 60-second tour"],
    ["map", "Home"],
    ["circuit breaker", "Break it yourself"],
    ["size a gpu", "Size a GPU for agents"],
  ] as const) {
    test(`"${words}" finds ${first} first`, async ({ page }) => {
      await visit(page, "/about");
      await find(page, words);
      await expect(results(page).first()).toHaveText(new RegExp(`^${first}`));
      await expect(results(page).first()).toHaveAttribute("aria-selected", "true");
      await expect(dialog(page).getByRole("option", { selected: true })).toHaveCount(1);
    });
  }

  for (const [words, all] of [
    ["map", ["Home", "AI agent platform"]],
    ["slo", ["SLOs and monitoring", "Status page"]],
    ["cost", ["Cost review", "What this site costs"]],
  ] as const) {
    test(`"${words}" finds ${all.join(" and ")}`, async ({ page }) => {
      await visit(page, "/about");
      await find(page, words);
      for (const name of all) await expect(dialog(page).getByRole("option", { name })).toBeVisible();
    });
  }

  test('"iot" finds every case study of that platform, and every result says where it lives', async ({ page }) => {
    await visit(page, "/iot");
    const studies = await page.locator("#work").getByRole("article").count();
    await find(page, "iot");
    await expect(results(page).filter({ hasText: /Case studies$/ })).toHaveCount(studies);
    for (const result of await results(page).all()) {
      await expect(result).toHaveText(/(Sections|Case studies|Writing|Postmortems|How this site runs|Actions)$/);
    }
  });

  test("words that match nothing find nothing", async ({ page }) => {
    await visit(page, "/");
    await find(page, "xyzzy");
    await expect(results(page)).toHaveCount(0);
    await expect(dialog(page)).toContainText("Nothing matches that.");
  });
});

test.describe("with nothing typed", () => {
  test("everything is listed in its group, the sections in the order of the pages", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Jump anywhere" }).click();
    await expect(dialog(page).locator("[cmdk-group-heading]")).toHaveText(["Sections", "Case studies", "Writing", "Postmortems", "How this site runs", "Actions"]);
    const sections = dialog(page).getByRole("group", { name: "Sections" }).getByRole("option");
    await expect(sections).toContainText(["Inside the IoT platform", "AI agent platform", "Research", "Writing", "Postmortems", "About"]);
  });

  // A shared id left rows behind that no longer matched, and more than one row selected.
  test("every entry has an id of its own", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Jump anywhere" }).click();
    await expect(results(page).first()).toBeVisible();
    const ids = await results(page).evaluateAll((all) => all.map((entry) => entry.getAttribute("data-value")));
    expect(ids.length).toBeGreaterThan(20);
    expect(ids.filter((id, i) => !id || ids.indexOf(id) !== i)).toEqual([]);
  });

  test("the search is empty again after it was closed", async ({ page }) => {
    await visit(page, "/");
    await find(page, "kafka");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await page.keyboard.press("Control+k");
    await expect(search(page)).toHaveValue("");
  });

  test("the search box shows its caret, with no ring cut off by its edges", async ({ page }) => {
    await visit(page, "/");
    await page.keyboard.press("/");
    await expect(search(page)).toBeFocused();
    await expect(search(page)).toHaveCSS("outline-style", "none");
  });
});

test.describe("Enter", () => {
  for (const { words, path, landed } of [
    { words: "evidence", path: "/evidence" },
    { words: "site cost", path: "/cost" },
    { words: "experience", path: "/about#experience", landed: (page: Page) => expect(page.locator("#experience")).toBeInViewport() },
    { words: "size a gpu", path: "/research#capacity", landed: (page: Page) => expect(page.locator("#capacity")).toBeInViewport() },
    {
      words: "slow answers",
      path: "/oncall#oncall-ai",
      landed: (page: Page) => expect(page.getByRole("tab", { name: /AI agent platform/ })).toHaveAttribute("aria-selected", "true"),
    },
  ] as const) {
    test(`on "${words}" opens ${path}`, async ({ page }) => {
      await visit(page, "/");
      await find(page, words);
      await expect(results(page).first()).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(path);
      if (landed) await landed(page);
    });
  }

  test('on "terminal" opens the terminal', async ({ page }) => {
    await visit(page, "/about");
    await find(page, "terminal");
    await page.keyboard.press("Enter");
    await expect(new Terminal(page).input).toBeFocused();
  });

  test('on "dark" switches the theme', async ({ page }) => {
    await visit(page, "/about");
    await find(page, "dark");
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  });
});
