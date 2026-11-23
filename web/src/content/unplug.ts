// What this site loses when one part of it is gone: the register behind "Unplug something" on the live map. For each
// part, what stops, what does not, how it comes back (measured, or said to be an estimate or not rehearsed), and
// why that is good enough for a portfolio.
import delivery from "@/content/generated/delivery.json";
import type { Part } from "@/lib/unplug";

const drill = (delivery as unknown as { safeguards: { lastDrill: { ended: string; restoreSeconds: number | null } | null } }).safeguards.lastDrill;
const rollback =
  drill?.restoreSeconds != null
    ? `${drill.restoreSeconds} s to roll back, measured in the drill of ${new Date(drill.ended).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Asia/Singapore" })}`
    : "a rollback, which the pipeline does on its own";

export type Loss = { lost: string; works: string; back: string; why: string };

export const losses: Record<Part, Loss> = {
  gfe: {
    lost: "Everything new. It ends TLS and finds the server for every request, so no page, API call or uptime check gets through.",
    works: "What is already open: this page is in your browser, and so are its models and the drill.",
    back: "When Google brings it back. There is nothing for me to do but watch.",
    why: "Another company's edge in front of it would be one more thing that can fail, run by one person.",
  },
  run: {
    lost: "Every page and every API call. There is one region and no copy elsewhere.",
    works: "Only what is already in your browser.",
    back: `After a bad release, ${rollback}. After losing the region, not rehearsed: built again elsewhere, at a new address.`,
    why: "An afternoon down costs a portfolio little, and a second region would cost more than the S$1 a month this one is allowed.",
  },
  api: {
    lost: "Every live figure, the contact form, the fault lab, the terminal's live commands and the MCP server.",
    works: "Every page, and Ask: without the API, your browser answers from the same facts by itself.",
    back: `It is the same binary as the pages, so only a bad release takes it alone: ${rollback}.`,
    why: "One binary means one deploy, one rollback and no cross-origin requests (decision 2).",
  },
  monitoring: {
    lost: "New readings of the SLO and of the bill.",
    works: "Everything else. The last readings stay, say when they were taken, and lose the colour that means live.",
    back: "On its own: the server asks again every minute.",
    why: "With nothing measured the release gate stays open, because losing the meter should not stop a fix (decision 7).",
  },
  probes: {
    lost: "The view from outside. The bars stop, and nothing keeps an instance warm, so a visitor after a quiet spell waits for a cold start.",
    works: "The site. The readings the checks refresh on their way through are refreshed by visitors' requests instead, an hour or more apart.",
    back: "They are one Terraform resource; putting it back is one apply.",
    why: "They run from three continents and cost nothing at three a minute. A second set would be paid for to say the same.",
  },
  actions: {
    lost: "Releases, the twice-daily message through the contact form, the search for undelivered ones, and the tests of this site's claims.",
    works: "The release that is running, which does not need it, and a rollback, which is one gcloud command.",
    back: "When GitHub brings it back.",
    why: "A release made by hand would skip the tests, the SBOM and the signature, so waiting is the better outage.",
  },
};
