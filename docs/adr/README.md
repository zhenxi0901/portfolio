<!-- Generated from web/src/content/decisions.ts by web/scripts/gen-adr.mts. Edit that file, not this one. -->

# Architecture decision records

Why this site is built the way it is: each record gives the context, the decision, and what it buys and costs. Also on the site at [/decisions](https://portfolio-emsghin2iq-as.a.run.app/decisions).

| # | Decision | Date | Status |
|---|---|---|---|
| 1 | [Run the site on Cloud Run, not GKE](0001-cloud-run-not-gke.md) | 2026-10-01 | Accepted |
| 2 | [One Go binary serves the static site and the API](0002-one-binary-one-origin.md) | 2026-10-01 | Accepted |
| 3 | [Build once, release that digest, check it before it takes traffic](0003-build-once-check-before-traffic.md) | 2026-10-19 | Accepted |
| 4 | [Measure the site's SLO from outside](0004-slo-from-outside.md) | 2026-10-19 | Accepted |
| 5 | [Call Google Cloud with plain REST, not client libraries](0005-plain-rest-for-google-apis.md) | 2026-10-19 | Accepted |
| 6 | [Answer questions by retrieval first; an LLM is optional](0006-retrieval-first-ask.md) | 2026-10-01 | Accepted |
| 7 | [The error budget gates releases, in code](0007-error-budget-gates-releases.md) | 2026-10-19 | Accepted |
| 8 | [Page with scheduled checks, not Cloud Monitoring alert policies](0008-scheduled-checks-not-alert-policies.md) | 2026-10-19 | Accepted |
| 9 | [No long-lived credentials anywhere](0009-no-long-lived-credentials.md) | 2026-10-01 | Accepted |
