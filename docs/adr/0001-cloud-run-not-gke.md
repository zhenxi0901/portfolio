<!-- Generated from web/src/content/decisions.ts by web/scripts/gen-adr.mts. Edit that file, not this one. -->

# 1. Run the site on Cloud Run, not GKE

- Status: Accepted
- Date: 2026-10-01

## Context

A personal site gets little traffic, in bursts, and has to cost close to nothing: the project's budget alert is set at S$1 a month.

I run GKE at work, so a cluster would have been the familiar choice. It would also have meant a control plane, node pools and upgrades for one small service.

## Decision

Cloud Run, scaling to zero, at most three instances of one CPU and 256 MiB, billed per request (CPU idles between requests).

## Consequences

What it buys:

- Near-zero cost, HTTPS and immutable revisions built in, and nothing to patch.
- Revisions and traffic tags are what make releasing with no traffic, and rolling back in seconds, cheap (ADR 3).

What it costs:

- Cold starts. The status section says when a visitor woke the server up; the uptime checks keep an instance warm most of the time.
- No CPU once the response is written, so work cannot be left running afterwards. The contact form learned this the hard way: see its postmortem.
- Memory is per instance, so rate limits and caches are per instance too. At three instances that is an acceptable approximation.

## Evidence

- [infra/main.tf: the service, scaling and limits](../../infra/main.tf)
- [api/internal/server/timing.go: telling a visitor they woke it up](../../api/internal/server/timing.go)
