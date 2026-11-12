"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  Brain,
  Buildings,
  EnvelopeSimple,
  Flask,
  GithubLogo,
  House,
  IdentificationCard,
  LinkedinLogo,
  PencilSimpleLine,
  type Icon,
} from "@phosphor-icons/react";
import { profile } from "@/content/profile";
import { chapterOf } from "@/lib/sections";
import { cn, scrollToId } from "@/lib/utils";

/** `section` makes an item a jump to a part of a page rather than to a page. */
type Item = { label: string; icon: Icon; href: string; section?: string };

// The chapters, one per page since the home page was split (decision 11), and the way to get in touch.
const items: Item[] = [
  { label: "Home", icon: House, href: "/", section: "top" },
  { label: "IoT platform", icon: Buildings, href: "/iot" },
  { label: "AI agent platform", icon: Brain, href: "/ai" },
  { label: "Research", icon: Flask, href: "/research" },
  { label: "Writing", icon: PencilSimpleLine, href: "/writing" },
  { label: "About", icon: IdentificationCard, href: "/about" },
  { label: "Contact", icon: EnvelopeSimple, href: "/#contact", section: "contact" },
];

const links: Item[] = [
  { label: "GitHub", icon: GithubLogo, href: profile.github },
  { label: "LinkedIn", icon: LinkedinLogo, href: profile.linkedin },
];

/** macOS-style dock: icons grow as the pointer gets close, labels appear on hover. */
export function Dock() {
  const mouseX = useMotionValue(Infinity);
  const path = usePathname();
  const chapter = chapterOf(path);

  return (
    <nav data-print-hide aria-label="Pages" className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <motion.div
        onMouseMove={(e) => mouseX.set(e.pageX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className="flex h-14 items-end gap-1 rounded-full border border-line bg-surface/85 px-2 pb-2 shadow-soft backdrop-blur-md sm:gap-1.5 sm:px-2.5"
      >
        {items.map((item) => (
          <DockIcon key={item.label} item={item} mouseX={mouseX} current={item.href === chapter ? (item.href === path ? "page" : "true") : undefined} />
        ))}
        {/* On phones the dock keeps only the pages; these links live in the footer and ⌘K too. */}
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

/** `current` is "page" on the chapter itself and "true" on a page inside it (a case study is in its product's chapter). */
function DockIcon({ item, mouseX, current }: { item: Item; mouseX: MotionValue<number>; current?: "page" | "true" }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const reduce = useReducedMotion();
  const distance = useTransform(mouseX, (x) => {
    const b = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return x - b.x - b.width / 2;
  });
  const sizeRaw = useTransform(distance, [-120, 0, 120], [38, reduce ? 38 : 58, 38]);
  const size = useSpring(sizeRaw, { mass: 0.1, stiffness: 170, damping: 14 });
  const external = !item.href.startsWith("/");
  const Icon = item.icon;

  return (
    <motion.a
      ref={ref}
      href={item.href}
      onClick={(e) => {
        // A jump scrolls smoothly where the section is on this page (and takes focus there, so the
        // next Tab goes on from it), and goes to its page otherwise.
        if (item.section) {
          e.preventDefault();
          scrollToId(item.section, { focus: true });
        }
      }}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      aria-label={item.label}
      aria-current={current}
      style={{ width: size, height: size }}
      // Phones get smaller icons so all of them fit; !important beats the inline hover size.
      className="group relative grid place-items-center rounded-full bg-surface-2 text-ink-2 transition-colors hover:text-ink aria-[current=page]:bg-accent aria-[current=page]:text-on-accent aria-[current=true]:bg-accent aria-[current=true]:text-on-accent max-sm:size-[31px]!"
    >
      <Icon className="size-[45%]" weight={current ? "fill" : "regular"} />
      {/* Phones have no hover: the current chapter's name shows above its icon there. */}
      <span
        className={cn(
          "pointer-events-none absolute -top-9 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink opacity-0 shadow-soft transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
          current && "max-sm:opacity-100",
        )}
      >
        {item.label}
      </span>
    </motion.a>
  );
}
