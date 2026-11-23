import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// WCAG 2.2 at AA with every version and level before it, and the practices axe recommends beyond it.
const RULES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function broken(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(RULES).analyze();
  return violations.map(({ id, help, nodes }) => ({ id, help, where: nodes.map(({ target, failureSummary }) => `${target.join(" ")}: ${failureSummary}`) }));
}

/** The page, as it stands, breaks none of the rules axe can check, in the light theme or in the dark. */
export async function expectAccessible(page: Page) {
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator(`html.${theme}`)).toBeAttached();
    // Asked again for a moment if something is found: what is still fading in is not yet what anyone reads.
    await expect.poll(() => broken(page), { message: `rules broken in the ${theme} theme`, timeout: 6_000 }).toEqual([]);
  }
}
