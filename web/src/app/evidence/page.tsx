import { ArrowUpRight, Globe, Lightning, Lock } from "@phosphor-icons/react/dist/ssr";
import { ArticleShell, Part } from "@/components/article/article-shell";
import { CopyButton } from "@/components/agents/copy-button";
import { LiveCheck } from "@/components/evidence/live-check";
import { checkName, claimGroups, proofCounts, proofKinds, type Claim, type ProofKind } from "@/content/evidence";
import { pageMetadata } from "@/lib/page-metadata";
import { cn } from "@/lib/utils";

export const metadata = pageMetadata({
  title: "Evidence: where this site's claims come from",
  description:
    "Every headline claim on this portfolio, sorted by how you can check it: live from your browser, on public record, or in a private repository that this page says it cannot link to.",
  path: "/evidence",
});

const icons: Record<ProofKind, typeof Globe> = { live: Lightning, public: Globe, private: Lock };
const tones: Record<ProofKind, string> = { live: "text-accent-ink", public: "text-ink-2", private: "text-ink-3" };
const order: ProofKind[] = ["live", "public", "private"];
const external = (href: string) => href.startsWith("http");
// Sections of the home page, which is a different document from this one.
const home = { postmortems: "/writing#postmortems", contact: "/#contact" };

function Badge({ kind }: { kind: ProofKind }) {
  const Icon = icons[kind];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[11px]", tones[kind])}>
      <Icon size={12} weight={kind === "live" ? "fill" : "regular"} aria-hidden />
      {proofKinds[kind].label}
    </span>
  );
}

function ClaimCard({ c, id }: { c: Claim; id: string }) {
  return (
    <li className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Badge kind={c.kind} />
        <a href={c.seen.href} className="font-mono text-xs text-ink-3 underline decoration-line-strong underline-offset-4 hover:text-ink">
          claimed in: {c.seen.label}
        </a>
      </div>
      <h3 id={id} className="mt-3 max-w-[60ch] text-lg font-semibold leading-snug tracking-[-0.02em]">
        {c.claim}
      </h3>
      <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-ink-2">{c.proof}</p>

      {c.check && <LiveCheck kind={c.check} describedBy={id} />}

      {c.command && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code tabIndex={0} className="min-w-0 flex-1 basis-64 overflow-x-auto whitespace-nowrap rounded-[14px] border border-line bg-bg px-3.5 py-2 font-mono text-xs text-ink-2">
            {c.command}
          </code>
          <CopyButton text={c.command} label="Copy" name={c.check ? `the command that checks ${checkName[c.check]}` : "the command"} describedBy={id} />
        </div>
      )}

      {c.links && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {c.links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                {...(external(l.href) ? { target: "_blank", rel: "noreferrer" } : {})}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
              >
                {l.label}
                {external(l.href) && <ArrowUpRight size={12} aria-hidden />}
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function EvidencePage() {
  const total = order.reduce((n, k) => n + proofCounts[k], 0);
  return (
    <ArticleShell back={{ href: "/", label: "Home" }} wide>
      <p className="mt-8 font-mono text-xs text-ink-3">{total} claims · sorted by how you can check them</p>
      <h1 className="mt-4 max-w-[16ch] text-[clamp(2.25rem,5.5vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.045em]">Don&apos;t take my word for it.</h1>
      <p className="mt-6 max-w-[64ch] text-lg leading-relaxed text-ink-2">
        A portfolio is a list of claims. This page takes the main ones and says where each comes from: something you can check from your browser
        right now, something on public record, or work in a private repository that I cannot show you. The third kind is labelled as such.
      </p>

      <dl className="mt-10 grid gap-3 sm:grid-cols-3">
        {order.map((k) => {
          const Icon = icons[k];
          return (
            <div key={k} className="flex flex-col-reverse justify-end rounded-3xl border border-line bg-surface p-5">
              <dt className="mt-2 text-sm leading-snug text-ink-2">
                <span className={cn("flex items-center gap-1.5 font-medium", tones[k] === "text-ink-3" ? "text-ink-2" : tones[k])}>
                  <Icon size={14} weight={k === "live" ? "fill" : "regular"} aria-hidden />
                  {proofKinds[k].label}
                </span>
                <span className="mt-1 block">{proofKinds[k].meaning}</span>
              </dt>
              <dd className="text-3xl font-semibold tracking-[-0.03em]">{proofCounts[k]}</dd>
            </div>
          );
        })}
      </dl>

      {claimGroups.map((g) => (
        <Part key={g.id} title={g.title} aside={`${g.claims.length} claims`}>
          <p className="mb-5 max-w-[68ch] text-[15px] leading-relaxed text-ink-2">{g.lead}</p>
          <ul className="space-y-3">
            {g.claims.map((c, k) => (
              <ClaimCard key={c.claim} c={c} id={`claim-${g.id}-${k}`} />
            ))}
          </ul>
        </Part>
      ))}

      <Part title="If something here is wrong">
        <p className="max-w-[68ch] text-[15px] leading-relaxed text-ink-2">
          Tell me and I will fix it, and say so in the{" "}
          <a href="/changelog" className="text-ink underline decoration-accent-ink decoration-2 underline-offset-4">
            changelog
          </a>
          . The site keeps{" "}
          <a href={home.postmortems} className="text-ink underline decoration-accent-ink decoration-2 underline-offset-4">
            postmortems
          </a>{" "}
          for its own mistakes for the same reason.{" "}
          <a href={home.contact} className="text-ink underline decoration-accent-ink decoration-2 underline-offset-4">
            Get in touch
          </a>
          .
        </p>
      </Part>
    </ArticleShell>
  );
}
