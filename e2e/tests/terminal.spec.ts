import type { Page } from "@playwright/test";
import { PHONE } from "../support/screens.ts";
import { sidewaysScroll, visit } from "../support/site.ts";
import { Terminal } from "../support/terminal.ts";
import { expect, test } from "../support/test.ts";

/** The terminal, opened over a page. */
async function openTerminal(page: Page, path = "/") {
  await visit(page, path);
  const terminal = new Terminal(page);
  await terminal.open();
  return terminal;
}

const closed = (page: Page) => expect(page.getByRole("dialog", { name: /a shell over this site's API/ })).toBeHidden();

test.describe("opening and closing", () => {
  test("it is not in the page until asked for, then welcomes the visitor with the prompt ready", async ({ page }) => {
    await visit(page, "/");
    const terminal = new Terminal(page);
    await expect(terminal.input).not.toBeAttached();
    await terminal.open();
    await expect(terminal.output).toContainText("A small shell over this site's real API");
  });

  test("Esc closes it, and the session is still there when it opens again", async ({ page }) => {
    const terminal = await openTerminal(page);
    await terminal.run("slo");
    await page.keyboard.press("Escape");
    await closed(page);
    await page.getByRole("button", { name: "Open the terminal", exact: true }).click();
    await expect(terminal.output).toContainText("uptime-check results passed");
  });

  test("exit closes it", async ({ page }) => {
    const terminal = await openTerminal(page);
    await terminal.input.fill("exit");
    await terminal.input.press("Enter");
    await closed(page);
  });

  test("a link with ?terminal opens it, and tidies only that out of the address", async ({ page }) => {
    await visit(page, "/agents?terminal&ref=x#main");
    await expect(new Terminal(page).input).toBeFocused();
    await expect(page).toHaveURL("/agents?ref=x#main");
  });

  test("the page for agents has a button of its own for it", async ({ page }) => {
    await visit(page, "/agents");
    await page.getByRole("button", { name: "Or use the terminal on this site" }).click();
    await expect(new Terminal(page).input).toBeFocused();
  });

  test("a backtick typed in a field stays in the field", async ({ page }) => {
    await visit(page, "/about");
    const question = page.getByRole("textbox", { name: "Your question" });
    await question.pressSequentially("a ` in a question");
    await expect(question).toHaveValue("a ` in a question");
    await expect(new Terminal(page).input).not.toBeAttached();
  });

  test.describe("when its code cannot be fetched", () => {
    test.use({ expectedLogs: /Failed to load resource: net::ERR_FAILED/ });

    test("one notice says so, however often the key is pressed, and the page stands", async ({ page }) => {
      await visit(page, "/");
      await page.route("**/_next/static/chunks/**", (route) => route.abort());
      const notice = page.getByText("The terminal could not load.");
      await page.keyboard.press("Backquote");
      await expect(notice).toBeVisible();
      await page.keyboard.press("Backquote");
      // A second notice would arrive as the first did, at once.
      await page.waitForTimeout(300);
      await expect(notice).toHaveCount(1);
      await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  });
});

test.describe("reading the site", () => {
  test("help lists the commands by what they are for", async ({ page }) => {
    const help = await (await openTerminal(page)).run("help");
    await expect(help).toContainText("Live, from this site's API");
    await expect(help.getByRole("button")).toContainText(["whoami", "ls [dir]", "cat <file>", "open <page>", "status", "slo", "cost", "deploys", "ask <question>", "curl <path>", "tour", "contact"]);
  });

  test("whoami says who and what for", async ({ page }) => {
    const terminal = await openTerminal(page);
    await expect(await terminal.run("whoami")).toContainText(/Open to \d{4} roles/);
  });

  test("the pages are files to list, enter and print", async ({ page }) => {
    const terminal = await openTerminal(page);
    await expect(await terminal.run("ls")).toContainText("postmortems/");
    await expect(await terminal.run("ls work")).toContainText("gke.md");
    await terminal.run("cd work");
    await expect(terminal.input).toHaveAccessibleName("Command, at visitor@zhenxi:~/work$");
    await expect(await terminal.run("cat gke.md")).toContainText("# One VM to a GKE platform");
    await expect(await terminal.run("cat ../writing/agents-without-root")).toContainText("without root");
    await terminal.run("cd ..");
    await expect(terminal.input).toHaveAccessibleName("Command, at visitor@zhenxi:~$");
    await expect(await terminal.run("cat nothing")).toContainText("no such file");
  });

  test("contact leads to the form", async ({ page }) => {
    const terminal = await openTerminal(page, "/about");
    const answer = await terminal.run("contact");
    await answer.getByRole("button", { name: "open contact" }).click();
    await expect(page).toHaveURL("/#contact");
  });

  for (const [command, path] of [
    ["open work/gke.md", "/work/gke"],
    ["open about", "/about"],
    ["open research", "/research"],
    ["open cost", "/cost"],
    ["open break", "/break"],
  ] as const) {
    test(`${command} goes to ${path}`, async ({ page }) => {
      const terminal = await openTerminal(page);
      await terminal.input.fill(command);
      await terminal.input.press("Enter");
      await expect(page).toHaveURL(path);
    });
  }
});

test.describe("asking the live API", () => {
  test("status is what the server says it is running, and where", async ({ page, request }) => {
    const { commit, region } = await (await request.get("/api/status")).json();
    const status = await (await openTerminal(page)).run("status");
    await expect(status).toContainText(commit);
    await expect(status).toContainText(region === "local" ? "a local copy, not the live site" : `Cloud Run, ${region}`);
    await expect(status).toContainText(/up \d+ (s|min|h), [\d,]+ requests served/);
  });

  test("slo is the availability and the budget as measured from outside", async ({ page }) => {
    const slo = await (await openTerminal(page)).run("slo");
    await expect(slo).toContainText(/100%\s+[\d,]+ of [\d,]+ uptime-check results passed/);
    await expect(slo).toContainText(/99\.9% over 30 days/);
  });

  test("cost is the receipt", async ({ page }) => {
    await visit(page, "/cost");
    const total = await page.getByRole("row", { name: /^To pay/ }).getByRole("cell").innerText();
    const terminal = new Terminal(page);
    await terminal.open();
    const cost = await terminal.run("cost");
    await expect(cost).toContainText(new RegExp(`to pay\\s+${total.replace("$", "\\$")}`));
    await expect(cost).toContainText(/list price\s+US\$\d/);
    await expect(cost).toContainText(/\d+% of requests are the site's own uptime checks/);
  });

  test("deploys is how the site ships, with the commit it was built from", async ({ page }) => {
    const deploys = await (await openTerminal(page)).run("deploys");
    await expect(deploys).toContainText(/[\d.]+ min, median, from commit to live/);
    await expect(deploys).toContainText(/built from +[0-9a-f]{7}/);
  });

  test("ask answers from the site's facts", async ({ page }) => {
    const answer = await (await openTerminal(page)).run("ask how did you cut the cloud bill");
    await expect(answer).toContainText("15%");
    await expect(answer).toContainText("sources");
  });

  test("neofetch is the site at a glance", async ({ page }) => {
    await expect(await (await openTerminal(page)).run("neofetch")).toContainText("standard library net/http");
  });

  test("mcp lists the server's tools and calls them", async ({ page }) => {
    const terminal = await openTerminal(page);
    await expect(await terminal.run("mcp tools")).toContainText("get_delivery");
    await expect(await terminal.run("mcp call get_status")).toContainText("tools/call get_status · HTTP 200");
    await expect(await terminal.run("mcp call search_facts kafka limit=1")).toContainText(/## .*Kafka/s);
    await expect(await terminal.run("mcp call search_facts kafka limit=9")).toContainText("must be a whole number from 1 to 5; got 9");
  });

  test("a server that does not answer is given up on after the wait the message names", async ({ page }) => {
    await page.clock.install();
    const terminal = await openTerminal(page);
    await page.route("**/api/status", () => {});
    await terminal.input.fill("status");
    await terminal.input.press("Enter");
    await expect(terminal.output).toContainText("asking the server");
    await page.clock.runFor(4_000);
    await expect(terminal.output).toContainText("no answer within 4 s");
  });
});

test.describe("curl", () => {
  test("on the home page is what a real curl gets", async ({ page, request }) => {
    const card = await (await request.get("/api/card.txt")).text();
    const running = card.match(/commit \w+, on [^\n]+|commit \w+ on [^\n]+/)![0];
    const answer = await (await openTerminal(page)).run("curl /");
    await expect(answer).toContainText("what a real curl gets for the home page");
    await expect(answer).toContainText(running);
  });

  test("on an endpoint prints its JSON, on a drawing its SVG, and on a text file the text", async ({ page }) => {
    const terminal = await openTerminal(page);
    await expect(await terminal.run("curl /api/slo")).toContainText('"target": 0.999');
    const drawing = await terminal.run("curl /api/card.svg");
    await expect(drawing).toContainText("<svg");
    await expect(drawing).not.toContainText("Binary");
    await expect(await terminal.run("curl llms.txt")).toContainText("# Li ZhenXi");
  });

  test("on a page says the browser reads it better", async ({ page }) => {
    await expect(await (await openTerminal(page)).run("curl /status")).toContainText("It reads better in the browser");
  });

  test("goes nowhere else, whether the address is a URL or a bare host", async ({ page }) => {
    const terminal = await openTerminal(page);
    for (const address of ["https://example.com", "example.com", "//example.com/x"]) {
      await expect(await terminal.run(`curl ${address}`)).toContainText("only reaches this site");
    }
  });

  test.describe("with nothing there", () => {
    test.use({ expectedLogs: /status of 404/ });

    test("says so", async ({ page }) => {
      await expect(await (await openTerminal(page)).run("curl /nonexistent")).toContainText("Nothing at /nonexistent.");
    });
  });
});

test.describe("being a shell", () => {
  test("nothing can be changed from it, and it says so", async ({ page }) => {
    const terminal = await openTerminal(page);
    await expect(await terminal.run("sudo rm -rf /")).toContainText("Everything here is read-only");
    await expect(await terminal.run("rm -rf /")).toContainText("read-only file system");
    await expect(await terminal.run("nonsense")).toContainText("command not found");
  });

  test("Tab completes commands, paths and tool names, and lists the choices when there are several", async ({ page }) => {
    const terminal = await openTerminal(page);
    await terminal.complete("sta");
    await expect(terminal.input).toHaveValue("status ");
    await terminal.complete("cat wo");
    await expect(terminal.input).toHaveValue("cat work/");
    await terminal.complete("cat work/");
    await expect(terminal.output).toContainText("work/gke.md   work/pipeline.md");
    await terminal.complete("mcp call get_");
    await expect(terminal.input).toHaveValue("mcp call get_");
    await expect(terminal.output).toContainText("get_status   get_delivery");
    await terminal.complete("mcp call get_d");
    await expect(terminal.input).toHaveValue("mcp call get_delivery ");
  });

  test("the arrows walk the history and come back to what was being typed", async ({ page }) => {
    const terminal = await openTerminal(page);
    await terminal.run("whoami");
    await expect(await terminal.run("history")).toContainText(/1\s+whoami\s*2\s+history/);
    await terminal.input.fill("half a com");
    await terminal.input.press("ArrowUp");
    await expect(terminal.input).toHaveValue("history");
    await terminal.input.press("ArrowUp");
    await expect(terminal.input).toHaveValue("whoami");
    await terminal.input.press("ArrowDown");
    await terminal.input.press("ArrowDown");
    await expect(terminal.input).toHaveValue("half a com");
  });

  test("a command in the output runs when pressed", async ({ page }) => {
    const terminal = await openTerminal(page);
    const help = await terminal.run("help");
    await help.getByRole("button", { name: "whoami" }).click();
    await expect(terminal.output.locator("> div").last()).toContainText(/\$ whoami.*Open to/s);
  });

  test("theme switches the page's theme and back", async ({ page }) => {
    const terminal = await openTerminal(page);
    await expect(await terminal.run("theme")).toContainText("theme: dark");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expect(await terminal.run("theme light")).toContainText("theme: light");
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  });

  test("clear empties the screen", async ({ page }) => {
    const terminal = await openTerminal(page);
    await terminal.run("whoami");
    await terminal.input.fill("clear");
    await terminal.input.press("Enter");
    await expect(terminal.output).toBeEmpty();
  });
});

test("an incident can be worked as text, from the page of the drill to the postmortem", async ({ page }) => {
  await visit(page, "/oncall#oncall-ai");
  await page.getByRole("button", { name: "Work this incident as text in the site's shell" }).filter({ visible: true }).click();
  const terminal = new Terminal(page);
  await expect(terminal.output).toContainText("PAGE, FIRING");
  await expect(terminal.output).toContainText("Document assistant: slow answers, fast burn");
  await expect(await terminal.run("oncall restore")).toContainText("Not yet: that is how you close out");
  await terminal.run("oncall trace");
  await expect(await terminal.run("oncall skip-rerank")).toContainText("The burn has stopped.");
  const end = await terminal.run("oncall restore");
  await expect(end).toContainText("YOUR POSTMORTEM");
  await expect(end).toContainText("Burn stopped after 5 minutes, closed after 9");
  await expect(end).toContainText("✓ Read a slow request's trace before acting");
  await expect(end).toContainText("✗ Found why before closing");
});

test.describe("on a phone", () => {
  test.use(PHONE);

  test("it opens from its button, and fits the screen", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Open the terminal", exact: true }).click();
    const terminal = new Terminal(page);
    await expect(terminal.input).toBeFocused();
    await expect(page.getByText("~$", { exact: true })).toBeVisible();
    await expect(await terminal.run("status")).toContainText("requests served");
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
  });

  test("a row of help that wraps keeps its second column", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Open the terminal", exact: true }).click();
    const help = await new Terminal(page).run("help");
    const row = help.getByRole("paragraph").filter({ hasText: "ask about my work" });
    const { command, description } = await row.evaluate((line) => {
      const range = document.createRange();
      range.selectNodeContents(line.lastElementChild!);
      const starts = new Map<number, number>();
      for (const { top, left } of range.getClientRects()) starts.set(top, Math.min(left, starts.get(top) ?? Infinity));
      return { command: line.firstElementChild!.getBoundingClientRect().left, description: [...starts.values()] };
    });
    // Every line of the description starts at the same place, well to the right of the command.
    expect(description.length).toBeGreaterThan(1);
    for (const start of description) expect(Math.abs(start - description[0]!)).toBeLessThanOrEqual(2);
    expect(description[0]! - command).toBeGreaterThan(100);
  });
});
