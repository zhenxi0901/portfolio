import { ArrowDown, EnvelopeSimple } from "@phosphor-icons/react/dist/ssr";
import { cases, profile } from "@/content/profile";
import { heroStat } from "@/content/headlines";
import { Button } from "@/components/ui/button";
import { Cluster } from "@/components/hero/cluster";
import { LiveMap } from "@/components/hero/live-map";
import { KineticName } from "@/components/hero/kinetic-name";
import { TourButton } from "@/components/site/tour";

/**
 * `work` is where "See the work" goes: the chapter cards on the home page, the case studies on /v1.
 * `legacy` keeps the 3D constellation of tools for /v1, the site as it was; the home page shows the
 * live map of its own request path instead.
 */
export function Hero({ work = "#chapters", legacy = false }: { work?: string; legacy?: boolean } = {}) {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="mx-auto grid min-h-[100dvh] max-w-[1320px] grid-cols-1 items-center gap-6 px-4 pb-24 pt-24 sm:px-8 lg:grid-cols-12 lg:gap-4">
        <div className="lg:col-span-6 xl:col-span-6">
          <p className="hero-in inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-good" />
            </span>
            {profile.availability} in SRE, cloud and AI infra
          </p>
          <h1 className="mt-6 text-[clamp(3.5rem,10vw,8.5rem)] font-semibold leading-[0.9] tracking-[-0.055em]">
            <KineticName text={profile.name} />
          </h1>
          {/* The intro is the largest text on a phone, so it rises without fading in. */}
          <p
            className="hero-rise mt-7 max-w-[34ch] text-lg leading-relaxed text-ink-2 sm:text-xl"
            style={{ "--d": "0.2s" } as React.CSSProperties}
          >
            {profile.intro}
          </p>
          {/* Proof on the first screen: on a phone the first number is otherwise a screen and a half down. */}
          <p className="hero-in mt-5 max-w-[52ch] font-mono text-xs leading-relaxed text-ink-3" style={{ "--d": "0.28s" } as React.CSSProperties}>
            {heroStat(169).value} merged PRs on a production IoT platform · {cases.length} case studies with working models ·{" "}
            {heroStat(320).value} LLM agent runs benchmarked
          </p>
          <div
            className="hero-in mt-8 flex flex-wrap items-center gap-3"
            style={{ "--d": "0.35s" } as React.CSSProperties}
          >
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
        {legacy ? (
          <div className="relative lg:col-span-6 lg:-mr-10 xl:-mr-16">
            <Cluster />
          </div>
        ) : (
          <div className="hero-in relative lg:col-span-6" style={{ "--d": "0.3s" } as React.CSSProperties}>
            <LiveMap />
          </div>
        )}
      </div>
    </section>
  );
}
