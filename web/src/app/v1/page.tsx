import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { TopBar } from "@/components/site/top-bar";
import { Dock } from "@/components/site/dock";
import { Footer } from "@/components/site/footer";
import { Hero } from "@/components/hero/hero";
import { Impact } from "@/components/sections/impact";
import { Work } from "@/components/work/work";
import { Platform } from "@/components/platform/platform";
import { AiInfra } from "@/components/ai/ai-infra";
import { Research } from "@/components/research/research";
import { StackMarquee } from "@/components/sections/stack-marquee";
import { Experience } from "@/components/sections/experience";
import { Ask } from "@/components/sections/ask";
import { Status } from "@/components/sections/status";
import { Postmortems } from "@/components/sections/postmortems";
import { Writing } from "@/components/sections/writing";
import { Contact } from "@/components/sections/contact";
import { pageMetadata } from "@/lib/page-metadata";

// Kept on purpose, like a tagged release: the site as one long page, as it was until 12 Nov 2026.
// It asks not to be indexed, with its own canonical so the two signals agree, and shares with the
// home page's card.
const base = pageMetadata({
  title: "Version 1: the one-page site",
  description: "This portfolio as it was until 12 November 2026: every section on one long page. The current site splits it into chapters.",
  path: "/v1",
});
export const metadata = {
  ...base,
  robots: { index: false, follow: true },
  openGraph: { ...base.openGraph, images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
};

export default function VersionOne() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Skip to content
      </a>
      <TopBar />
      <main id="main">
        <aside aria-label="About this version" className="mx-auto max-w-[1320px] px-4 pt-24 sm:px-8">
          <p className="rounded-3xl border border-dashed border-line-strong bg-surface p-5 text-[15px] leading-relaxed text-ink-2">
            <span className="font-semibold text-ink">Version 1, kept as a record.</span> Until 12 November 2026 everything was on this one page,
            23 screens of it. The site now splits it into chapters; <a href="/decisions#chapters-not-one-page" className="underline underline-offset-4 hover:text-ink">decision 11</a> says why.{" "}
            <a href="/" className="inline-flex items-center gap-1 font-medium text-ink underline decoration-accent-ink decoration-2 underline-offset-4">
              The current site <ArrowRight size={13} aria-hidden />
            </a>
          </p>
        </aside>
        <Hero work="#work" legacy />
        <Impact />
        <Work />
        <Platform />
        <AiInfra />
        <Research />
        <StackMarquee />
        <Experience />
        <Ask />
        <Status />
        <Postmortems />
        <Writing />
        <Contact />
      </main>
      <Footer />
      <Dock />
    </>
  );
}
