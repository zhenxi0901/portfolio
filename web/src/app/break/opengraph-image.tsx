import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";

export const alt = "Break it yourself: fault injection on Li ZhenXi's live server";
export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

export default function Image() {
  return ogImage({
    eyebrow: "Break it yourself · the Go server on Cloud Run",
    eyebrowColor: ogTone.accent,
    title: "Real faults on a live server, and four ways a client copes",
    summary: "Pick the delays and 503s, send real requests, and watch give-up, retries with jitter, a circuit breaker and hedging handle them, attempt by attempt.",
    stats: [
      {
        "value": "4",
        "label": "client strategies"
      },
      {
        "value": "200 ms",
        "label": "between arrivals"
      },
      {
        "value": "0",
        "label": "effect on the site's SLO"
      }
    ],
  });
}
