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
  Warning,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { usePalette } from "@/components/providers";
import { sections } from "@/components/site/nav-items";
import { cases, profile } from "@/content/profile";
import { postmortems } from "@/content/postmortems";
import { posts } from "@/content/writing";
import { goTo, openPlatformTab, scrollToId } from "@/lib/utils";
import { startTour } from "@/components/site/tour";

export function CommandPalette() {
  const { open, setOpen } = usePalette();
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
        <Command.Group heading="Actions">
          <Item keywords={["tour", "overview", "highlights", "recruiter", "quick"]} icon={<ArrowRight size={16} />} onSelect={() => run(startTour)}>
            Take the 60-second tour
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
