import { agentTools } from "@/content/agents";
import { ogContentType, ogImage, ogSize, ogTone } from "@/lib/og";

export const alt = "Li ZhenXi's portfolio as an MCP server";
export const size = ogSize;
export const contentType = ogContentType;
// Static export: rendered once at build time.
export const dynamic = "force-static";

export default function Image() {
  return ogImage({
    eyebrow: "For agents · Model Context Protocol",
    eyebrowColor: ogTone.accent,
    title: "Ask my site with your own agent.",
    summary: "This portfolio is also an MCP server: add one URL to Claude, Cursor or any MCP client and ask about my work. No key, read-only.",
    stats: [
      { value: String(agentTools.length), label: "read-only tools" },
      { value: "2", label: "protocol eras served" },
      { value: "0", label: "models on my side" },
    ],
  });
}
