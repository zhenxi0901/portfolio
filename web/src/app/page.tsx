import { TopBar } from "@/components/site/top-bar";
import { Dock } from "@/components/site/dock";
import { Footer } from "@/components/site/footer";
import { Hero } from "@/components/hero/hero";
import { Now } from "@/components/home/now";
import { Chapters } from "@/components/home/chapters";
import { OpsLedger } from "@/components/home/ops-ledger";
import { Latest } from "@/components/home/latest";
import { Tour } from "@/components/site/tour";
import { Contact } from "@/components/sections/contact";
import { LegacyAnchors } from "@/components/home/legacy-anchors";

// Set here rather than in the layout, so the 404 page does not claim to be the home page.
export const metadata = { alternates: { canonical: "/" } };

/**
 * The home page says who I am (beside this page's own request, live), what I am doing now, and where
 * everything is: the three chapters, a ledger of the site's own operations, the latest writing, and
 * how to get in touch.
 * Everything else has a page of its own (decision 11); the one-page version is kept at /v1.
 */
export default function Home() {
  return (
    <>
      {/* First, so an old /#section link moves on before the rest of the page loads. */}
      <LegacyAnchors />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Skip to content
      </a>
      <TopBar />
      <main id="main">
        <Hero />
        <Now />
        <Chapters />
        <OpsLedger />
        <Latest />
        <Contact />
      </main>
      <Footer />
      <Dock />
      <Tour />
    </>
  );
}
