import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// WCAG 2.2 at AA with every version and level before it, and the practices axe recommends beyond it.
const RULES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function broken(page: Page, within: string) {
  const { violations } = await new AxeBuilder({ page }).include(within).withTags(RULES).analyze();
  return violations.map(({ id, help, nodes }) => ({ id, help, where: nodes.map(({ target, failureSummary }) => `${target.join(" ")}: ${failureSummary}`) }));
}

/** The page as it stands, or the part of it that has changed, breaks none of the rules axe can check, in either theme. */
export async function expectAccessible(page: Page, within = "html") {
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator(`html.${theme}`)).toBeAttached();
    // Asked again for a moment if something is found: what is still fading in is not yet what anyone reads. The wait is for a runner
    // on which one answer takes seconds.
    await expect.poll(() => broken(page, within), { message: `rules broken in the ${theme} theme`, timeout: 15_000 }).toEqual([]);
  }
}
