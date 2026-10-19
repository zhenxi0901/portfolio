import delivery from "@/content/generated/delivery.json";

// Emitted as a static file at build time. The Go server reads it at startup for the live profile
// card (/api/card.svg), so the card can show delivery numbers without calling GitHub.
export const dynamic = "force-static";

export function GET() {
  return Response.json(delivery);
}
