"use client";

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
import { posts } from "@/content/writing";
import { goTo, openPlatformTab, scrollToId } from "@/lib/utils";
import { startTour } from "@/components/site/tour";

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9%]+/).filter(Boolean);

/**
 * How well an item answers what was typed. cmdk's default is fuzzy: "terminal" matched
 * "Postmortems" letter by letter, and "changelog" chose a case study that starts with "Chang".
 * Here every typed word must start a word of the item, and the item's own name beats its keywords.
 */
export function rank(value: string, search: string, keywords: string[] = []): number {
  const query = words(search);
  if (query.length === 0) return 1;
  const label = words(value);
  const extra = words(keywords.join(" "));
  const inLabel = (q: string) => label.some((w) => w.startsWith(q));
  if (!query.every((q) => inLabel(q) || extra.some((w) => w.startsWith(q)))) return 0;
  if (label.join(" ").startsWith(query.join(" "))) return 1;
  if (label.some((w) => query.includes(w))) return 0.9;
  if (query.every(inLabel)) return 0.8;
  return extra.some((w) => query.includes(w)) ? 0.6 : 0.5;
}

export function CommandPalette() {
  const { open, setOpen } = usePalette();
  const terminal = useTerminal();
  const { resolvedTheme, setTheme } = useTheme();

  const run = (fn: () => void) => {
    setOpen(false);
    // Let the dialog close before scrolling so focus returns cleanly.
    requestAnimationFrame(fn);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Jump anywhere"
      filter={rank}
      overlayClassName="fixed inset-0 z-40 bg-bg/60 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[18vh] z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-3xl border border-line bg-surface shadow-soft"
    >
      <DialogPrimitive.Title className="sr-only">Jump anywhere</DialogPrimitive.Title>
      <Command.Input
        autoFocus
        placeholder="Where to? Try “research” or “copy email”"
        className="h-14 w-full border-b border-line bg-transparent px-5 text-[15px] text-ink outline-none placeholder:text-ink-3"
      />
      <Command.List className="max-h-[50vh] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-3">
        <Command.Empty className="px-4 py-8 text-center text-sm text-ink-3">Nothing matches that.</Command.Empty>
        <Command.Group heading="Sections">
          {sections.map((s) => (
            <Item key={s.id} keywords={s.keywords} onSelect={() => run(() => scrollToId(s.id))} icon={<ArrowRight size={16} />}>
              {s.label}
            </Item>
          ))}
          <Item
            keywords={["slo", "sli", "sla", "error budget", "burn rate", "alerts", "grafana", "monitoring", "sre"]}
            onSelect={() => run(() => openPlatformTab("signals"))}
            icon={<ArrowRight size={16} />}
          >
            SLOs and monitoring
          </Item>
          <Item
            keywords={["cost", "bill", "finops", "savings", "15%"]}
            onSelect={() => run(() => openPlatformTab("cost"))}
            icon={<ArrowRight size={16} />}
          >
            Cost review
          </Item>
        </Command.Group>
        <Command.Group heading="Case studies">
          {cases.map((c) => (
            <Item key={c.id} keywords={c.stack} onSelect={() => run(() => goTo(`/work/${c.id}`))} icon={<Article size={16} />}>
              {c.title}
            </Item>
          ))}
        </Command.Group>
        <Command.Group heading="Writing">
          {posts.map((p) => (
            <Item key={p.slug} keywords={["post", "blog", "writing"]} onSelect={() => run(() => goTo(`/writing/${p.slug}`))} icon={<Article size={16} />}>
              {p.title}
            </Item>
          ))}
        </Command.Group>
        <Command.Group heading="Postmortems">
          {postmortems.map((p) => (
            <Item
              key={p.slug}
              keywords={["postmortem", "incident", p.kind]}
              onSelect={() => run(() => goTo(`/postmortems/${p.slug}`))}
              icon={<Warning size={16} />}
            >
              {p.title}
            </Item>
          ))}
        </Command.Group>
        <Command.Group heading="How this site runs">
          <Item keywords={["status", "uptime", "up", "down", "incidents", "availability", "feed"]} icon={<Article size={16} />} onSelect={() => run(() => goTo("/status"))}>
            Status page
          </Item>
          <Item keywords={["changelog", "releases", "deploys", "history", "what changed"]} icon={<Article size={16} />} onSelect={() => run(() => goTo("/changelog"))}>
            Changelog
          </Item>
          <Item
            keywords={["decisions", "adr", "architecture", "why", "trade-offs", "design"]}
            icon={<Article size={16} />}
            onSelect={() => run(() => goTo("/decisions"))}
          >
            Architecture decisions
          </Item>
          <Item
            keywords={["agents", "mcp", "model context protocol", "claude", "cursor", "llms.txt", "curl", "ai", "tools"]}
            icon={<Article size={16} />}
            onSelect={() => run(() => goTo("/agents"))}
          >
            For agents: this site as an MCP server
          </Item>
          <Item
            keywords={["evidence", "proof", "verify", "claims", "sources", "numbers", "check", "trust"]}
            icon={<Article size={16} />}
            onSelect={() => run(() => goTo("/evidence"))}
          >
            Evidence: where the claims come from
          </Item>
        </Command.Group>
        <Command.Group heading="Actions">
          <Item
            keywords={["terminal", "shell", "cli", "console", "bash", "command line", "curl", "hacker"]}
            icon={<TerminalWindow size={16} />}
            onSelect={() => run(() => terminal.setOpen(true))}
          >
            Open the terminal: a shell over this site&apos;s API
          </Item>
          <Item keywords={["tour", "overview", "highlights", "recruiter", "quick"]} icon={<ArrowRight size={16} />} onSelect={() => run(startTour)}>
            Take the 60-second tour
          </Item>
          <Item keywords={["on call", "incident", "drill", "pager", "simulation", "game"]} icon={<ArrowRight size={16} />} onSelect={() => run(() => goTo("/oncall"))}>
            Go on call: an incident drill
          </Item>
          <Item
            icon={<Copy size={16} />}
            onSelect={() =>
              run(async () => {
                await navigator.clipboard.writeText(profile.email);
                toast.success("Email copied", { description: profile.email });
              })
            }
          >
            Copy email address
          </Item>
          <Item
            icon={<MoonStars size={16} />}
            onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}
          >
            Toggle dark mode
          </Item>
          <Item icon={<GithubLogo size={16} />} onSelect={() => run(() => window.open(profile.github, "_blank"))}>
            GitHub
          </Item>
          <Item icon={<LinkedinLogo size={16} />} onSelect={() => run(() => window.open(profile.linkedin, "_blank"))}>
            LinkedIn
          </Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}

function Item({
  children,
  icon,
  onSelect,
  keywords,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onSelect: () => void;
  keywords?: string[];
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      keywords={keywords}
      className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-ink-2 data-[selected=true]:bg-surface-2 data-[selected=true]:text-ink"
    >
      <span className="text-ink-3">{icon}</span>
      {children}
    </Command.Item>
  );
}
