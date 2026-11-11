"use client";

import { useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { fyp } from "@/content/profile";
import { postHref } from "@/content/writing";
import { onTabKeys } from "@/lib/tabs";
import { cn } from "@/lib/utils";

// What the supercomputer does not allow, what broke because of it, and what the Apptainer backend
// does instead. From hyscale-lab/ARIES#92.
const LIMITS = [
  {
    key: "root",
    limit: "No Docker, no root",
    broke: "ARIES started every part of a run as a Docker container, and an HPC cluster gives users neither Docker nor root.",
    fix: "The harness and the sandbox run as Apptainer instances, each with a fake root and its own overlay; the bridge runs as a process in the same namespace. Images are unpacked once into plain directories owned by the user, because with a packed image underneath, installing a package as \"root\" fails on files owned by other IDs.",
  },
  {
    key: "shared",
    limit: "A node shared with strangers",
    broke: "The bridge between the agent and its sandbox listens on ports with no authentication. On a shared node, any other user could reach them.",
    fix: "The run re-executes itself inside its own user and network namespace. Outbound traffic goes through slirp4netns, and nothing outside the namespace has a route to the bridge.",
  },
  {
    key: "cgroups",
    limit: "No cgroup per container",
    broke: "The benchmark measures CPU and memory per container from its cgroup. The cluster's cgroups are version 1, one per job, owned by root.",
    fix: "Each instance is measured from /proc instead: the CPU of its live processes plus what each finished command reports about itself as it exits, so a command shorter than a sample is still counted.",
  },
  {
    key: "hang",
    limit: "A hang that looked like the agent's fault",
    broke: "An agent's git cherry-pick froze holding the repository lock until the task timed out. Every command had started its own fake-root daemon, and a later command was still talking to one that had exited, through a queue nobody read.",
    fix: "One fake-root daemon per instance, started with it, whose key every command inherits. Earlier runs had missed the bug because they only ran read-only Git commands.",
  },
] as const;

/** Running the agent stack on a supercomputer: pick a limit, see what broke and what replaced it. */
export function Rootless() {
  const [i, setI] = useState(0);
  const item = LIMITS[i];
  const a = fyp.apptainer;

  return (
    <figure className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <figcaption>
        <p className="font-semibold">The same stack on a supercomputer, without root</p>
        <p className="mt-0.5 text-sm text-ink-2">
          I added an Apptainer backend to ARIES so a whole run fits in one batch job on NSCC&apos;s ASPIRE 2A: the agent, its sandbox, and
          Qwen3-4B served by SGLang on the same A100 node. Merged {a.merged}: {a.lines.toLocaleString("en-US")} lines across {a.files} files.
        </p>
      </figcaption>

      <div className="mt-5 grid gap-4 sm:grid-cols-[13rem_1fr]">
        <div
          role="tablist"
          aria-label="What the cluster does not allow"
          onKeyDown={(e) => onTabKeys(e, LIMITS.length, i, setI)}
          className="flex gap-2 overflow-x-auto pb-1 sm:flex-col sm:overflow-visible"
        >
          {LIMITS.map((l, k) => (
            <button
              key={l.key}
              type="button"
              role="tab"
              id={`rootless-tab-${k}`}
              aria-selected={k === i}
              aria-controls="rootless-panel"
              tabIndex={k === i ? 0 : -1}
              onClick={() => setI(k)}
              className={cn(
                "shrink-0 rounded-2xl border px-3.5 py-2.5 text-left text-sm transition-colors",
                k === i ? "border-accent-ink bg-surface text-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
              )}
            >
              {l.limit}
            </button>
          ))}
        </div>
        <div id="rootless-panel" role="tabpanel" aria-labelledby={`rootless-tab-${i}`} className="rounded-2xl bg-surface-2/70 p-4">
          <p className="font-mono text-[11px] text-ink-3">what broke</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{item.broke}</p>
          <p className="mt-4 font-mono text-[11px] text-ink-3">what it does instead</p>
          <p className="mt-1 text-sm leading-relaxed">{item.fix}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <a href={postHref("agents-without-root")} className="inline-flex items-center gap-1.5 font-medium underline decoration-accent-ink decoration-2 underline-offset-4">
          Read the write-up <ArrowUpRight size={14} />
        </a>
        <a href={a.pr} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium underline decoration-accent-ink decoration-2 underline-offset-4">
          The pull request <ArrowUpRight size={14} />
        </a>
        <a href={fyp.plugins.pr} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-ink-2 underline underline-offset-4 hover:text-ink">
          In review next: portable agent plugins <ArrowUpRight size={14} />
        </a>
      </div>
    </figure>
  );
}
