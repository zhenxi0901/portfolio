import { SiteShell } from "@/components/site/site-shell";
import { Research } from "@/components/research/research";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Research: ARIES agent benchmarks",
  description: "My final-year project at NTU HyScale Lab: what it costs to serve long-running LLM agents, from 320 runs on a hosted API and an A100.",
  path: "/research",
});

export default function ResearchPage() {
  return (
    <SiteShell path="/research" title="Research: ARIES agent benchmarks">
      <Research />
    </SiteShell>
  );
}
