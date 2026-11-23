import { expect, type Locator, type Page } from "@playwright/test";

/** The site's terminal: a shell in the page over its own API. */
export class Terminal {
  readonly input: Locator;
  readonly output: Locator;

  constructor(readonly page: Page) {
    this.input = page.getByRole("textbox", { name: /^Command, at/ });
    this.output = page.getByRole("log", { name: "Terminal output" });
  }

  /** Opens it with its key, which works anywhere on a page. */
  async open() {
    await this.page.keyboard.press("Backquote");
    await expect(this.input).toBeFocused();
  }

  /** Runs a command and waits for it to finish. The entry on the screen: the prompt it ran at, then what it printed. */
  async run(command: string): Promise<Locator> {
    await expect(this.input).toBeVisible();
    const entries = this.output.locator("> div");
    const entry = entries.nth(await entries.count());
    await this.input.fill(command);
    await this.input.press("Enter");
    await expect(entry).toContainText(`$ ${command}`);
    await expect(this.output.getByText("asking the server")).toBeHidden();
    return entry;
  }

  /** Types without running, and asks for the completion. */
  async complete(typed: string) {
    await this.input.fill(typed);
    await this.input.press("Tab");
  }
}
