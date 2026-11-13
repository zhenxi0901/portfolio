# Security

This repository is the source of a personal portfolio that runs as a small production service at
https://portfolio-emsghin2iq-as.a.run.app.

## Reporting a vulnerability

Email zli057@e.ntu.edu.sg with what you found and how to reproduce it. Please don't open a public
issue for it. I aim to reply within three working days and will credit you in the fix if you like.

In scope: the live site and its API (`/api/*`), and the code, GitHub Actions workflows and
Terraform in this repository. Please don't run load or denial-of-service tests against the live
site; it scales to three instances on purpose.

## How a release is protected

- The image is built once in CI, smoke-tested, checked by Lighthouse and blocked on any critical
  CVE that has a fix available (Trivy). Only then is it pushed, with an SBOM and build provenance attested by CI.
- The deploy refuses an image whose attestations do not verify as made by this repository's CI,
  starts it with no traffic, smoke-tests it at its own URL, and only then moves traffic to it. If
  the live checks fail after that, traffic goes back to the previous revision automatically.
- Deploys are keyless (GitHub OIDC to Workload Identity Federation) and only run for pushes to
  `main` in this repository. The deployer can push images to one repository and deploy one service.
- Actions are pinned to commit SHAs and base images to digests; Dependabot proposes the updates.
  CodeQL and OpenSSF Scorecard run on every push to `main`.
- Secrets (the contact webhook, an optional LLM key) live in Secret Manager. Terraform creates the
  empty secrets and never sees their values.
