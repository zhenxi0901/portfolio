import type { Scenario } from "@/content/oncall";

/** The pill under a platform's heading that opens its incident drill, with a pager dot. */
export function OnCallLink({ drill }: { drill: Scenario["id"] }) {
  return (
    <a
      href={`/oncall#oncall-${drill}`}
      className="mt-6 inline-flex items-center gap-2 rounded-full border border-critical/50 px-4 py-2 text-sm font-medium transition-colors hover:border-critical"
    >
      <span className="relative flex size-2" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-critical opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-critical" />
      </span>
      Try being on call: a simulated incident on this platform
    </a>
  );
}
