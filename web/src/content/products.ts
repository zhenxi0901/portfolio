// The three systems ZhenXi runs at Primustech, named by what they do rather than by internal
// product names, so a first-time visitor can tell which card or box belongs to which.

export type ProductKey = "iot" | "agent" | "docs";

export type Product = { name: string; what: string; runs: string; anchor: string };

export const products: Record<ProductKey, Product> = {
  iot: {
    name: "Building IoT platform",
    what: "Collects live data from building systems (sensors, HVAC, meters) and serves the dashboards and alarms facility teams use.",
    runs: "Kubernetes on GKE",
    anchor: "platform",
  },
  agent: {
    name: "Operations agent",
    what: "An AI assistant that answers a facility manager's questions from the IoT platform's live data.",
    runs: "AI agents on Cloud Run",
    anchor: "ai",
  },
  docs: {
    name: "Document assistant",
    what: "Answers questions from a company's own documents, such as rate schedules and HR policies, and cites them.",
    runs: "RAG on Cloud Run",
    anchor: "ai",
  },
};

export const productOrder: ProductKey[] = ["iot", "agent", "docs"];
