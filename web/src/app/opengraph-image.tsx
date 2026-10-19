import { ogContentType, ogImage, ogSize } from "@/lib/og";

export const alt = "Li ZhenXi: SRE, cloud and AI infrastructure";
export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

export default function Image() {
  return ogImage({
    eyebrow: "Open to 2027 roles",
    title: "Li ZhenXi",
    summary: "I run cloud platforms in production and benchmark AI infrastructure.",
    big: true,
    stats: [
      { value: "~15%", label: "cloud spend cut" },
      { value: "63", label: "PRs merged into a production pipeline" },
      { value: "320", label: "LLM agent runs benchmarked" },
    ],
  });
}
