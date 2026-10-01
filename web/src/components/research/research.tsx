import { ArrowUpRight, MagnifyingGlassPlus } from "@phosphor-icons/react/dist/ssr";
import { fyp, publication } from "@/content/profile";
import { SectionHeading } from "@/components/site/section-heading";
import { Reveal } from "@/components/motion/reveal";
import { ConcurrencyChart } from "@/components/research/concurrency-chart";
import { WallClockBar } from "@/components/research/wallclock-bar";
import { ZoomImage } from "@/components/research/zoom-image";

export function Research() {
  return (
    <section id="research" className="scroll-mt-20 border-t border-line bg-surface-2/40">
      <div className="mx-auto max-w-[1320px] px-4 py-24 sm:px-8 sm:py-32">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-28">
              <SectionHeading
                title="What does an AI agent actually cost to run?"
                lead="My final-year project at NTU's HyScale Lab. I made ARIES, the lab's open-source agent-serving framework, run long tasks against live apps (mail, a shop, an LMS), then measured 320 runs on a hosted API and self-hosted SGLang on an A100."
              />
              <Reveal delay={0.1}>
                <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8">
                  {fyp.findings.map((f) => (
                    <div key={f.label}>
                      <dt className="text-4xl font-semibold tracking-[-0.04em]">{f.value}</dt>
                      <dd className="mt-2 text-sm leading-relaxed text-ink-2">{f.label}</dd>
                    </div>
                  ))}
                </dl>
              </Reveal>
              <Reveal delay={0.15}>
                <a
                  href={fyp.aries}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-10 inline-flex items-center gap-1.5 text-sm font-medium underline decoration-accent-ink decoration-2 underline-offset-4"
                >
                  ARIES on GitHub <ArrowUpRight size={14} />
                </a>
              </Reveal>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:col-span-7">
            <Reveal>
              <ConcurrencyChart />
            </Reveal>
            <Reveal>
              <WallClockBar />
            </Reveal>
            <Reveal>
              <figure className="overflow-hidden rounded-3xl border border-line bg-surface">
                <ZoomImage
                  src="/img/aries-architecture.png"
                  alt="Architecture of the Toolathlon adapter in ARIES: runner, harness, task sandbox and per-run application copies"
                  width={2244}
                  height={1210}
                  title="How a run is wired, from my report"
                />
                <figcaption className="flex items-center justify-between gap-4 border-t border-line px-5 py-3.5 text-sm">
                  <span className="text-ink-2">How each run is wired: runner, agent harness, sandbox and its own app copies.</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-ink-3">
                    <MagnifyingGlassPlus size={15} /> Click to zoom
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          </div>
        </div>

        <Reveal className="mt-20">
          <article className="grid items-center gap-8 overflow-hidden rounded-3xl border border-line bg-surface p-6 sm:p-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="font-mono text-xs text-ink-3">
                {publication.venue}, {publication.role.toLowerCase()}
              </p>
              <h3 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.035em]">{publication.title}</h3>
              <p className="mt-4 max-w-[46ch] leading-relaxed text-ink-2">{publication.summary}</p>
              <a
                href={publication.code}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium underline decoration-accent-ink decoration-2 underline-offset-4"
              >
                Code and paper <ArrowUpRight size={14} />
              </a>
            </div>
            <div className="overflow-hidden rounded-2xl border border-line lg:col-span-7">
              <ZoomImage
                src="/img/pvchat-poster-thumb.jpg"
                fullSrc="/img/pvchat-poster.jpg"
                alt="PVChat poster presented at ICCV 2025"
                width={900}
                height={637}
                title="PVChat, ICCV 2025 poster"
              />
            </div>
          </article>
        </Reveal>
      </div>
    </section>
  );
}
