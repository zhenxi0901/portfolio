import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { HOOK_URL } from "../support/env.ts";
import { NO_INBOX, received } from "../support/inbox.ts";
import { visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

const form = (page: Page) => page.locator("#contact");
const name = (page: Page) => form(page).getByRole("textbox", { name: "Name" });
const email = (page: Page) => form(page).getByRole("textbox", { name: "Email" });
const message = (page: Page) => form(page).getByRole("textbox", { name: "Message" });
const send = (page: Page) => form(page).getByRole("button", { name: "Send message" }).click();
// For bots, which fill in every field. Found by its label rather than its name, which is what decides whether a browser fills it in.
const hidden = (page: Page) => form(page).locator("label", { hasText: "Leave this empty" }).locator("input");

/** Fills in the form. What is written carries a reference of its own, by which it is found among what arrived. */
async function write(page: Page, from: { name: string; email: string }) {
  const reference = `Reference ${randomUUID()}`;
  await name(page).fill(from.name);
  await email(page).fill(from.email);
  await message(page).fill(`A role on the platform team. ${reference}`);
  return reference;
}

const arrived = async (reference: string) => (await received()).filter((text) => text.includes(reference));

/** Has Chrome fill in the form from a saved address with a company in it, as it offers to when someone types a name. */
async function autofill(page: Page) {
  const address = {
    fields: [
      { name: "NAME_FULL", value: "Test Visitor" },
      { name: "EMAIL_ADDRESS", value: "test.visitor@example.com" },
      { name: "COMPANY_NAME", value: "Example Pte Ltd" },
      { name: "ADDRESS_HOME_LINE1", value: "1 Example Road" },
      { name: "ADDRESS_HOME_CITY", value: "Singapore" },
      { name: "ADDRESS_HOME_ZIP", value: "018989" },
      { name: "ADDRESS_HOME_COUNTRY", value: "SG" },
    ],
  };
  const chrome = await page.context().newCDPSession(page);
  await chrome.send("Autofill.enable");
  await chrome.send("Autofill.setAddresses", { addresses: [address] });
  const { root } = await chrome.send("DOM.getDocument", { depth: -1 });
  for (const selector of ["#name", "#email"]) {
    await page.focus(selector);
    const { nodeId } = await chrome.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    const { node } = await chrome.send("DOM.describeNode", { nodeId });
    await chrome.send("Autofill.trigger", { fieldId: node.backendNodeId, address });
    await expect(page.locator(selector)).not.toHaveValue("");
  }
}

test("Chrome's autofill fills in the name and the email, and leaves the hidden field alone", async ({ page }) => {
  await visit(page, "/#contact");
  await autofill(page);
  await expect(name(page)).toHaveValue("Test Visitor");
  await expect(email(page)).toHaveValue("test.visitor@example.com");
  await expect(hidden(page)).toHaveValue("");
});

test("nobody sees the hidden field or reaches it with the keyboard", async ({ page }) => {
  await visit(page, "/#contact");
  await expect(hidden(page)).not.toBeInViewport();
  await name(page).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(hidden(page)).not.toBeFocused();
});

test("what is missing is said beside its field, and nothing is sent", async ({ page }) => {
  let sent = 0;
  await page.route("**/api/contact", (route) => {
    sent++;
    return route.abort();
  });
  await visit(page, "/#contact");
  await email(page).fill("not an address");
  await message(page).fill("Too short");
  await send(page);
  await expect(form(page).getByRole("alert")).toHaveText(["Tell me who you are.", "That email doesn't look right.", "A little more detail, please (10 characters or more)."]);
  await expect(name(page)).toHaveAttribute("aria-invalid", "true");
  expect(sent).toBe(0);
});

test.describe("when a message cannot be sent", () => {
  test.use({ expectedLogs: /status of (429|502)/ });

  for (const { status, title, description } of [
    { status: 502, title: "Couldn't send right now", description: /^Email me directly at/ },
    { status: 429, title: "Too many messages", description: /^Please wait a few minutes, or email me directly at/ },
  ]) {
    test(`a ${status} says so, says what to do instead, and keeps what was written`, async ({ page }) => {
      await page.route("**/api/contact", (route) => route.fulfill({ status, json: { error: "No." } }));
      await visit(page, "/#contact");
      const reference = await write(page, { name: "Test Visitor", email: "test.visitor@example.com" });
      await send(page);
      await expect(page.getByText(title)).toBeVisible();
      await expect(page.getByText(description)).toBeVisible();
      await expect(message(page)).toHaveValue(new RegExp(reference));
    });
  }
});

test.describe("what arrives", () => {
  test.skip(!HOOK_URL, NO_INBOX);

  test("a message filled in by the browser is delivered, unmarked, and the form is cleared", async ({ page }) => {
    await visit(page, "/#contact");
    await autofill(page);
    const reference = `Reference ${randomUUID()}`;
    await message(page).fill(`We have a role for you. ${reference}`);
    await send(page);
    await expect(page.getByText("Message sent", { exact: true })).toBeVisible();
    for (const field of [name(page), email(page), message(page)]) await expect(field).toHaveValue("");
    const [text, ...more] = await arrived(reference);
    expect(text).toMatch(/^New message from Test Visitor \(test\.visitor@example\.com\):\n/);
    expect(more).toEqual([]);
  });

  test("a message with the hidden field filled in is delivered, marked", async ({ page }) => {
    await visit(page, "/#contact");
    const reference = await write(page, { name: "Filled In", email: "filled.in@example.com" });
    await hidden(page).evaluate((field: HTMLInputElement) => (field.value = "Example Pte Ltd"));
    await send(page);
    // Told that it was sent, because it was.
    await expect(page.getByText("Message sent", { exact: true })).toBeVisible();
    const [text, ...more] = await arrived(reference);
    expect(text).toMatch(/^Possible spam .*\nMessage from Filled In \(filled\.in@example\.com\):\n/);
    expect(more).toEqual([]);
  });

  test("what is written arrives as it was typed, and cannot pass for markup", async ({ page }) => {
    await visit(page, "/#contact");
    const reference = await write(page, { name: "<!channel>", email: "markup@example.com" });
    await send(page);
    await expect(page.getByText("Message sent", { exact: true })).toBeVisible();
    const [text] = await arrived(reference);
    expect(text).toContain("New message from &lt;!channel&gt; (markup@example.com)");
  });
});
