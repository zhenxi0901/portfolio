"use client";

import { useState } from "react";
import { Command } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowRight,
  Article,
  Copy,
  GithubLogo,
  LinkedinLogo,
  MoonStars,
  TerminalWindow,
  Warning,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { usePalette, useTerminal } from "@/components/providers";
import { sections } from "@/components/site/nav-items";
import { cases, profile } from "@/content/profile";
import { postmortems } from "@/content/postmortems";
import { products } from "@/content/products";
import { posts } from "@/content/writing";
import { goTo, openPlatformTab, scrollToId } from "@/lib/utils";
import { startTour } from "@/components/site/tour";

// Letters and digits in any script, so "ü" or "云" is a word too, not a separator.
const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}%]+/u).filter(Boolean);

/**
 * How well an item answers what was typed, from 0 (not at all) to 1. cmdk's own matching is fuzzy:
 * "terminal" matched "Postmortems" letter by letter, and "changelog" chose a case study that starts
 * with "Chang". Here every typed word must start a word of the item, and the item's own name beats
 * its keywords.
 */
export function rank(value: string, search: string, keywords: string[] = []): number {
  // Nothing typed matches everything; something typed that has no words in it (a "?") matches nothing.
  if (search.trim() === "") return 1;
  const query = words(search);
  if (query.length === 0) return 0;
  const label = words(value);
  const extra = words(keywords.join(" "));
  const inLabel = (q: string) => label.some((w) => w.startsWith(q));
  if (!query.every((q) => inLabel(q) || extra.some((w) => w.startsWith(q)))) return 0;
  if (label.join(" ").startsWith(query.join(" "))) return 1;
  // Among equal matches, the one that says it sooner wins: "For agents" before a title that ends in "agents".
  const first = label.findIndex((w) => query.some((q) => w.startsWith(q)));
  const late = Math.min(Math.max(first, 0), 9) * 0.005;
  if (query.every((q) => label.includes(q))) return 0.9 - late;
  if (query.every(inLabel)) return 0.8 - late;
  return query.every((q) => inLabel(q) || extra.includes(q)) ? 0.6 : 0.5;
}

/** `now`: the action needs the click's user activation (a new tab, the clipboard), so it cannot wait a frame. */
type Entry = { id: string; group: string; label: string; keywords?: string[]; icon: React.ReactNode; action: () => void; now?: boolean };

const GROUPS = ["Sections", "Case studies", "Writing", "Postmortems", "How this site runs", "Actions"];

