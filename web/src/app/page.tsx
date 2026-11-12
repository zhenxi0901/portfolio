import { TopBar } from "@/components/site/top-bar";
import { Dock } from "@/components/site/dock";
import { Footer } from "@/components/site/footer";
import { Hero } from "@/components/hero/hero";
import { Now } from "@/components/home/now";
import { Chapters } from "@/components/home/chapters";
import { Explore } from "@/components/home/explore";
import { Latest } from "@/components/home/latest";
import { Tour } from "@/components/site/tour";
import { Contact } from "@/components/sections/contact";
import { LegacyAnchors } from "@/components/home/legacy-anchors";

// Set here rather than in the layout, so the 404 page does not claim to be the home page.
export const metadata = { alternates: { canonical: "/" } };

/**
 * The home page says who I am, what I am doing now, and where everything is: one card per
 * chapter, the ways into the site's own operations, the latest writing, and how to get in touch.
 * Everything else has a page of its own (decision 11); the one-page version is kept at /v1.
 */
export default function Home() {
  return (
    <>
      <a
        href="#chapters"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Skip to content
      </a>
      <TopBar />
      <main>
        <Hero />
        <Now />
        <Chapters />
        <Explore />
        <Latest />
        <Contact />
      </main>
      <Footer />
      <Dock />
      <Tour />
      <LegacyAnchors />
    </>
  );
}
