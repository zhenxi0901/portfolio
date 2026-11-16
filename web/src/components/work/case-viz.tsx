import { GkeViz } from "@/components/work/viz-gke";
import { PipelineViz } from "@/components/work/viz-pipeline";
import { ReaperViz } from "@/components/work/viz-reaper";
import { AlertsViz } from "@/components/work/viz-alerts";
import { AiViz } from "@/components/work/viz-ai";
import { ControlViz } from "@/components/work/viz-control";
import { TwoStepViz } from "@/components/work/viz-twostep";

/**
 * What each model is and what to try in it, said once per model (one caption for all seven read like
 * boilerplate). Shown above the model on its card and on its own page.
 */
export const caseModelNote: Record<string, string> = {
  gke: "Raise the traffic and watch pods scale, then nodes, across three zones. Before shows the single VM it replaced.",
  pipeline: "Run a change through the release gates. Make a stage fail, and nothing after it runs.",
  reaper: "Every topic in the cluster, one dot each. Run the reaper and the orphans go in one sweep.",
  observability: "A three-node ZooKeeper ensemble. Take one node down and the quorum holds; take two and the alert pages.",
  control: "One air-conditioning unit behind the control lane. Send it a command and see which guard answers; try the DRY_RUN typo too.",
  "two-step": "Giving a live cache a password takes two releases. Flip the switches in either order and see which order breaks every client.",
  "ai-platform": "A request's path through the AI products, with a packet riding it hop by hop.",
};

/** The working model that goes with each case, on its card and on its own page. */
export const caseViz: Record<string, () => React.ReactNode> = {
  gke: GkeViz,
  pipeline: PipelineViz,
  reaper: ReaperViz,
  observability: AlertsViz,
  control: ControlViz,
  "two-step": TwoStepViz,
  "ai-platform": AiViz,
};
