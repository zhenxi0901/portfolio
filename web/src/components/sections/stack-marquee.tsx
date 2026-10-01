import {
  siApachekafka,
  siDocker,
  siGithubactions,
  siGo,
  siGooglecloud,
  siGrafana,
  siJenkins,
  siKubernetes,
  siLinux,
  siNextdotjs,
  siNvidia,
  siPostgresql,
  siPrometheus,
  siPulumi,
  siPython,
  siPytorch,
  siRedis,
  siTerraform,
  type SimpleIcon,
} from "simple-icons";

const ICONS: SimpleIcon[] = [
  siGooglecloud,
  siKubernetes,
  siDocker,
  siTerraform,
  siPrometheus,
  siGrafana,
  siApachekafka,
  siPostgresql,
  siRedis,
  siGo,
  siPython,
  siGithubactions,
  siJenkins,
  siNvidia,
  siPytorch,
  siLinux,
  siPulumi,
  siNextdotjs,
];

/** The one marquee on the page: the tools I run, as real logos. Pauses on hover. */
export function StackMarquee() {
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center gap-[var(--gap)]" aria-hidden={hidden || undefined}>
      {ICONS.map((icon) => (
        <li key={icon.slug + hidden}>
          <svg
            role={hidden ? undefined : "img"}
            aria-label={hidden ? undefined : icon.title}
            viewBox="0 0 24 24"
            className="size-9 fill-ink-3 transition-colors duration-300 hover:fill-ink"
          >
            <path d={icon.path} />
          </svg>
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label="Tools I use" className="border-y border-line bg-surface py-10">
      <div
        className="group flex overflow-hidden [--duration:45s] [--gap:3.5rem] [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]"
      >
        <div className="flex animate-marquee gap-[var(--gap)] group-hover:[animation-play-state:paused] motion-reduce:animate-none">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </section>
  );
}
