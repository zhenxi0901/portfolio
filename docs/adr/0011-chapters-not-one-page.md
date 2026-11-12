<!-- Generated from web/src/content/decisions.ts by web/scripts/gen-adr.mts. Edit that file, not this one. -->

# 11. Chapters, not one long page

- Status: Accepted
- Date: 2026-11-12

## Context

Everything was on the home page: 13 sections, 23 screens on a laptop and 35 on a phone, 3,526 words and 92 buttons. It grew a section at a time, and each section was worth having; together they were too much to take in.

People decide fast. Nielsen Norman Group found that 57% of the time spent on a page goes to its first screen and 74% to its first two, and interviewing.io measured recruiters reading a résumé for a median of 31 seconds. Almost all of the page sat below where a visitor would have stopped.

Engineers whose sites people return to solve this the same way: a short home page that says who and what, and a page per topic.

## Decision

A short home page: who I am, what I am doing now (dated), the site's live uptime, one card per product, the ways into the site's own operations, the latest writing, and contact.

A chapter per product, so each keeps its own work, models and numbers: /iot, /ai and /research. Then /writing for posts and postmortems, and /about for experience, the stack and the Ask console. Status, the changelog, these decisions, the evidence, the MCP server and the drills stay pages of their own.

One table says which page each section is on (web/src/lib/sections.ts). Every link, the Ask console's sources, the palette, the tour and the MCP tools go through it, and old links of the form /#section are sent on to the section's new page.

The one-page version stays at /v1, kept out of search results, as a record of where the site came from.

## Consequences

What it buys:

- The home page is a few screens, and each chapter reads on its own.
- Each product's material lives in one place, which is easier to keep straight and to link to.

What it costs:

- More clicks to see everything, and more to keep consistent: the chapter menu, the dock and the previous and next links all follow one list of pages.
- /v1 is a second copy of every section to keep building and testing.

## Evidence

- [web/src/lib/sections.ts: which page each section is on](../../web/src/lib/sections.ts)
- [web/src/app/page.tsx: the home page](../../web/src/app/page.tsx)
- [web/src/app/v1/page.tsx: the one-page version](../../web/src/app/v1/page.tsx)
