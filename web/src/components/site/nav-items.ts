// The site's pages and the sections inside them, in reading order. The dock and the top bar list the
// pages; the command palette lists both, and finds each section on its page through lib/sections.

export const pages = [
  { href: "/", label: "Home" },
  { href: "/iot", label: "IoT platform" },
  { href: "/ai", label: "AI platform" },
  { href: "/research", label: "Research" },
  { href: "/writing", label: "Writing" },
  { href: "/about", label: "About" },
];

// `keywords` let the palette find a section by what is in it, not only by its name.
export const sections = [
  { id: "top", label: "Home", keywords: ["start", "top", "intro", "home"] },
  {
    id: "work",
    label: "IoT platform: case studies",
    keywords: ["work", "projects", "cases", "gke", "kubernetes", "pipeline", "ci/cd", "terraform", "kafka"],
  },
  {
    id: "platform",
    label: "Inside the IoT platform",
    keywords: ["iot", "gke", "kubernetes", "traffic", "monitoring", "slo", "sli", "sla", "error budget", "alerts", "grafana", "cost", "finops"],
  },
  { id: "ai", label: "AI agent platform", keywords: ["ai", "agents", "llm", "rag", "gpu", "langfuse", "milvus", "vertex", "inference", "trace"] },
  { id: "research", label: "Research", keywords: ["fyp", "aries", "benchmark", "sglang", "a100", "prefix cache", "iccv", "pvchat", "paper"] },
  { id: "writing", label: "Writing", keywords: ["blog", "posts", "articles", "notes", "prefix cache", "kafka", "metrics bill"] },
  {
    id: "postmortems",
    label: "Postmortems",
    keywords: ["incident", "outage", "rca", "root cause", "blameless", "near miss", "on-call", "what went wrong"],
  },
  { id: "about", label: "About", keywords: ["about", "bio", "who", "background", "stack", "tools"] },
  { id: "experience", label: "Experience", keywords: ["jobs", "primustech", "engie", "internship", "education", "ntu"] },
  { id: "ask", label: "Ask me", keywords: ["question", "chat", "search", "rag"] },
  { id: "status", label: "Live status", keywords: ["uptime", "latency", "live", "trace", "cold start", "server", "dora", "deploys"] },
  { id: "contact", label: "Contact", keywords: ["email", "hire", "message", "reach"] },
];
