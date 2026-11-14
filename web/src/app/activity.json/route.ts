import activity from "@/content/generated/activity.json";

// Emitted as a static file at build time. The Go server reads it at startup as the starting point of
// the home page's "Recently" list (/api/activity), and keeps serving it until, and whenever, GitHub
// cannot be read.
export const dynamic = "force-static";

export function GET() {
  return Response.json(activity);
}
