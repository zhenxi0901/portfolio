import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE_URL } from "@/lib/site";

// Share cards (Open Graph images), rendered once at build time in the site's own type and colours.

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

const C = {
  bg: "#0a0a0c",
  surface: "#141418",
  line: "#2a2a30",
  ink: "#f2f2f0",
  ink2: "#b4b4bb",
  ink3: "#8e8e97",
  accent: "#c2f75c",
};

/** Product colours, as on the site in dark mode. */
export const ogTone = { iot: "#38bdf8", ai: "#fbbf24", aries: "#a78bfa", critical: "#f87171", accent: C.accent } as const;

const font = (pkg: string, file: string) => readFile(join(process.cwd(), "node_modules/@fontsource", pkg, "files", file));

async function fonts() {
  const [regular, medium, bold, mono] = await Promise.all([
    font("geist-sans", "geist-sans-latin-400-normal.woff"),
    font("geist-sans", "geist-sans-latin-500-normal.woff"),
    font("geist-sans", "geist-sans-latin-700-normal.woff"),
    font("geist-mono", "geist-mono-latin-400-normal.woff"),
  ]);
  return [
    { name: "Geist", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Geist", data: medium, weight: 500 as const, style: "normal" as const },
    { name: "Geist", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "Geist Mono", data: mono, weight: 400 as const, style: "normal" as const },
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

/** A few nodes and links on the right, echoing the hero. Home card only: it stays clear of the title. */
function Constellation() {
  const nodes = [
    [900, 100], [1060, 60], [990, 160], [1140, 150], [875, 215], [1050, 225], [1140, 250],
  ];
  const links = [[0, 1], [0, 2], [1, 3], [2, 3], [2, 4], [2, 5], [5, 6], [3, 6]];
  return (
    <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", top: 0, left: 0 }}>
      {links.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} stroke={C.line} strokeWidth="2" />
      ))}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 2 ? 9 : 6} fill={i === 2 || i === 5 ? C.accent : C.ink3} />
      ))}
    </svg>
  );
}

export async function ogImage({ eyebrow, eyebrowColor = C.accent, title, summary, stats = [], big = false }: OgCard) {
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
          fontFamily: "Geist",
          padding: "64px 72px 56px",
          position: "relative",
        }}
      >
        {big && <Constellation />}
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: "Geist Mono", fontSize: 24, color: C.ink2 }}>
          <div style={{ width: 14, height: 14, borderRadius: 999, background: eyebrowColor }} />
          {eyebrow}
        </div>
        <div
          style={{
            marginTop: big ? 26 : 30,
            fontSize: big ? 132 : title.length > 42 ? 54 : 62,
            fontWeight: 700,
            letterSpacing: big ? "-0.055em" : "-0.04em",
            lineHeight: big ? 0.95 : 1.05,
            maxWidth: big ? 900 : 1000,
            display: "flex",
          }}
        >
          {title}
        </div>
        {summary && (
          <div style={{ marginTop: 20, fontSize: big ? 30 : 27, lineHeight: 1.35, color: C.ink2, maxWidth: 1000, display: "flex" }}>{summary}</div>
        )}
        <div style={{ marginTop: "auto", paddingTop: 28, display: "flex", gap: 18 }}>
          {stats.slice(0, 3).map((s) => (
            <div
              key={s.label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                background: C.surface,
                border: `2px solid ${C.line}`,
                borderRadius: 24,
                padding: "20px 24px",
              }}
            >
              <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.03em", display: "flex" }}>{s.value}</div>
              <div style={{ marginTop: 6, fontSize: 21, color: C.ink2, lineHeight: 1.3, display: "flex" }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 26, display: "flex", justifyContent: "space-between", fontSize: 22, color: C.ink3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                background: C.accent,
                color: C.bg,
                fontSize: 14,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              LZ
            </div>
            Li ZhenXi · SRE, cloud and AI infrastructure
          </div>
          <div style={{ fontFamily: "Geist Mono", display: "flex" }}>{host}</div>
        </div>
      </div>
    ),
    { ...ogSize, fonts: await fonts() },
  );
}
