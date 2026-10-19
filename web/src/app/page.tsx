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
import { Tour } from "@/components/site/tour";
import { Contact } from "@/components/sections/contact";

// Set here rather than in the layout, so the 404 page does not claim to be the home page.
export const metadata = { alternates: { canonical: "/" } };

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
      <Tour />
    </>
  );
}
