// The server's text card (api/internal/card) colours itself with a handful of ANSI codes. This turns
// them into styled runs, for the places the site shows that text in a page.
import { cn } from "@/lib/utils";

export type AnsiRun = { text: string; cls: string };

const ESC = String.fromCharCode(27) + "[";
// Both greens map to the accent ink: it holds its contrast on a light background, where --good does not.
const COLOURS: Record<string, string> = { "31": "font-medium text-critical", "32": "font-medium text-accent-ink", "33": "font-medium text-p-ai", "38;5;155": "text-accent-ink" };

export function parseAnsi(raw: string): AnsiRun[] {
  const runs: AnsiRun[] = [];
  let bold = false;
  let dim = false;
  let colour = "";
  raw.split(ESC).forEach((chunk, i) => {
    let text = chunk;
    if (i > 0) {
      const end = chunk.indexOf("m");
      const code = chunk.slice(0, end);
      text = chunk.slice(end + 1);
      if (code === "0" || code === "") {
        bold = dim = false;
        colour = "";
      } else if (code === "1") bold = true;
      else if (code === "2") dim = true;
      else colour = COLOURS[code] ?? colour;
    }
    if (text) runs.push({ text, cls: cn(bold && "font-semibold text-ink", dim && "text-ink-3", colour) });
  });
  return runs;
}
