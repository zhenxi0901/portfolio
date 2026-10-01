import { cases } from "@/content/profile";
import { SectionHeading } from "@/components/site/section-heading";
import { CaseCard } from "@/components/work/case-card";
import { GkeViz } from "@/components/work/viz-gke";
import { PipelineViz } from "@/components/work/viz-pipeline";
import { ReaperViz } from "@/components/work/viz-reaper";
import { AlertsViz } from "@/components/work/viz-alerts";
import { AibeViz } from "@/components/work/viz-aibe";

const byId = Object.fromEntries(cases.map((c) => [c.id, c]));

export function Work() {
  return (
    <section id="work" className="mx-auto max-w-[1320px] scroll-mt-20 px-4 py-24 sm:px-8 sm:py-32">
      <SectionHeading
        title={
          <>
            Production work you can <span className="text-accent-ink">play with</span>.
          </>
        }
        lead="Five things I shipped at Primustech. Each card is a small working model of the real system. Press the buttons."
      />
      <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:grid-rows-[auto_auto_auto]">
        <CaseCard study={byId.gke} tone="dots" className="lg:col-span-7 lg:row-span-2">
          <GkeViz />
        </CaseCard>
        <CaseCard study={byId.pipeline} tone="raised" className="lg:col-span-5">
          <PipelineViz />
        </CaseCard>
        <CaseCard study={byId.reaper} className="lg:col-span-5">
          <ReaperViz />
        </CaseCard>
        <CaseCard study={byId.observability} tone="raised" className="lg:col-span-5">
          <AlertsViz />
        </CaseCard>
        <CaseCard study={byId.aibe} tone="tint" className="lg:col-span-7">
          <AibeViz />
        </CaseCard>
      </div>
    </section>
  );
}
