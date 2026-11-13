"use client";

import { ArrowRight, Broadcast, ChatCircleDots, Hammer, Lifebuoy, Plug, Receipt, Scales, SealCheck, TerminalWindow, type Icon } from "@phosphor-icons/react";
import { decisions } from "@/content/decisions";
import { useTerminal } from "@/components/providers";
import { SectionHeading } from "@/components/site/section-heading";

type Tile = { title: string; text: string; icon: Icon; href?: string; terminal?: boolean };

// Three rows of three: the things to do first, then how it runs, then how it is built and checked.
const tiles: Tile[] = [
  { title: "Break it yourself", text: "Inject delays and errors into your own requests, and watch retries, a breaker and hedging cope.", icon: Hammer, href: "/break" },
  { title: "Go on call", text: "Two simulated incidents to work through, and a postmortem of your own.", icon: Lifebuoy, href: "/oncall" },
  { title: "The terminal", text: "A shell over the site's live API. Try status, or oncall.", icon: TerminalWindow, terminal: true },
  { title: "Live status", text: "Uptime against a 99.9% objective, how it ships, and every incident so far.", icon: Broadcast, href: "/status" },
  { title: "What it costs", text: "This month's bill, metered request by request, and what a traffic spike would do to it.", icon: Receipt, href: "/cost" },
  { title: "Ask me", text: "Questions answered from this site's own facts, with sources and a trace.", icon: ChatCircleDots, href: "/about#ask" },
  { title: "For agents", text: "The site is an MCP server: point your own AI agent at it.", icon: Plug, href: "/agents" },
  { title: "Decisions", text: `${decisions.length} architecture decision records, and what each one costs.`, icon: Scales, href: "/decisions" },
  { title: "Evidence", text: "Where each number on this site comes from, and which you can check.", icon: SealCheck, href: "/evidence" },
];

/** The site is a small production service of its own; these are the ways into that side of it. */
export function Explore() {
  const { setOpen } = useTerminal();
  return (
    <section id="explore" className="scroll-mt-16 border-y border-line bg-surface-2/40">
      <div className="mx-auto max-w-[1320px] px-4 py-20 sm:px-8 sm:py-24">
        <SectionHeading
          title={
            <>
              This site runs <span className="text-accent-ink">like production</span>.
            </>
          }
          lead="It has an SLO, a deploy pipeline with rollbacks, postmortems and an API of its own. Poke at any of it."
        />
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            const body = (
              <>
                <span className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2.5 font-semibold">
                    <Icon size={18} className="text-accent-ink" aria-hidden />
                    {tile.title}
                  </span>
                  <ArrowRight size={15} className="text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
                </span>
                <span className="mt-2 block text-sm leading-relaxed text-ink-2">{tile.text}</span>
              </>
            );
            const cls = "group block h-full w-full rounded-3xl border border-line bg-surface p-5 text-left transition-colors hover:border-ink-3";
            return (
              <li key={tile.title}>
                {tile.terminal ? (
                  <button type="button" onClick={() => setOpen(true)} className={cls}>
                    {body}
                  </button>
                ) : (
                  <a href={tile.href} className={cls}>
                    {body}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
