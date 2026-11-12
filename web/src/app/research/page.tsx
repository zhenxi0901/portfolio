import { SiteShell } from "@/components/site/site-shell";
import { Research } from "@/components/research/research";
import { products } from "@/content/products";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Research: ARIES agent benchmarks",
  description: `My final-year project at NTU HyScale Lab. ${products.aries.what} 320 long agent runs, on a hosted API and on an A100.`,
  path: "/research",
});

export default function ResearchPage() {
  return (
    <SiteShell path="/research" title="Research: ARIES agent benchmarks">
      <Research />
    </SiteShell>
  );
}
