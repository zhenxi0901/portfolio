<!-- Generated from web/src/content/decisions.ts by web/scripts/gen-adr.mts. Edit that file, not this one. -->

# 7. The error budget gates releases, in code

- Status: Accepted
- Date: 2026-10-19

## Context

An SLO with no consequence is a dashboard. Error-budget policies usually live in a document that someone has to remember during an incident.

## Decision

/api/slo reports whether releases are open or frozen. Once the 30-day budget is spent, the deploy holds every release except a commit marked with a Reliability-fix line, or a manual run that states an override; the reason goes in the run summary.

If the SLO cannot be read, the gate stays open and says so: losing the measurement should not stop a fix.

## Consequences

What it buys:

- The policy is enforced and auditable rather than remembered; the page shows its state live.

What it costs:

- With a 43-minute budget, one bad hour freezes feature releases until the window rolls past it, which can take weeks. That is the point, but it is strict for a one-person site.
- Failing open means a broken measurement and a spent budget would let a release through.

## Evidence

- [scripts/budget-gate.sh](../../scripts/budget-gate.sh)
- [api/internal/slo/slo.go: the releases field](../../api/internal/slo/slo.go)
