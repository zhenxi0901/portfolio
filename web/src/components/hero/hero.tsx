import { ArrowDown, FileText } from "@phosphor-icons/react/dist/ssr";
import { profile } from "@/content/profile";
import { Button } from "@/components/ui/button";
import { Cluster } from "@/components/hero/cluster";
import { KineticName } from "@/components/hero/kinetic-name";
import { Reveal } from "@/components/motion/reveal";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="mx-auto grid min-h-[100dvh] max-w-[1320px] grid-cols-1 items-center gap-6 px-4 pb-24 pt-24 sm:px-8 lg:grid-cols-12 lg:gap-4">
        <div className="lg:col-span-6 xl:col-span-6">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-good" />
              </span>
              {profile.availability} in SRE, cloud and AI infra
            </p>
          </Reveal>
          <h1 className="mt-6 text-[clamp(3.5rem,10vw,8.5rem)] font-semibold leading-[0.9] tracking-[-0.055em]">
            <KineticName text={profile.name} />
          </h1>
          <Reveal delay={0.25}>
            <p className="mt-7 max-w-[34ch] text-lg leading-relaxed text-ink-2 sm:text-xl">{profile.intro}</p>
          </Reveal>
          <Reveal delay={0.35}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <a href="#work">
                  See the work <ArrowDown weight="bold" />
                </a>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <a href={profile.resume} target="_blank" rel="noreferrer">
                  <FileText /> Résumé
                </a>
              </Button>
            </div>
          </Reveal>
        </div>
        <div className="relative lg:col-span-6 lg:-mr-10 xl:-mr-16">
          <Cluster />
        </div>
      </div>
    </section>
  );
}
