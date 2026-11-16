import type { Scenario } from "@/content/oncall";

/** The pill under a platform's heading that opens its incident drill, with a pager dot. */
export function OnCallLink({ drill }: { drill: Scenario["id"] }) {
  return (
    <a
      href={`/oncall#oncall-${drill}`}
      className="mt-6 inline-flex items-center gap-2 rounded-md border border-line-strong px-4 py-2 text-sm font-medium transition-colors hover:border-ink-3"
    >
      <span className="relative flex size-2" aria-hidden>
        <span className="relative inline-flex size-2 rounded-full bg-critical" />
      </span>
      Try being on call: a simulated incident on this platform
    </a>
  );
}