export function CommandPalette() {
  const { open, setOpen } = usePalette();
  const terminal = useTerminal();
  const { resolvedTheme, setTheme } = useTheme();
  const [search, setSearch] = useState("");

  const run = (fn: () => void, now = false) => {
    if (now) fn();
    setOpen(false);
    setSearch("");
    // Otherwise let the dialog close before scrolling, so focus returns cleanly.
    if (!now) requestAnimationFrame(fn);
  };

  const arrow = <ArrowRight size={16} />;
  const page = <Article size={16} />;
  const entries: Entry[] = [
    ...sections.map((s) => ({ id: `section-${s.id}`, group: "Sections", label: s.label, keywords: s.keywords, icon: arrow, action: () => scrollToId(s.id) })),
    {
      id: "section-slos",
      group: "Sections",
      label: "SLOs and monitoring",
      keywords: ["slo", "sli", "sla", "error budget", "burn rate", "alerts", "grafana", "monitoring", "sre"],
      icon: arrow,
      action: () => openPlatformTab("signals"),
    },
    { id: "section-cost", group: "Sections", label: "Cost review", keywords: ["cost", "bill", "finops", "savings", "15%"], icon: arrow, action: () => openPlatformTab("cost") },
    ...cases.map((c) => ({
      id: `case-${c.id}`,
      group: "Case studies",
      label: c.title,
      keywords: [...c.stack, ...c.products.map((p) => products[p].name), "case study"],
      icon: page,
      action: () => goTo(`/work/${c.id}`),
    })),
    ...posts.map((p) => ({ id: `post-${p.slug}`, group: "Writing", label: p.title, keywords: ["post", "blog", "writing"], icon: page, action: () => goTo(`/writing/${p.slug}`) })),
    ...postmortems.map((p) => ({
      id: `postmortem-${p.slug}`,
      group: "Postmortems",
      label: p.title,
      keywords: ["postmortem", "incident", p.kind],
      icon: <Warning size={16} />,
      action: () => goTo(`/postmortems/${p.slug}`),
    })),
    { id: "status", group: "How this site runs", label: "Status page", keywords: ["status", "uptime", "up", "down", "incidents", "availability", "feed"], icon: page, action: () => goTo("/status") },
    { id: "changelog", group: "How this site runs", label: "Changelog", keywords: ["changelog", "releases", "deploys", "history", "what changed"], icon: page, action: () => goTo("/changelog") },
    {
      id: "decisions",
      group: "How this site runs",
      label: "Architecture decisions",
      keywords: ["decisions", "adr", "architecture", "why", "trade-offs", "design"],
      icon: page,
      action: () => goTo("/decisions"),
    },
    {
      id: "agents",
      group: "How this site runs",
      label: "For agents: this site as an MCP server",
      keywords: ["agents", "mcp", "model context protocol", "claude", "cursor", "llms.txt", "curl", "ai", "tools"],
      icon: page,
      action: () => goTo("/agents"),
    },
    {
      id: "evidence",
      group: "How this site runs",
      label: "Evidence: where the claims come from",
      keywords: ["evidence", "proof", "verify", "claims", "sources", "numbers", "check", "trust"],
      icon: page,
      action: () => goTo("/evidence"),
    },
    {
      id: "terminal",
      group: "Actions",
      label: "Open the terminal: a shell over this site's API",
      keywords: ["terminal", "shell", "cli", "console", "bash", "command line", "curl", "hacker"],
      icon: <TerminalWindow size={16} />,
      action: () => terminal.setOpen(true),
    },
    { id: "tour", group: "Actions", label: "Take the 60-second tour", keywords: ["tour", "overview", "highlights", "recruiter", "quick"], icon: arrow, action: startTour },
    {
      id: "oncall",
      group: "Actions",
      label: "Go on call: stale telemetry on the IoT platform",
      keywords: ["on call", "incident", "drill", "pager", "simulation", "game", "iot", "telemetry", "kafka", "rollback"],
      icon: arrow,
      action: () => goTo("/oncall#oncall-iot"),
    },
    {
      id: "oncall-ai",
      group: "Actions",
      label: "Go on call: slow answers on the AI agent platform",
      keywords: ["on call", "incident", "drill", "pager", "simulation", "game", "ai", "llm", "rag", "reranker", "gpu", "latency", "trace"],
      icon: arrow,
      action: () => goTo("/oncall#oncall-ai"),
    },
    {
      id: "copy-email",
      now: true,
      group: "Actions",
      label: "Copy email address",
      keywords: ["contact", "mail"],
      icon: <Copy size={16} />,
      action: async () => {
        // The clipboard can refuse (permissions, an older Safari): then show the address to copy by hand.
        try {
          await navigator.clipboard.writeText(profile.email);
          toast.success("Email copied", { description: profile.email });
        } catch {
          toast(profile.email, { description: "Copying was blocked; here it is to copy by hand." });
        }
      },
    },
    {
      id: "theme",
      group: "Actions",
      label: "Toggle dark mode",
      keywords: ["light", "theme", "appearance"],
      icon: <MoonStars size={16} />,
      action: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    },
    { id: "github", now: true, group: "Actions", label: "GitHub", keywords: ["code", "repositories", "source"], icon: <GithubLogo size={16} />, action: () => window.open(profile.github, "_blank", "noopener,noreferrer") },
    { id: "linkedin", now: true, group: "Actions", label: "LinkedIn", icon: <LinkedinLogo size={16} />, action: () => window.open(profile.linkedin, "_blank", "noopener,noreferrer") },
  ];

  // With something typed, the groups dissolve into one list, best match first. Ties keep the
  // order above, so a section still comes before a page that matches equally well.
  const query = search.trim();
  const results = query
    ? entries
        .map((entry, order) => ({ entry, order, score: rank(entry.label, query, entry.keywords) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .map((r) => r.entry)
    : null;

  const item = (e: Entry, withGroup: boolean) => (
    <Command.Item
      key={e.id}
      value={e.id}
      onSelect={() => run(e.action, e.now)}
      className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-ink-2 data-[selected=true]:bg-surface-2 data-[selected=true]:text-ink"
    >
      <span className="text-ink-3">{e.icon}</span>
      <span className="min-w-0 flex-1">{e.label}</span>
      {withGroup && <span className="shrink-0 font-mono text-[11px] text-ink-3">{e.group}</span>}
    </Command.Item>
  );

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setSearch("");
      }}
      label="Jump anywhere"
      // The ranking and the order are ours (see rank), so cmdk only draws the list.
      shouldFilter={false}
      overlayClassName="fixed inset-0 z-40 bg-bg/60 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[18vh] z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-3xl border border-line bg-surface shadow-soft"
    >
      <DialogPrimitive.Title className="sr-only">Jump anywhere</DialogPrimitive.Title>
      <Command.Input
        autoFocus
        value={search}
        onValueChange={setSearch}
        placeholder="Where to? Try “research” or “copy email”"
        className="h-14 w-full border-b border-line bg-transparent px-5 text-base text-ink outline-none placeholder:text-ink-3 sm:text-[15px]"
      />
      <Command.List className="max-h-[50vh] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-3">
        <Command.Empty className="px-4 py-8 text-center text-sm text-ink-3">Nothing matches that.</Command.Empty>
        {results
          ? results.map((e) => item(e, true))
          : GROUPS.map((group) => (
              <Command.Group key={group} heading={group}>
                {entries.filter((e) => e.group === group).map((e) => item(e, false))}
              </Command.Group>
            ))}
      </Command.List>
    </Command.Dialog>
  );
}
