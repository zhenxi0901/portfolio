// Sections, in page order. `keywords` let the command palette find a section by what is in it,
// not only by its name.
export const sections = [
  { id: "top", label: "Home", keywords: ["start", "top", "intro"] },
  { id: "work", label: "Work", keywords: ["projects", "cases", "products", "gke", "kubernetes", "pipeline", "ci/cd"] },
  {
    id: "platform",
    label: "IoT platform",
    keywords: ["iot", "gke", "kubernetes", "traffic", "monitoring", "slo", "sli", "sla", "error budget", "alerts", "grafana", "cost", "finops"],
  },
  { id: "ai", label: "AI agent platform", keywords: ["ai", "agents", "llm", "rag", "gpu", "langfuse", "milvus", "vertex", "inference", "trace"] },
  { id: "research", label: "Research", keywords: ["fyp", "aries", "benchmark", "sglang", "a100", "prefix cache", "iccv", "pvchat", "paper"] },
  { id: "experience", label: "Experience", keywords: ["jobs", "primustech", "engie", "internship", "education", "ntu"] },
  { id: "ask", label: "Ask me", keywords: ["question", "chat", "search"] },
  { id: "status", label: "Live status", keywords: ["uptime", "latency", "live", "trace", "cold start", "server"] },
  { id: "writing", label: "Writing", keywords: ["blog", "posts", "articles", "notes", "prefix cache", "kafka", "metrics bill"] },
  {
    id: "postmortems",
    label: "Postmortems",
    keywords: ["incident", "outage", "rca", "root cause", "blameless", "near miss", "on-call", "what went wrong"],
  },
  { id: "contact", label: "Contact", keywords: ["email", "hire", "message", "reach"] },
];
