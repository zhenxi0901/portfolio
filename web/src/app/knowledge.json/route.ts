import { buildKnowledge } from "@/content/knowledge";

// Emitted as a static file at build time (no request data is used).
export const dynamic = "force-static";

export function GET() {
  return Response.json({ facts: buildKnowledge() });
}
