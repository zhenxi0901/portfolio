import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { postmortems, type Postmortem } from "@/content/postmortems";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/site/section-heading";
import { Reveal } from "@/components/motion/reveal";

export function KindChip({ kind }: { kind: Postmortem["kind"] }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 font-mono text-[11px] text-ink-2">
      <span aria-hidden className={cn("size-1.5 rounded-full", kind === "Near miss" ? "bg-critical" : "bg-p-ai")} />
      {kind}
    </span>
  );
}

export function Postmortems() {
  return (
    <section id="postmortems" className="mx-auto max-w-[1320px] scroll-mt-20 px-4 py-24 sm:px-8 sm:py-32">
      <SectionHeading
        title={
          <>
            What broke here, <span className="text-accent-ink">written up properly</span>.
          </>
        }
        lead="Blameless postmortems from building and running this site: timeline, root cause, how it was caught, and what changed. The times and numbers come from the commits, the CI history and Cloud Run's request logs."
      />
      <p className="mt-6 text-sm text-ink-2">
        Want to be on the other side of one?{" "}
        <a href="/oncall" className="font-medium text-ink underline decoration-accent-ink decoration-2 underline-offset-4">
          Go on call for a simulated incident
        </a>
        , and get a postmortem of your own response.
      </p>
      <ol className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {postmortems.map((pm, i) => {
          const done = pm.actions.filter((a) => a.done).length;
          const [lead] = pm.stats;
          return (
            <Reveal key={pm.slug} as="li" delay={i * 0.06} className="h-full">
              <a
                href={`/postmortems/${pm.slug}`}
                className="group flex h-full flex-col rounded-3xl border border-line bg-surface p-6 transition-colors hover:border-ink-3 sm:p-7"
              >
                <p className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-xs text-ink-3">
                  <KindChip kind={pm.kind} />
                  {pm.date}
                </p>
                <h3 className="mt-4 text-[1.4rem] font-semibold leading-tight tracking-[-0.025em]">{pm.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{pm.summary}</p>
                <p className="mt-6 flex items-baseline gap-3 border-t border-line pt-5">
                  <span className="shrink-0 whitespace-nowrap text-3xl font-semibold tracking-[-0.03em]">{lead.value}</span>
                  <span className="text-sm leading-snug text-ink-2">{lead.label}</span>
                </p>
                <p className="mt-auto flex items-center justify-between gap-3 pt-6 text-sm">
                  <span className="font-mono text-xs text-ink-3">
                    {done} of {pm.actions.length} actions done
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-ink-2 group-hover:text-ink">
                    Read it <ArrowUpRight size={14} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </span>
                </p>
              </a>
            </Reveal>
          );
        })}
      </ol>
    </section>
  );
}
