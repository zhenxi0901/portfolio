import { ArrowDown, EnvelopeSimple } from "@phosphor-icons/react/dist/ssr";
import { cases, profile } from "@/content/profile";
import { heroStat } from "@/content/headlines";
import { Button } from "@/components/ui/button";
import { Cluster } from "@/components/hero/cluster";
import { LiveMap } from "@/components/hero/live-map";
import { KineticName } from "@/components/hero/kinetic-name";
import { TourButton } from "@/components/site/tour";

/**
 * The home page's first screen. The name, said once; one sentence of what I do and one of where I am;
 * and, taking most of the width, the thing no template has: this page's own request, live, with the
 * numbers of the request you just made. `work` is where "See the work" goes. `legacy` is /v1, the site
 * as it was, which keeps its own hero.
 */
export function Hero({ work = "#chapters", legacy = false }: { work?: string; legacy?: boolean } = {}) {
  if (legacy) return <LegacyHero work={work} />;
  return (
    <section id="top" className="relative">
      <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-10 px-4 pb-16 pt-28 sm:px-8 lg:min-h-[92dvh] lg:grid-cols-12 lg:items-center lg:gap-10 lg:pb-20 lg:pt-24">
        <div className="lg:col-span-5">
          <h1 className="text-[clamp(2.5rem,5vw,4rem)] font-semibold leading-[1.02] tracking-[-0.03em]">{profile.name}</h1>
          <p className="mt-5 max-w-[30ch] text-xl leading-snug text-ink sm:text-[1.375rem]">
            I keep cloud platforms running in production, and measure what AI agents cost to serve.
          </p>
          {/* The proof is in the sentence, its two numbers in ink for anyone scanning, rather than in a row of big figures. */}
          <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">
            DevOps intern at Primustech, where <span className="font-medium text-ink">{heroStat(169).value} of my pull requests</span> are
            merged into a production IoT platform, and final-year Computer Science student at NTU, where I benchmarked{" "}
            <span className="font-medium text-ink">{heroStat(320).value} LLM agent runs</span>. Graduating June 2027, and open to SRE, cloud
            and AI-infrastructure roles.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button asChild size="lg">
              <a href={work}>
                See the work <ArrowDown weight="bold" />
              </a>
            </Button>
            <a
              href="#contact"
              className="text-[15px] font-medium text-ink underline decoration-line-strong decoration-2 underline-offset-[5px] transition-colors hover:decoration-ink"
            >
              Get in touch
            </a>
          </div>
        </div>
        <div className="lg:col-span-7">
          <LiveMap />
        </div>
      </div>
    </section>
  );
}

/** /v1's hero, as the one-page site had it. */
function LegacyHero({ work }: { work: string }) {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="mx-auto grid min-h-[100dvh] max-w-[1320px] grid-cols-1 items-center gap-6 px-4 pb-24 pt-24 sm:px-8 lg:grid-cols-12 lg:gap-4">
        <div className="lg:col-span-6 xl:col-span-6">
          <p className="hero-in inline-flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-good" />
            </span>
            {profile.availability} in SRE, cloud and AI infra
          </p>
          <h1 className="mt-6 text-[clamp(3.5rem,10vw,8.5rem)] font-semibold leading-[0.9] tracking-[-0.055em]">
            <KineticName text={profile.name} />
          </h1>
          <p className="hero-rise mt-7 max-w-[34ch] text-lg leading-relaxed text-ink-2 sm:text-xl" style={{ "--d": "0.2s" } as React.CSSProperties}>
            {profile.intro}
          </p>
          <p className="hero-in mt-5 max-w-[52ch] font-mono text-xs leading-relaxed text-ink-3" style={{ "--d": "0.28s" } as React.CSSProperties}>
            {heroStat(169).value} merged PRs on a production IoT platform · {cases.length} case studies with working models ·{" "}
            {heroStat(320).value} LLM agent runs benchmarked
          </p>
          <div className="hero-in mt-8 flex flex-wrap items-center gap-3" style={{ "--d": "0.35s" } as React.CSSProperties}>
            <Button asChild size="lg">
              <a href={work}>
                See the work <ArrowDown weight="bold" />
              </a>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a href="#contact">
                <EnvelopeSimple /> Get in touch
              </a>
            </Button>
          </div>
          <div className="hero-in mt-5" style={{ "--d": "0.45s" } as React.CSSProperties}>
            <TourButton className="inline-flex items-center gap-2 text-sm font-medium text-ink-2 underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-accent-ink" />
          </div>
        </div>
        <div className="relative lg:col-span-6 lg:-mr-10 xl:-mr-16">
          <Cluster />
        </div>
      </div>
    </section>
  );
}
