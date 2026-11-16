import { ArrowUpRight, EnvelopeSimple } from "@phosphor-icons/react/dist/ssr";
import { SiteShell } from "@/components/site/site-shell";
import { Experience } from "@/components/sections/experience";
import { Tools } from "@/components/sections/tools";
import { Ask } from "@/components/sections/ask";
import { education, now, profile } from "@/content/profile";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Experience and the tools I use",
  description: "Where I have worked, from a building's control room to Kubernetes, the tools I use, and a console that answers questions about my work.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <SiteShell path="/about">
      <header id="about" className="mx-auto max-w-[1320px] scroll-mt-20 px-4 pt-32 sm:px-8 sm:pt-40">
        <h1 className="max-w-4xl text-[clamp(2.25rem,4.6vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.028em]">
          {profile.name}
        </h1>
        <p className="mt-3 text-xl text-ink-2">
          {profile.role}, in {profile.location}
        </p>
        <p className="mt-6 max-w-[62ch] text-lg leading-relaxed">
          {now.text} <span className="text-sm text-ink-3">(updated {now.updated})</span>
        </p>
        {/* Plain facts in three columns under a rule; the links in them are the only things to press. */}
        <dl className="mt-8 grid max-w-3xl gap-6 border-t border-line pt-6 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-3">Studying</dt>
            <dd className="mt-1 text-sm font-medium">{education.degree}</dd>
            <dd className="text-sm text-ink-2">
              {education.school}, graduating {education.period.split(" - ")[1]}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Email</dt>
            <dd className="mt-1 text-sm font-medium">
              <a href={`mailto:${profile.email}`} className="inline-flex items-center gap-1.5 underline decoration-line-strong underline-offset-4 hover:decoration-accent-ink">
                <EnvelopeSimple size={14} aria-hidden /> {profile.email}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Elsewhere</dt>
            <dd className="mt-1 flex flex-wrap gap-x-4 text-sm font-medium">
              <a href={profile.github} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline decoration-line-strong underline-offset-4 hover:decoration-accent-ink">
                GitHub <ArrowUpRight size={12} aria-hidden />
              </a>
              <a href={profile.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline decoration-line-strong underline-offset-4 hover:decoration-accent-ink">
                LinkedIn <ArrowUpRight size={12} aria-hidden />
              </a>
            </dd>
          </div>
        </dl>
      </header>
      <Experience />
      <Tools />
      <Ask />
    </SiteShell>
  );
}
