import { SiteShell } from "@/components/site/site-shell";
import { AiInfra } from "@/components/ai/ai-infra";
import { aiIntro } from "@/content/ai-platform";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "The AI agent platform",
  description: `${aiIntro} Follow a request through it, see the AI infrastructure layer by layer, and the numbers.`,
  path: "/ai",
});

export default function AiPage() {
  return (
    <SiteShell path="/ai" title="The AI agent platform">
      <AiInfra />
    </SiteShell>
  );
}
