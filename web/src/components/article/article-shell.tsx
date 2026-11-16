import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { TopBar } from "@/components/site/top-bar";
import { Footer } from "@/components/site/footer";
import { Dock } from "@/components/site/dock";

/** Frame for the standalone pages (case studies, postmortems): top bar that goes home, one column. */
export function ArticleShell({
  back,
  wide = false,
  className,
  children,
}: {
  back: { href: string; label: string };
  /** Interactive pages need more room than a column of text. */
  wide?: boolean;
  /** On the frame: long reads pass the serif's variable here (components/article/serif.ts). */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Skip to content
      </a>
      <TopBar home />
      {/* Not "top": that id is the home page hero, which the palette and other links use to go home. */}
      <main id="main" className={`mx-auto ${wide ? "max-w-[1180px]" : "max-w-[880px]"} px-4 pb-24 pt-28 sm:px-8 sm:pt-36 ${className ?? ""}`}>
        <a href={back.href} className="inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-ink">
          <ArrowLeft size={14} /> {back.label}
        </a>
        {children}
      </main>
      <Footer />
      {/* The way on to the chapters on a phone, where the top bar has no room for them. */}
      <Dock />
    </>
  );
}

/** A titled block of an article. */
export function Part({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
        <h2 className="text-xl font-semibold tracking-[-0.015em]">{title}</h2>
        {aside && <p className="text-sm text-ink-3">{aside}</p>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * The key figures under an article's title: a row of type between two rules, not a box per number
 * (a box on this site means something you can press).
 */
export function StatRow({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <dl className="mt-10 grid grid-cols-1 gap-y-5 border-y border-line py-6 sm:grid-cols-3 sm:gap-x-8">
      {stats.map((s) => (
        // Reversed so the label follows the value visually; justify-end keeps every value on the top line.
        <div key={s.label} className="flex flex-col-reverse justify-end">
          <dt className="mt-1 max-w-[30ch] text-sm leading-snug text-ink-2">{s.label}</dt>
          <dd className="text-3xl font-semibold tracking-[-0.02em]">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Long reads (`reading`) set their text in the serif, at reading size and measure. */
const readingText = "max-w-[68ch] font-serif text-[1.125rem] leading-[1.7] text-ink";

export function Bullets({ items, reading = false }: { items: string[]; reading?: boolean }) {
  return (
    <ul className="space-y-3">
      {items.map((t) => (
        <li key={t} className={reading ? `flex gap-3 ${readingText}` : "flex gap-3 text-[15px] leading-relaxed text-ink-2 sm:text-base"}>
          <span aria-hidden className="mt-[0.65em] size-1.5 shrink-0 rounded-full bg-ink-3" />
          {t}
        </li>
      ))}
    </ul>
  );
}

export function Prose({ paras, reading = false }: { paras: string[]; reading?: boolean }) {
  return (
    <div className="space-y-4">
      {paras.map((p) => (
        <p key={p} className={reading ? readingText : "max-w-[70ch] text-[15px] leading-relaxed text-ink-2 sm:text-base"}>
          {p}
        </p>
      ))}
    </div>
  );
}
