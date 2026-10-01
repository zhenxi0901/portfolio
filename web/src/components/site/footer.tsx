import { profile } from "@/content/profile";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-4 px-4 pb-28 pt-10 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>Designed and built by {profile.name}. Next.js, three.js and Go on Cloud Run.</p>
        <ul className="flex gap-5">
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
          <li>
            <a className="hover:text-ink" href={profile.resume} target="_blank" rel="noreferrer">
              Résumé
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
