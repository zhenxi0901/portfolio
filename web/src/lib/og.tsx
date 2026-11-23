import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE_URL } from "@/lib/site";

// Share cards (Open Graph images), rendered once at build time in the site's own type and colours:
// IBM Plex, ink on near-black, and lime only for the one thing that stands for live (the request path).

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

const C = {
  bg: "#0a0a0c",
  surface: "#141418",
  line: "#2a2a30",
  ink: "#f2f2f0",
  ink2: "#b4b4bb",
  ink3: "#8e8e97",
  live: "#c2f75c",
};

/** Product colours, as on the site in dark mode. */
export const ogTone = { iot: "#38bdf8", ai: "#fbbf24", aries: "#a78bfa", critical: "#f87171", accent: C.ink3 } as const;

const font = (pkg: string, file: string) => readFile(join(process.cwd(), "node_modules/@fontsource", pkg, "files", file));

async function fonts() {
  const [regular, medium, semibold, mono] = await Promise.all([
    font("ibm-plex-sans", "ibm-plex-sans-latin-400-normal.woff"),
    font("ibm-plex-sans", "ibm-plex-sans-latin-500-normal.woff"),
    font("ibm-plex-sans", "ibm-plex-sans-latin-600-normal.woff"),
    font("ibm-plex-mono", "ibm-plex-mono-latin-400-normal.woff"),
  ]);
  return [
    { name: "Plex", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Plex", data: medium, weight: 500 as const, style: "normal" as const },
    { name: "Plex", data: semibold, weight: 600 as const, style: "normal" as const },
    { name: "Plex Mono", data: mono, weight: 400 as const, style: "normal" as const },
  ];
}

export type OgCard = {
  /** Small line above the title, e.g. "Case study · Building IoT platform". */
  eyebrow: string;
  eyebrowColor?: string;
  title: string;
  summary?: string;
  stats?: { value: string; label: string }[];
  /** The home card has a much bigger title. */
  big?: boolean;
};

/** Home card only: the request path the home page draws live, as four stops on a lime line. */
function RequestPath() {
  const stops = ["You", "Google front end", "Cloud Run", "This page"];
  return (
    <div style={{ position: "absolute", top: 70, right: 72, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0 }}>
      {stops.map((s, i) => (
        <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div
            style={{
              display: "flex",
              border: `2px solid ${i === 1 ? C.line : C.live}`,
              borderRadius: 10,
              padding: "8px 16px",
              fontSize: 22,
              fontWeight: 500,
              color: C.ink,
              background: C.surface,
            }}
          >
            {s}
          </div>
          {i < stops.length - 1 && <div style={{ width: 2, height: 22, background: C.live, marginRight: 40 }} />}
        </div>
      ))}
    </div>
  );
}

/** A figure as the site writes it. Its arrow is drawn: Plex's latin file has none, and one borrowed from another font makes this line taller than the rest. */
function Figure({ value }: { value: string }) {
  const [from, to] = value.split(" → ");
  return (
    <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.3, display: "flex", alignItems: "center", gap: 14 }}>
      <span>{from}</span>
      {to && (
        <svg width="34" height="20" viewBox="0 0 34 20" fill="none" stroke={C.ink} strokeWidth="4">
          <path d="M1 10h29M22 2l8 8-8 8" />
        </svg>
      )}
      {to && <span>{to}</span>}
    </div>
  );
}

export async function ogImage({ eyebrow, eyebrowColor = C.ink3, title, summary, stats = [], big = false }: OgCard) {
  const host = new URL(SITE_URL).host;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: C.bg,
          color: C.ink,
          fontFamily: "Plex",
          padding: "64px 72px 56px",
          position: "relative",
        }}
      >
        {big && <RequestPath />}
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, fontWeight: 500, color: C.ink2 }}>
          <div style={{ width: 5, height: 24, borderRadius: 2, background: eyebrowColor }} />
          {eyebrow}
        </div>
        <div
          style={{
            marginTop: big ? 26 : 30,
            fontSize: big ? 112 : title.length > 42 ? 54 : 62,
            fontWeight: 600,
            letterSpacing: big ? "-0.035em" : "-0.025em",
            lineHeight: big ? 1 : 1.08,
            maxWidth: big ? 700 : 1000,
            display: "flex",
            // The renderer would squeeze these, not the stats, when a card runs long.
            flexShrink: 0,
          }}
        >
          {title}
        </div>
        {summary && (
          <div style={{ marginTop: 20, fontSize: big ? 30 : 27, lineHeight: 1.35, color: C.ink2, maxWidth: big ? 700 : 1000, display: "flex", flexShrink: 0 }}>
            {summary}
          </div>
        )}
        {/* Figures between rules, not a box each: on the site a box means something to press. */}
        <div style={{ marginTop: "auto", paddingTop: 22, display: "flex", gap: 36, borderTop: stats.length ? `2px solid ${C.line}` : "none" }}>
          {stats.slice(0, 3).map((s) => (
            <div key={s.label} style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <Figure value={s.value} />
              <div style={{ marginTop: 6, fontSize: 21, color: C.ink2, lineHeight: 1.3, display: "flex" }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 26, display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 22, color: C.ink3 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <span style={{ color: C.ink, fontWeight: 600 }}>Li ZhenXi</span>
            <span>SRE, cloud and AI infrastructure</span>
          </div>
          <div style={{ fontFamily: "Plex Mono", display: "flex" }}>{host}</div>
        </div>
      </div>
    ),
    { ...ogSize, fonts: await fonts() },
  );
}
