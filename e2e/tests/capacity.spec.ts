import type { Page } from "@playwright/test";
import { BASE_URL } from "../support/env.ts";
import { visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

/** Opens the lab on /research that sizes a GPU for long-running agents. */
async function openLab(page: Page, path = "/research#capacity") {
  await visit(page, path);
  const root = page.locator("#capacity");
  const slider = (name: string) => root.getByRole("slider", { name });
  return {
    root,
    slider,
    verdict: root.locator("p[aria-live]"),
    model: root.getByLabel("Model", { exact: true }),
    gpu: root.getByLabel("GPU", { exact: true }),
    weights: (name: "BF16, 2 bytes" | "FP8, 1 byte") => root.getByRole("radio", { name }),
    share: root.getByRole("button", { name: "Copy a link to this setup" }),
    reset: root.getByRole("button", { name: "Back to my setup" }),
    /** One of the numbers under the bars, with the line that explains it. */
    figure: (label: string) => root.locator("dl > div", { hasText: label }),
    /** Moves a slider to one of its ends, as the keyboard does. */
    toEnd: async (name: string, end: "Home" | "End") => {
      await slider(name).focus();
      await page.keyboard.press(end);
    },
  };
}

test("starts from the final-year project's setup and its numbers", async ({ page }) => {
  const lab = await openLab(page);
  await expect(lab.verdict).toHaveText(/^Fits: the cache holds 19 agents' full histories, and 4 are running\./);
  await expect(lab.figure("decoding, each agent")).toContainText("91 tok/s");
  await expect(lab.figure("GPU busy").getByRole("definition")).toHaveText("34%");
  await expect(lab.figure("GPU busy")).toContainText("21% with one agent");
  await expect(lab.figure("cache miss")).toContainText("17× the same turn hitting");
  await expect(lab.reset).toHaveAttribute("aria-disabled", "true");
});

test("weights that do not fit are said not to fit, and nothing is timed or priced", async ({ page }) => {
  const lab = await openLab(page);
  await lab.model.selectOption({ label: "Llama 3.1 70B" });
  await expect(lab.verdict).toContainText(/weights alone \(132 GiB\) don't fit in the 71 GiB/);
  await lab.weights("FP8, 1 byte").check();
  await lab.gpu.selectOption({ label: "L4" });
  await expect(lab.root).toContainText("Nothing to time or price until the weights fit");
  await expect(lab.figure("per task")).toHaveCount(0);
});

test("weights that fit with no room for one agent's history say that", async ({ page }) => {
  const lab = await openLab(page);
  await lab.model.selectOption({ label: "Llama 3.1 70B" });
  await lab.weights("FP8, 1 byte").check();
  await expect(lab.verdict).toHaveText(/^Not even one agent's full history fits/);
});

test("more agents than the cache holds are over", async ({ page }) => {
  const lab = await openLab(page);
  await lab.gpu.selectOption({ label: "L4" });
  await expect(lab.verdict).toHaveText(/^Over: 4 agents' full histories need/);
});

test("a history longer than the model's window names the turn it outgrows it", async ({ page }) => {
  const lab = await openLab(page);
  await lab.toEnd("Turns per task", "End");
  await expect(lab.verdict).toContainText(/outgrows Qwen3-4B's 40,960-token window at turn \d+/);
});

test("agents that never leave the model are GPU-bound, and the lab says so", async ({ page }) => {
  const lab = await openLab(page);
  await lab.toEnd("Turns per task", "Home");
  await lab.toEnd("Seconds outside the model, per turn", "Home");
  await expect(lab.root).toContainText("GPU-bound");
  await expect(lab.figure("GPU busy").getByRole("definition")).toHaveText("100%");
});

test("going back to the starting setup undoes every change", async ({ page }) => {
  const lab = await openLab(page);
  await lab.gpu.selectOption({ label: "L4" });
  await lab.toEnd("Turns per task", "End");
  await lab.reset.click();
  await expect(lab.verdict).toHaveText(/^Fits: the cache holds 19 agents/);
  await expect(lab.slider("Turns per task")).toHaveAttribute("aria-valuetext", "40");
  await expect(lab.reset).toHaveAttribute("aria-disabled", "true");
});

test("a link opens the lab with its setup, and the lab copies a link to it", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(BASE_URL).origin });
  const setup = "/research?model=qwen3-8b&gpu=h100&hit=0.5&agents=8#capacity";
  const lab = await openLab(page, setup);
  await expect(lab.model).toHaveValue("qwen3-8b");
  await expect(lab.gpu).toHaveValue("h100");
  await expect(lab.slider("Agents at once")).toHaveAttribute("aria-valuetext", "8");
  await expect(lab.slider("Prefix-cache hit rate")).toHaveAttribute("aria-valuetext", "50%");
  await lab.share.click();
  await expect(lab.root.getByRole("status")).toHaveText(/^Copied/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL(setup, BASE_URL).href);
});

test("a link with nonsense in it is checked rather than trusted, and going back clears it", async ({ page }) => {
  const lab = await openLab(page, "/research?model=nope&agents=999&tokens=abc#capacity");
  await expect(lab.slider("Agents at once")).toHaveAttribute("aria-valuetext", "32");
  await expect(lab.model).toHaveValue("qwen3-4b");
  await expect(lab.slider("Tokens each turn adds")).toHaveAttribute("aria-valuetext", "450");
  await lab.reset.click();
  await expect(lab.slider("Agents at once")).toHaveAttribute("aria-valuetext", "4");
  await expect(page).toHaveURL("/research#capacity");
});
