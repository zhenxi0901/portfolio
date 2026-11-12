import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { SiteShell } from "@/components/site/site-shell";
import { pages } from "@/components/site/nav-items";
import { profile } from "@/content/profile";

export const metadata = {
  title: `Page not found | ${profile.name}`,
  description: "Nothing lives at this address. The chapters of the site, and a search over all of it, are one click away.",
};

const blurb: Record<string, string> = {
  "/": "Who I am, what I am doing now, and a card per chapter.",
  "/iot": "The building IoT platform I run on GKE, as working models.",
  "/ai": "The AI agent platform I run on Cloud Run, request by request.",
  "/research": "What it costs to serve long-running LLM agents.",
  "/writing": "Posts, and postmortems of what broke here.",
  "/about": "Experience, the tools I use, and a console to ask about them.",
};

/** The site's own 404: its chrome, and a way into every chapter, rather than a dead end. */
export default function NotFound() {
  return (
    <SiteShell path="">
      <section className="mx-auto max-w-[1320px] px-4 pb-16 pt-32 sm:px-8 sm:pt-40">
        <p className="font-mono text-xs text-ink-3">404</p>
        <h1 className="mt-4 max-w-4xl text-[clamp(2.5rem,6vw,4.75rem)] font-semibold leading-[0.95] tracking-[-0.05em]">Nothing lives here.</h1>
        <p className="mt-6 max-w-[60ch] text-lg leading-relaxed text-ink-2">
          This address doesn&apos;t match a page. If it came from an older link, the site has since been split into chapters; one of
          these will have what you were after. Or search all of it: press{" "}
          <kbd className="rounded-md border border-line px-1.5 font-mono text-sm">/</kbd>, or use the search button at the top.
        </p>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((p) => (
            <li key={p.href}>
              <a href={p.href} className="group block h-full rounded-3xl border border-line bg-surface p-5 transition-colors hover:border-ink-3">
                <span className="flex items-center justify-between font-semibold">
                  {p.label}
                  <ArrowRight size={16} className="text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-ink-2">{blurb[p.href]}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </SiteShell>
  );
}
