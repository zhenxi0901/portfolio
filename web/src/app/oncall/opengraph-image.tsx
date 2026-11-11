import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";

export const alt = "You're on call: incident drills by Li ZhenXi";
export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

export default function Image() {
  return ogImage({
    eyebrow: "Incident drills · IoT and AI platforms",
    eyebrowColor: ogTone.critical,
    title: "You're on call. Pick an incident.",
    summary:
      "Stale telemetry on a building IoT platform at 02:14, or slow answers from an AI document assistant at 10:42. Investigate, stop the error budget burning, and get your own postmortem.",
    stats: [
      { value: "2", label: "incidents, one per platform" },
      { value: "14.4x", label: "the burn rate that pages you" },
      { value: "1", label: "postmortem, written from your moves" },
    ],
  });
}
