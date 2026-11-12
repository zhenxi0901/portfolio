import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { VisitTrace } from "@/components/sections/visit-trace";
import { SloPanel } from "@/components/sections/slo-panel";
import { DeliveryPanel } from "@/components/sections/delivery-panel";
import { LiveInstance } from "@/components/status/live-instance";
import { SectionHeading } from "@/components/site/section-heading";
import { decisions } from "@/content/decisions";

/**
 * How this site runs, as one section: the one-page version (/v1) shows it. The current site shows
 * the same panels on /status.
 */
export function Status() {
  return (
    <section id="status" className="mx-auto max-w-[1320px] scroll-mt-20 px-4 py-24 sm:px-8 sm:py-32">
      <SectionHeading
        title="This page is a production service"
        lead="The Go server that sent you this page also reports on itself. These numbers are live and refresh every five seconds. Below them: the site's own SLO as Google's uptime checks see it, how it ships (DORA metrics), and the trace of your own visit."
      />
      <LiveInstance />
      <SloPanel />
      <DeliveryPanel />
      <VisitTrace />

      <nav aria-label="More on how this site runs" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/status", title: "Status page", text: "Live state, 30 days of availability, how it is watched, incident history and a feed." },
          { href: "/changelog", title: "Changelog", text: "Every release to production and the commits it shipped, written by the pipeline." },
          { href: "/decisions", title: "Decisions", text: `Why it is built this way: ${decisions.length} architecture decision records and what each one costs.` },
          { href: "/agents", title: "For agents", text: "The site as an MCP server: point your own AI agent at it, or curl it." },
        ].map((l) => (
          <a key={l.href} href={l.href} className="group rounded-3xl border border-line bg-surface p-5 transition-colors hover:border-ink-3">
            <span className="flex items-center justify-between font-semibold">
              {l.title}
              <ArrowRight size={16} className="text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
            </span>
            <span className="mt-1 block text-sm leading-relaxed text-ink-2">{l.text}</span>
          </a>
        ))}
      </nav>
    </section>
  );
}
