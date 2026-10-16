import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { TopBar } from "@/components/site/top-bar";
import { Footer } from "@/components/site/footer";

/** Frame for the standalone pages (case studies, postmortems): top bar that goes home, one column. */
export function ArticleShell({ back, children }: { back: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <>
      <TopBar home />
      <main id="top" className="mx-auto max-w-[880px] px-4 pb-24 pt-28 sm:px-8 sm:pt-36">
        <a href={back.href} className="inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-ink">
          <ArrowLeft size={14} /> {back.label}
        </a>
        {children}
      </main>
      <Footer />
    </>
  );
}

/** A titled block of an article. */
export function Part({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
        <h2 className="text-xl font-semibold tracking-[-0.02em]">{title}</h2>
        {aside && <p className="font-mono text-xs text-ink-3">{aside}</p>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Big numbers under an article's title. */
export function StatRow({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <dl className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col-reverse rounded-3xl border border-line bg-surface p-5">
          <dt className="mt-1 text-sm leading-snug text-ink-2">{s.label}</dt>
          <dd className="text-3xl font-semibold tracking-[-0.03em]">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((t) => (
        <li key={t} className="flex gap-3 text-[15px] leading-relaxed text-ink-2 sm:text-base">
          <span aria-hidden className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-ink-3" />
          {t}
        </li>
      ))}
    </ul>
  );
}

export function Prose({ paras }: { paras: string[] }) {
  return (
    <div className="space-y-4">
      {paras.map((p) => (
        <p key={p} className="text-[15px] leading-relaxed text-ink-2 sm:text-base">
          {p}
        </p>
      ))}
    </div>
  );
}
