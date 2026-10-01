import { TopBar } from "@/components/site/top-bar";
import { Dock } from "@/components/site/dock";
import { Footer } from "@/components/site/footer";
import { Hero } from "@/components/hero/hero";
import { Impact } from "@/components/sections/impact";
import { Work } from "@/components/work/work";
import { Platform } from "@/components/platform/platform";
import { Research } from "@/components/research/research";
import { StackMarquee } from "@/components/sections/stack-marquee";
import { Experience } from "@/components/sections/experience";
import { Ask } from "@/components/sections/ask";
import { Status } from "@/components/sections/status";
import { Contact } from "@/components/sections/contact";

export default function Home() {
  return (
    <>
      <a
        href="#work"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Skip to content
      </a>
      <TopBar />
      <main>
        <Hero />
        <Impact />
        <Work />
        <Platform />
        <Research />
        <StackMarquee />
        <Experience />
        <Ask />
        <Status />
        <Contact />
      </main>
      <Footer />
      <Dock />
    </>
  );
}
