import { ArrowLeft, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import type { ProductKey } from "@/content/products";
import { TopBar } from "@/components/site/top-bar";
import { Footer } from "@/components/site/footer";
import { Dock } from "@/components/site/dock";
import { ProductTag } from "@/components/site/product-tag";
import { pages } from "@/components/site/nav-items";

/**
 * Frame for the chapter pages (/iot, /ai, /research, /writing, /about): the home page's chrome,
 * full-width sections, and the next chapter at the bottom, so the site still reads front to back.
 */
export function SiteShell({ path, title, children }: { path: string; title?: string; children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Skip to content
      </a>
      <TopBar home />
      <main id="main">
        {/* Where a section's own heading opens the page, the chapter's name is its h1 for screen readers. */}
        {title && <h1 className="sr-only">{title}</h1>}
        {children}
        <ChapterPager path={path} />
      </main>
      <Footer />
      <Dock />
    </>
  );
}

/** A chapter's title, for pages whose first section is not itself the chapter (the IoT platform's two). */
export function ChapterHeader({ product, title, lead }: { product?: ProductKey; title: React.ReactNode; lead: React.ReactNode }) {
  return (
    <header className="mx-auto max-w-[1320px] px-4 pt-32 sm:px-8 sm:pt-40">
      {product && <ProductTag p={product} className="mb-5" />}
      <h1 className="max-w-4xl text-[clamp(2.5rem,6vw,4.75rem)] font-semibold leading-[0.95] tracking-[-0.05em]">{title}</h1>
      <p className="mt-6 max-w-[62ch] text-lg leading-relaxed text-ink-2">{lead}</p>
    </header>
  );
}

/** Previous and next chapter, in the order the dock lists them. */
function ChapterPager({ path }: { path: string }) {
  const i = pages.findIndex((p) => p.href === path);
  const prev = i > 0 ? pages[i - 1] : null;
  const next = i >= 0 && i < pages.length - 1 ? pages[i + 1] : null;
  if (!prev && !next) return null;
  return (
    <nav aria-label="Previous and next chapter" className="mx-auto max-w-[1320px] px-4 pb-16 sm:px-8">
      <div className="grid gap-3 border-t border-line pt-8 sm:grid-cols-2">
        {prev ? (
          <a href={prev.href} rel="prev" className="group rounded-3xl border border-line bg-surface p-5 transition-colors hover:border-ink-3">
            <span className="flex items-center gap-1.5 font-mono text-xs text-ink-3">
              <ArrowLeft size={13} aria-hidden /> Previous
            </span>
            <span className="mt-1 block text-lg font-semibold tracking-[-0.02em]">{prev.label}</span>
          </a>
        ) : (
          <span aria-hidden />
        )}
        {next && (
          <a href={next.href} rel="next" className="group rounded-3xl border border-line bg-surface p-5 text-right transition-colors hover:border-ink-3">
            <span className="flex items-center justify-end gap-1.5 font-mono text-xs text-ink-3">
              Next <ArrowRight size={13} aria-hidden />
            </span>
            <span className="mt-1 block text-lg font-semibold tracking-[-0.02em]">{next.label}</span>
          </a>
        )}
      </div>
    </nav>
  );
}
