import { falseClaim, testedClaims } from "@/content/evidence";

// Emitted as a static file at build time: what the site claims, with the numbers in it, for the tests in
// /claims. They test what the live site says, not what the repository would say.
export const dynamic = "force-static";

export function GET() {
  return Response.json({ claims: testedClaims, false_claim: falseClaim });
}
