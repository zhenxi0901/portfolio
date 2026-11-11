import { proofCounts } from "@/content/evidence";
import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";

export const alt = "Where the claims on Li ZhenXi's portfolio come from";
export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

export default function Image() {
  return ogImage({
    eyebrow: "Evidence · claims and their proof",
    eyebrowColor: ogTone.accent,
    title: "Don't take my word for it.",
    summary: "Every headline claim on this site, sorted by how you can check it: live, on public record, or private and labelled as such.",
    stats: [
      { value: String(proofCounts.live), label: "you can check right now" },
      { value: String(proofCounts.public), label: "on public record" },
      { value: String(proofCounts.private), label: "private, and said so" },
    ],
  });
}
