import { GkeViz } from "@/components/work/viz-gke";
import { PipelineViz } from "@/components/work/viz-pipeline";
import { ReaperViz } from "@/components/work/viz-reaper";
import { AlertsViz } from "@/components/work/viz-alerts";
import { AiViz } from "@/components/work/viz-ai";

/** The working model that goes with each case, on its card and on its own page. */
export const caseViz: Record<string, () => React.ReactNode> = {
  gke: GkeViz,
  pipeline: PipelineViz,
  reaper: ReaperViz,
  observability: AlertsViz,
  "ai-platform": AiViz,
};
