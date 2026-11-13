import { incidents } from "@/content/status";
import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";

export const alt = "Status of Li ZhenXi's portfolio";
export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

export default function Image() {
  return ogImage({
    eyebrow: "Status · measured from outside",
    eyebrowColor: ogTone.accent,
    title: "Is this site up? Live state, 30 days of availability and every incident.",
    summary: "Uptime checks every minute from three continents against a 99.9% SLO, scheduled end-to-end checks, and a feed of incidents.",
    stats: [
      { value: "99.9%", label: "objective over 30 days" },
      { value: "3", label: "regions checking every minute" },
      { value: String(incidents.length), label: "incidents, each with a write-up" },
    ],
  });
}
