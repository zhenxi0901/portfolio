import { sitemapPaths } from "../support/site.ts";
import { expect, test } from "../support/test.ts";

// What is served to something other than a person at a browser: crawlers, link previews, AI agents, a terminal.
const CHAPTERS = ["/iot", "/ai", "/research", "/writing", "/about"];
const OWN_PAGES = ["/oncall", "/break", "/status", "/cost", "/changelog", "/decisions", "/agents", "/evidence"];

test("the sitemap has every chapter and every page of the site's own, and not the one-page version", async () => {
  const paths = await sitemapPaths();
  expect(paths).toEqual(expect.arrayContaining(["/", ...CHAPTERS, ...OWN_PAGES]));
  expect(paths).not.toContain("/v1");
  expect(new Set(paths).size).toBe(paths.length);
});

test("llms.txt tells an agent where the chapters are, what to try, and where the numbers are as JSON", async ({ request }) => {
  const text = await (await request.get("/llms.txt")).text();
  expect(text).toContain("## Chapters");
  for (const path of [...CHAPTERS, "/oncall", "/break", "/cost", "/api/cost", "/api/claims", "/evidence.json"]) expect(text, path).toContain(`${path})`);
});

for (const path of await sitemapPaths()) {
  test(`${path} has an image for link previews`, async ({ request }) => {
    const html = await (await request.get(path, { headers: { Accept: "text/html" } })).text();
    const image = html.match(/<meta property="og:image" content="([^"]+)"/);
    expect(image).not.toBeNull();
    // Named by its public address, and served here from the same path.
    const response = await request.get(new URL(image![1]!).pathname);
    expect(response.status()).toBe(200);
    expect((await response.body()).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });
}

test("the icon that browsers ask for by themselves is an icon file", async ({ request }) => {
  const response = await request.get("/favicon.ico");
  expect(response.status()).toBe(200);
  expect((await response.body()).subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
});

test("a terminal that asks for the home page gets a card it can print, unless it asks for HTML", async ({ request }) => {
  const asTerminal = { "User-Agent": "curl/8.11.0" };
  const card = await request.get("/", { headers: { ...asTerminal, Accept: "*/*" } });
  expect(card.headers()["content-type"]).toBe("text/plain; charset=utf-8");
  expect(await card.text()).toContain("This page is a live service; you asked from a terminal");
  const page = await request.get("/", { headers: { ...asTerminal, Accept: "text/html" } });
  expect(page.headers()["content-type"]).toBe("text/html; charset=utf-8");
  expect(await page.text()).toContain("<title>Li ZhenXi");
});
