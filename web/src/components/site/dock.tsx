"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  Broadcast,
  ChatCircleDots,
  Briefcase,
  EnvelopeSimple,
  FileText,
  Flask,
  GithubLogo,
  House,
  LinkedinLogo,
  SquaresFour,
  TreeStructure,
  type Icon,
} from "@phosphor-icons/react";
import { profile } from "@/content/profile";
import { scrollToId } from "@/lib/utils";

type Item = { label: string; icon: Icon; id?: string; href?: string };

const items: Item[] = [
  { label: "Home", icon: House, id: "top" },
  { label: "Work", icon: SquaresFour, id: "work" },
  { label: "Inside the platform", icon: TreeStructure, id: "platform" },
  { label: "Research", icon: Flask, id: "research" },
  { label: "Experience", icon: Briefcase, id: "experience" },
  { label: "Ask me", icon: ChatCircleDots, id: "ask" },
  { label: "Live status", icon: Broadcast, id: "status" },
  { label: "Contact", icon: EnvelopeSimple, id: "contact" },
];

const links: Item[] = [
  { label: "Résumé", icon: FileText, href: profile.resume },
  { label: "GitHub", icon: GithubLogo, href: profile.github },
  { label: "LinkedIn", icon: LinkedinLogo, href: profile.linkedin },
];

/** macOS-style dock: icons grow as the pointer gets close, labels appear on hover. */
export function Dock() {
  const mouseX = useMotionValue(Infinity);
  const active = useActiveSection(items.map((i) => i.id!));

  return (
    <nav
      data-print-hide
      aria-label="Sections"
      className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4"
    >
      <motion.div
        onMouseMove={(e) => mouseX.set(e.pageX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className="flex h-14 items-end gap-1.5 rounded-full border border-line bg-surface/85 px-2.5 pb-2 shadow-soft backdrop-blur-md"
      >
        {items.map((item) => (
          <DockIcon key={item.label} item={item} mouseX={mouseX} active={active === item.id} />
        ))}
        {/* On phones the dock keeps only the sections; these links live in the footer and ⌘K too. */}
        <span className="mx-1 mb-1.5 hidden h-7 w-px self-end bg-line-strong sm:block" aria-hidden />
        <div className="hidden items-end gap-1.5 sm:flex">
          {links.map((item) => (
            <DockIcon key={item.label} item={item} mouseX={mouseX} />
          ))}
        </div>
      </motion.div>
    </nav>
  );
}

function DockIcon({ item, mouseX, active }: { item: Item; mouseX: MotionValue<number>; active?: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const reduce = useReducedMotion();
  const distance = useTransform(mouseX, (x) => {
    const b = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return x - b.x - b.width / 2;
  });
  const sizeRaw = useTransform(distance, [-120, 0, 120], [38, reduce ? 38 : 58, 38]);
  const size = useSpring(sizeRaw, { mass: 0.1, stiffness: 170, damping: 14 });
  const external = item.href && !item.href.startsWith("/");
  const Icon = item.icon;

  return (
    <motion.a
      ref={ref}
      href={item.href ?? `#${item.id}`}
      onClick={(e) => {
        if (item.id) {
          e.preventDefault();
          scrollToId(item.id);
        }
      }}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      aria-label={item.label}
      aria-current={active ? "true" : undefined}
      style={{ width: size, height: size }}
      className="group relative grid place-items-center rounded-full bg-surface-2 text-ink-2 transition-colors hover:text-ink aria-[current=true]:bg-accent aria-[current=true]:text-on-accent"
    >
      <Icon className="size-[45%]" weight={active ? "fill" : "regular"} />
      <span className="pointer-events-none absolute -top-9 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink opacity-0 shadow-soft transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {item.label}
      </span>
    </motion.a>
  );
}

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-35% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);
  return active;
}
