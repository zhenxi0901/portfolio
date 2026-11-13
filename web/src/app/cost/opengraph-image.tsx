import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";

export const alt = "What Li ZhenXi's portfolio costs to run";
export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

export default function Image() {
  return ogImage({
    eyebrow: "Cloud Run · request-based billing · Singapore",
    eyebrowColor: ogTone.accent,
    title: "What this site costs to run, from its own meters.",
    summary: "This month's bill as a receipt at Google's list prices, where the money goes, and what a busy day would do to it.",
    stats: [
      {
        "value": "< US$1",
        "label": "a month to pay so far"
      },
      {
        "value": "3",
        "label": "instances at most"
      },
      {
        "value": "1 h",
        "label": "between meter reads"
      }
    ],
  });
}
