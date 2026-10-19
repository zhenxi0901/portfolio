<!-- Generated from web/src/content/decisions.ts by web/scripts/gen-adr.mts. Edit that file, not this one. -->

# 9. No long-lived credentials anywhere

- Status: Accepted
- Date: 2026-10-01

## Context

A public repository's workflows deploy to a real project. A leaked service-account key, or a secret in Terraform state or a log, would be a standing risk.

## Decision

GitHub's OIDC token is exchanged through Workload Identity Federation for short-lived credentials, limited to this repository's main branch. Separate identities deploy and read logs, each with only the roles it needs.

Secrets live in Secret Manager. Terraform creates them empty and never sees the values; the project and service accounts are repository secrets so the public logs mask them.

## Consequences

What it buys:

- There is no key to leak or rotate, and every credential expires within the hour.

What it costs:

- Setting a secret is a manual step, on purpose, and the README has to say how.

## Evidence

- [infra/github.tf](../../infra/github.tf)
- [SECURITY.md](../../SECURITY.md)
