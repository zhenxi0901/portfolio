<!-- Generated from web/src/content/decisions.ts by web/scripts/gen-adr.mts. Edit that file, not this one. -->

# 3. Build once, release that digest, check it before it takes traffic

- Status: Accepted
- Date: 2026-10-19

## Context

The first pipeline rebuilt the image at deploy time, so what reached production was not the image CI had tested, and traffic moved to a new revision before anything checked it.

A filter on the branch name alone would also have let a fork's pull request from its own main reach the deploy credentials.

## Decision

CI builds the image once, smoke-tests it, holds it to Lighthouse budgets and a critical-CVE gate, and only then pushes it with an SBOM and build-provenance attestation.

The deploy releases that digest without rebuilding: it verifies the attestations, applies the error-budget gate (ADR 7), starts the revision with no traffic, smoke-tests it at its own URL, pins traffic to it and checks again. If that fails, traffic goes back to the previous revision on its own.

Only pushes to main in this repository deploy. A manual rollback drill rehearses the whole path in production.

## Consequences

What it buys:

- What was tested is what runs, and the release says so with signed evidence attached.
- A failed release either never takes traffic or is rolled back: the first drill had traffic back on the old revision 20 seconds after the switch.
- Every release is a GitHub release listing the commits it shipped.

What it costs:

- Traffic is pinned to the revision the pipeline checked, so a Terraform change to the service goes live only with the next release.
- gcloud names the revision it tags in the service's template, which Terraform has to clear on its next apply; that costs a revision that takes no traffic.

## Evidence

- [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- [.github/workflows/deploy.yml](../../.github/workflows/deploy.yml)
