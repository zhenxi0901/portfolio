import { investigation } from "@/content/slo";

/** How an incident is worked: seven dashboard pages, each starting from a question, plus the rules and a runbook. */
export function Investigate() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <div className="overflow-x-auto rounded-3xl border border-line bg-surface">
        <table className="w-full min-w-[540px] text-sm">
          <caption className="px-5 pt-4 text-left">
            <span className="block font-semibold">Seven Grafana pages, in the order I open them</span>
            <span className="mt-0.5 block text-sm text-ink-2">Each page starts from a question, then narrows.</span>
          </caption>
          <thead>
            <tr className="text-left text-xs text-ink-3">
              <th className="px-5 py-2 font-medium">Page</th>
              <th className="px-5 py-2 font-medium">Start with</th>
              <th className="px-5 py-2 font-medium">Narrow using</th>
            </tr>
          </thead>
          <tbody>
            {investigation.pages.map((p, k) => (
              <tr key={p.page} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-5 py-2.5 font-medium">
                  <span className="mr-2 font-mono text-xs text-ink-3">0{k + 1}</span>
                  {p.page}
                </td>
                <td className="px-5 py-2.5 text-ink">{p.start}</td>
                <td className="px-5 py-2.5 text-ink-2">{p.narrow}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4">
        <section className="rounded-3xl border border-line bg-surface p-5">
          <h4 className="font-semibold">Rules I monitor by</h4>
          <ul className="mt-3 grid gap-2">
            {investigation.rules.map((r) => (
              <li key={r} className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink">
                {r}
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-3xl border border-line bg-surface p-5">
          <h4 className="font-semibold">Runbook: telemetry is late</h4>
          <ol className="mt-3 grid gap-2.5">
            {investigation.runbook.map((step, k) => (
              <li key={step} className="grid grid-cols-[1.5rem_1fr] gap-2 text-sm leading-relaxed text-ink-2">
                <span className="grid size-6 place-items-center rounded-full bg-surface-2 font-mono text-[11px] text-ink">{k + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <p className="mt-4 border-l-2 border-critical/60 pl-3 text-sm text-ink">{investigation.guardrail}</p>
        </section>
      </div>
    </div>
  );
}
