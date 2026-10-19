import { profile } from "@/content/profile";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-4 px-4 pb-28 pt-10 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="space-y-1.5">
          <p>Designed and built by {profile.name}. Next.js, three.js and Go on Cloud Run.</p>
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
            <a className="hover:text-ink" href="/status">
              Status
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
