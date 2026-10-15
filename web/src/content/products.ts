// What ZhenXi works on, named by what each thing is rather than by internal product names, so a
// first-time visitor can tell which card or box belongs to which. Two Primustech products and the
// final-year project.

export type ProductKey = "iot" | "ai" | "aries";

export type Product = { name: string; org: string; what: string; runs: string; anchor: string };

export const products: Record<ProductKey, Product> = {
  iot: {
    name: "Building IoT platform",
    org: "Primustech",
    what: "Collects live data from building systems (sensors, HVAC, meters) and serves the dashboards and alarms facility teams use.",
    runs: "Kubernetes on GKE",
    anchor: "platform",
  },
  ai: {
    name: "AI agent platform",
    org: "Primustech",
    what: "Two AI agents for facility teams: one answers from the IoT platform's live data, the other from company documents.",
    runs: "Agents and RAG on Cloud Run",
    anchor: "ai",
  },
  aries: {
    name: "ARIES agent benchmarks",
    org: "NTU HyScale Lab, final-year project",
    what: "Making the lab's open-source agent-serving framework run long agent tasks, then measuring what serving them costs.",
    runs: "SGLang on an A100, Google Cloud VM",
    anchor: "research",
  },
};

export const productOrder: ProductKey[] = ["iot", "ai", "aries"];
