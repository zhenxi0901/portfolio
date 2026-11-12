import { SiteShell } from "@/components/site/site-shell";
import { Writing } from "@/components/sections/writing";
import { Postmortems } from "@/components/sections/postmortems";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Writing and postmortems",
  description: "Posts on serving LLM agents, running a benchmark without root and finding a metrics bill, and blameless postmortems of what broke while I built and ran this site.",
  path: "/writing",
});

export default function WritingPage() {
  return (
    <SiteShell path="/writing" title="Writing and postmortems">
      <Writing />
      <Postmortems />
    </SiteShell>
  );
}
