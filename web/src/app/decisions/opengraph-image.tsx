import { decisions } from "@/content/decisions";
import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";

export const alt = "Architecture decision records for Li ZhenXi's portfolio";
export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

export default function Image() {
  return ogImage({
    eyebrow: "Architecture decision records",
    eyebrowColor: ogTone.accent,
    title: "Why this site is built the way it is, and what each choice costs.",
    summary: "Cloud Run over GKE, one Go binary, build once and check before traffic, an SLO measured from outside, and an error budget that gates releases.",
    stats: [
      { value: String(decisions.length), label: "decisions on record" },
      { value: "4", label: "direct Go dependencies" },
      { value: "0", label: "long-lived credentials" },
    ],
  });
}
