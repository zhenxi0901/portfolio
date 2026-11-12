import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";
import { education, experience, profile } from "@/content/profile";

export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

export const alt = "About Li ZhenXi";

export default function Image() {
  return ogImage({
    eyebrow: `About · ${profile.availability}`,
    eyebrowColor: ogTone.accent,
    title: profile.name,
    summary: profile.intro,
    stats: [
      { value: education.period.split(" - ")[1], label: `graduating, ${education.degree}` },
      { value: String(experience.length), label: "roles, from a building's control room to Kubernetes" },
    ],
  });
}
