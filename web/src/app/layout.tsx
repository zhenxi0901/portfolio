import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { profile } from "@/content/profile";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://portfolio-emsghin2iq-as.a.run.app";
const description =
  "Li ZhenXi runs cloud platforms in production and benchmarks AI infrastructure: Kubernetes on Google Cloud, CI/CD, observability and LLM serving.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${profile.name} | ${profile.role}`,
  description,
  authors: [{ name: profile.name, url: profile.github }],
  keywords: ["Site Reliability Engineering", "DevOps", "Cloud", "AI Infrastructure", "Kubernetes", "GKE", "LLM serving"],
  openGraph: {
    type: "profile",
    title: `${profile.name} | ${profile.role}`,
    description,
    url: "/",
    images: [{ url: "/img/og-card.png", width: 1200, height: 630, alt: `${profile.name}, ${profile.role}` }],
  },
  twitter: { card: "summary_large_image", title: profile.name, description, images: ["/img/og-card.png"] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" },
  ],
};

// Structured data so a recruiter's search shows the right person and links.
const personJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: profile.name,
  jobTitle: profile.role,
  email: `mailto:${profile.email}`,
  url: SITE_URL,
  sameAs: [profile.github, profile.linkedin],
  alumniOf: "Nanyang Technological University",
  knowsAbout: ["Kubernetes", "Google Cloud", "Terraform", "CI/CD", "Observability", "LLM serving"],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <head>
        {/* Runs before paint: lets CSS hide reveal targets only when JavaScript is available. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="min-h-[100dvh]">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
