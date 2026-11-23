import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { HOOK_URL } from "../support/env.ts";
import { NO_INBOX, received } from "../support/inbox.ts";
import { sitemapPaths } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

// A browser with scripts off, or one whose script has not arrived.
test.use({ javaScriptEnabled: false });

for (const path of await sitemapPaths()) {
  test(`${path} can be read`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
    expect((await page.getByRole("main").innerText()).length).toBeGreaterThan(400);
  });
}

test("the home page has its chapters, its list of recent work and its latest writing", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#chapters").getByRole("link")).toHaveCount(3);
  await expect(page.getByRole("list", { name: "Recently" }).getByRole("listitem")).toHaveCount(5);
  await expect(page.locator("#latest").getByRole("listitem").first()).toBeVisible();
  await expect(page.locator("#top figcaption")).toContainText("Your request to this page, drawn as it happens.");
});

test("a role folded away opens, and all of them are in the page", async ({ page }) => {
  await page.goto("/about");
  const roles = page.locator("#experience ol > li");
  for (const role of await roles.all()) await expect(role.locator("summary + div")).toContainText(/\w{3}/);
  const second = roles.nth(1);
  await expect(second.locator("summary + div")).toBeHidden();
  await second.locator("summary").click();
  await expect(second.locator("summary + div")).toBeVisible();
});

test("the replay of the latest deploy is the finished run, and what its steps do can be read", async ({ page }) => {
  await page.goto("/status");
  const replay = page.locator("#replay");
  const widths = await replay.getByRole("list").locator("span[style*='width'] span[style*='width']").evaluateAll((bars) => bars.map((bar) => (bar as HTMLElement).style.width));
  expect(widths.length).toBeGreaterThan(5);
  expect(new Set(widths)).toEqual(new Set(["100%"]));
  await replay.getByText("What each step does").click();
  await expect(replay.getByRole("term").first()).toBeVisible();
});

for (const [path, says, api] of [
  ["/status", "These readings are taken by a script, and scripts are off in this browser.", "/api/status"],
  ["/cost", "Scripts are off in this browser, so nothing is being read.", "/api/cost"],
] as const) {
  test(`${path} says why it has no readings, and links to them as JSON`, async ({ page }) => {
    await page.goto(path);
    const note = page.locator("noscript p", { hasText: says });
    await expect(note).toBeVisible();
    await expect(note.getByRole("link", { name: api })).toHaveAttribute("href", api);
  });
}

test("the page for agents lists its tools", async ({ page }) => {
  await page.goto("/agents");
  await expect(page.locator("noscript li", { hasText: "search_facts" })).toBeVisible();
});

test.describe("the contact form", () => {
  const form = (page: Page) => page.locator("#contact");

  async function send(page: Page, message: string) {
    await page.goto("/");
    await form(page).getByRole("textbox", { name: "Name" }).fill("No Script");
    await form(page).getByRole("textbox", { name: "Email" }).fill("no.script@example.com");
    await form(page).getByRole("textbox", { name: "Message" }).fill(message);
    await form(page).getByRole("button", { name: "Send message" }).click();
  }

  test("is sent by the browser itself, and answered with a page that has nothing of the message in its address", async ({ page }) => {
    await send(page, "Sent without any script at all.");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Message sent");
    await expect(page).toHaveURL("/api/contact");
    await page.getByRole("link", { name: "Back to the site" }).click();
    await expect(page).toHaveURL("/");
  });

  test.describe("with something wrong in it", () => {
    test.use({ expectedLogs: /status of 400/ });

    test("is answered with what is wrong and how to go back to it", async ({ page }) => {
      await send(page, "Too short");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Not sent");
      await expect(page.getByRole("main")).toContainText("Messages need to be between 10 and 4,000 characters. Go back in your browser to try again");
    });
  });

  test.describe("what arrives", () => {
    test.skip(!HOOK_URL, NO_INBOX);

    test("is the message, unmarked", async ({ page }) => {
      const reference = `Reference ${randomUUID()}`;
      await send(page, `Sent without any script at all. ${reference}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Message sent");
      const arrived = (await received()).filter((text) => text.includes(reference));
      expect(arrived).toEqual([expect.stringMatching(/^New message from No Script \(no\.script@example\.com\):\n/)]);
    });
  });
});
