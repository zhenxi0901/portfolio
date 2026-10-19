import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";

export const alt = "You're on call: an incident drill by Li ZhenXi";
export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

export default function Image() {
  return ogImage({
    eyebrow: "Incident drill · building IoT platform",
    eyebrowColor: ogTone.critical,
    title: "You're on call. It's 02:14 and the pager goes off.",
    summary: "Investigate with the real dashboards and runbook, stop the error budget burning, and get your own postmortem.",
    stats: [
      { value: "14.4x", label: "burn rate when the page fires" },
      { value: "6", label: "dashboards, plus the logs and the runbook" },
      { value: "1", label: "postmortem, written from your moves" },
    ],
  });
}
