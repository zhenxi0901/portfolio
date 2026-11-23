import type { Page } from "@playwright/test";
import { expectAccessible } from "../support/accessibility.ts";
import { PHONE } from "../support/screens.ts";
import { sidewaysScroll, visit } from "../support/site.ts";
import { Terminal } from "../support/terminal.ts";
import { expect, test } from "../support/test.ts";

// What became of each claim when it was last tested. The results are GitHub's record of a workflow run; here the test writes them.
const summary = (page: Page) => page.getByRole("region", { name: "Tested, not just written" });
const count = (page: Page) => summary(page).locator("[aria-live=polite]");
const claims = (page: Page) => page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3 }) });
const verdict = (page: Page, claim: string) => claims(page).filter({ hasText: claim });
const reading = (page: Page, name: string) => page.locator("#explore").getByRole("link", { name });

test("every claim that can be checked has a test, and says what it saw; the private ones have none", async ({ page, readings }) => {
  const { total } = readings.claims.recording;
  await visit(page, "/evidence");
  await expect(count(page)).toHaveText(`${total} of ${total} claims hold`);
  await expect(summary(page)).toContainText(/Tested \d+ min ago on commit \w{7}\./);
  await expect(claims(page).filter({ hasText: "Holds. Seen by the test of " })).toHaveCount(total);
  for (const claim of await claims(page).filter({ hasText: "Private" }).all()) await expect(claim).not.toContainText("Holds.");
});

test("the claim that is false on purpose is there, and failed", async ({ page, request }) => {
  const { false_claim } = await (await request.get("/evidence.json")).json();
  await visit(page, "/evidence");
  await expect(summary(page)).toContainText("And one that is false on purpose");
  await expect(summary(page)).toContainText(false_claim.claim);
  await expect(summary(page)).toContainText("Failed, as it has to.");
});

test("a claim that stopped holding says so, with what its test saw", async ({ page, readings }) => {
  const { total, claims: all } = readings.claims.recording;
  readings.claims.change({
    holding: total - 1,
    failing: 1,
    claims: all.map((c) => (c.id === "deploys" ? { ...c, verdict: "fails", saw: "GitHub's record has 3 deploys; the site says 45." } : c)),
  });
  await visit(page, "/evidence");
  await expect(count(page)).toHaveText(`${total - 1} of ${total} claims hold`);
  await expect(summary(page)).toContainText("One does not, and the claim says what its test saw.");
  await expect(claims(page).filter({ hasText: "Does not hold." })).toHaveCount(1);
  await expect(verdict(page, "Does not hold.")).toContainText("GitHub's record has 3 deploys; the site says 45.");

  await visit(page, "/#explore");
  await expect(reading(page, "Claims that hold")).toHaveAccessibleName(new RegExp(`^Claims that hold ${total - 1} of ${total} `));
});

test("one whose record did not answer is not counted either way", async ({ page, readings }) => {
  const { total, claims: all } = readings.claims.recording;
  readings.claims.change({
    holding: total - 1,
    unknown: 1,
    claims: all.map((c) => (c.id === "iccv" ? { ...c, verdict: "unknown", saw: "Could not be checked: openaccess.thecvf.com did not answer." } : c)),
  });
  await visit(page, "/evidence");
  await expect(summary(page)).toContainText("One could not be checked, because the record it is checked against did not answer.");
  await expect(verdict(page, "Could not be checked.")).toContainText("openaccess.thecvf.com did not answer.");
});

test("if the false claim ever passes, nothing else is to be trusted, here or on the home page", async ({ page, readings }) => {
  const { false_claim } = readings.claims.recording;
  readings.claims.change({ trustworthy: false, false_claim: { ...false_claim!, verdict: "holds" } });
  await visit(page, "/evidence");
  await expect(count(page)).toHaveText("Not to be trusted");
  await expect(summary(page)).toContainText("It passed. Stop trusting the rest.");
  await visit(page, "/#explore");
  await expect(reading(page, "Claims that hold")).toContainText("not to be trusted");
});

test("without results the page says why, and counts only what it claims", async ({ page, readings }) => {
  const { total } = readings.claims.recording;
  readings.claims.change({ available: false, reason: "The claims are tested on the live site only.", claims: [], holding: 0 });
  await visit(page, "/evidence");
  await expect(count(page)).toHaveText(`${total} claims`);
  await expect(summary(page)).toContainText("The claims are tested on the live site only.");
  await expect(page.getByText("Holds.")).toHaveCount(0);
});

test("when GitHub is not answering, the last results say that a newer run may exist", async ({ page, readings }) => {
  readings.claims.change({ stale: true });
  await visit(page, "/evidence");
  await expect(summary(page)).toContainText("GitHub is not answering, so a newer run may exist");
});

test("the terminal lists them, the false one among them", async ({ page, readings }) => {
  const { total, claims: all } = readings.claims.recording;
  await visit(page, "/");
  const terminal = new Terminal(page);
  await terminal.open();
  const printed = await terminal.run("claims");
  await expect(printed).toContainText(`${total} of ${total} hold`);
  for (const { id } of all) await expect(printed).toContainText(new RegExp(`holds +${id} +Seen by the test of ${id}\\.`));
  await expect(printed).toContainText("as it has to: it is false on purpose.");
});

for (const { screen, use } of [
  { screen: "a desktop", use: {} },
  { screen: "a phone", use: PHONE },
]) {
  test.describe(`on ${screen}`, () => {
    test.use(use);

    test("the page with its results is accessible and no wider than the screen", async ({ page, readings }) => {
      const { total, claims: all } = readings.claims.recording;
      readings.claims.change({ holding: total - 1, failing: 1, claims: all.map((c, i) => (i === 0 ? { ...c, verdict: "fails" } : c)) });
      await visit(page, "/evidence");
      await expect(count(page)).toHaveText(`${total - 1} of ${total} claims hold`);
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
      await expectAccessible(page);
    });
  });
}
