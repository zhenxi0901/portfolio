"use client";

import { Command } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowRight,
  Copy,
  FileText,
  GithubLogo,
  LinkedinLogo,
  MoonStars,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { usePalette } from "@/components/providers";
import { sections } from "@/components/site/nav-items";
import { profile } from "@/content/profile";
import { scrollToId } from "@/lib/utils";

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
            <Item key={s.id} onSelect={() => run(() => scrollToId(s.id))} icon={<ArrowRight size={16} />}>
              {s.label}
            </Item>
          ))}
        </Command.Group>
        <Command.Group heading="Actions">
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
          <Item icon={<FileText size={16} />} onSelect={() => run(() => window.open(profile.resume, "_blank"))}>
            Open résumé (PDF)
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

function Item({ children, icon, onSelect }: { children: React.ReactNode; icon: React.ReactNode; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-ink-2 data-[selected=true]:bg-surface-2 data-[selected=true]:text-ink"
    >
      <span className="text-ink-3">{icon}</span>
      {children}
    </Command.Item>
  );
}
