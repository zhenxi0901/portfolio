import { profile } from "@/content/profile";
import { TourButton } from "@/components/site/tour";

export function Footer() {
  return (
    <footer className="border-t border-line">
      {/* Room at the bottom for the phone tab bar; from lg up there is none. */}
      <div className="mx-auto flex max-w-[1320px] flex-col gap-4 px-4 pb-28 pt-10 text-sm short:pb-10 text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:pb-12">
        <div className="space-y-1.5">
          <p>Designed and built by {profile.name}. Next.js and Go on Cloud Run.</p>
          <p>
            Accessibility and SEO score 100: on every release, Lighthouse in{" "}
            <a className="underline underline-offset-4 hover:text-ink" href={`${profile.github}/portfolio/actions/workflows/ci.yml`} target="_blank" rel="noreferrer">
              CI
            </a>{" "}
            audits a page of every kind and blocks the deploy if either drops.
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          <li>
            <a className="text-ink-2 hover:text-ink" href="/#contact">
              Get in touch
            </a>
          </li>
          <li>
            <a className="hover:text-ink" href="/status">
              Status
            </a>
          </li>
          <li>
            <a className="hover:text-ink" href="/cost">
              Cost
            </a>
          </li>
          <li>
            <a className="hover:text-ink" href="/break">
              Break it
            </a>
          </li>
          <li>
            <a className="hover:text-ink" href="/changelog">
              Changelog
            </a>
          </li>
          <li>
            <a className="hover:text-ink" href="/decisions">
              Decisions
            </a>
          </li>
          <li>
            <a className="hover:text-ink" href="/evidence">
              Evidence
            </a>
          </li>
          <li>
            <a className="hover:text-ink" href="/agents">
              For agents
            </a>
          </li>
          <li>
            <a className="hover:text-ink" href="/oncall">
              On call
            </a>
          </li>
          <li>
            <a className="hover:text-ink" href="/v1" title="The site as one long page, as it was until November 2026">
              Version 1
            </a>
          </li>
          <li>
            {/* The tour's way in, now that the home page's first screen is the live map. */}
            <TourButton className="inline-flex items-center gap-1.5 hover:text-ink" />
          </li>
          <li>
            <a className="hover:text-ink" href={profile.github} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </li>
          <li>
            <a className="hover:text-ink" href={profile.linkedin} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
