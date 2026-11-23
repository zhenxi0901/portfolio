import { PHONE } from "../support/screens.ts";
import { visit } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

test("every figure says which runs it comes from", async ({ page }) => {
  await visit(page, "/research");
  const main = page.getByRole("main");
  await expect(main).toContainText("Across the 320 runs, MCP tool calls take only 2.7% of the agent phase");
  // A second set of runs has a higher share, and the chart says why rather than leaving the two to contradict each other.
  await expect(main).toContainText(/48 later runs with the agent's own spans switched on, half of them on tasks whose MCP servers reach the internet/);
  await expect(main).toContainText("in the runs that measured it, 96% of input tokens");
});

test("the diagram is a small image on the page, and opens at full size", async ({ page }) => {
  await visit(page, "/research");
  const shown = (image: HTMLImageElement) => ({ file: image.currentSrc.replace(location.origin, ""), width: image.naturalWidth });
  const diagram = page.getByRole("img", { name: /^Architecture of the Toolathlon adapter/ });
  await diagram.scrollIntoViewIfNeeded();
  await expect.poll(() => diagram.evaluate(shown)).toEqual({ file: "/img/aries-architecture.webp", width: 1400 });
  await page.getByRole("button", { name: "Enlarge: How a run is wired, from my report" }).click();
  const enlarged = page.getByRole("dialog", { name: "How a run is wired, from my report" }).getByRole("img", { name: /^Architecture/ });
  await expect.poll(() => enlarged.evaluate(shown)).toEqual({ file: "/img/aries-architecture-full.webp", width: 2244 });
});

test.describe("on a phone", () => {
  test.use(PHONE);

  test("the labels of the runs-per-hour chart can be read", async ({ page }) => {
    await visit(page, "/research");
    const heights = await page
      .getByLabel(/^Runs per hour/)
      .locator("text")
      .evaluateAll((labels) => labels.map((label) => label.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThan(5);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(8);
  });
});
