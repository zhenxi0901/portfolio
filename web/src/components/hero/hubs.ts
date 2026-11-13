// The systems in the hero constellation and where each one jumps to. Shared by the 3D scene and
// the static version phones get, so neither pulls the other in.

export type Hub = { label: string; target: string };

export const HUBS: Hub[] = [
  { label: "GKE", target: "case-gke" },
  { label: "Terraform", target: "case-gke" },
  { label: "Kafka", target: "case-reaper" },
  { label: "Cloud Build", target: "case-pipeline" },
  { label: "Grafana", target: "case-observability" },
  { label: "Prometheus", target: "case-observability" },
  { label: "Cloud Run", target: "case-ai-platform" },
  { label: "Vertex AI", target: "case-ai-platform" },
  { label: "SGLang", target: "research" },
  { label: "A100", target: "research" },
  { label: "ARIES", target: "research" },
  { label: "PVChat", target: "research" },
  { label: "SCADA", target: "experience" },
  { label: "MQTT", target: "experience" },
];
