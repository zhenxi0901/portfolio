<!-- Generated from web/src/content/decisions.ts by web/scripts/gen-adr.mts. Edit that file, not this one. -->

# 4. Measure the site's SLO from outside

- Status: Accepted
- Date: 2026-10-19

## Context

The service scales to zero and Prometheus does not run on Cloud Run, so request metrics only exist while an instance does.

Server-side numbers also miss the front door: the health check that only worked from inside returned 200 to the container and 404 to the world.

## Decision

SLI: the share of Cloud Monitoring uptime checks, run every minute from Singapore, Belgium and Oregon, that get a 2xx from /api/health within 10 seconds. SLO: 99.9% over 30 days, a budget of 43.2 minutes.

The API reads the results back from Cloud Monitoring and the status section shows availability, downtime and budget left.

## Consequences

What it buys:

- It measures what a visitor gets, through the same front door, from three continents.
- About 130,000 checks a month fits in Cloud Monitoring's free allowance.

What it costs:

- One endpoint, sampled once a minute: a failure that lasts seconds, or that only breaks one page, can be missed.
- Monitoring stores several samples per probe, so the counts mean something only as a ratio.
- The probes keep an instance warm, so cold starts are rarer than real traffic alone would make them.

## Evidence

- [infra/slo.tf](../../infra/slo.tf)
- [api/internal/slo/slo.go](../../api/internal/slo/slo.go)
