import { SiteShell } from "@/components/site/site-shell";
import { AiInfra } from "@/components/ai/ai-infra";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "The AI agent platform",
  description: "The AI agent platform I run on Cloud Run: two agents for facility teams, followed request by request through RAG, models and traces.",
  path: "/ai",
});

export default function AiPage() {
  return (
    <SiteShell path="/ai" title="The AI agent platform">
      <AiInfra />
    </SiteShell>
  );
}
