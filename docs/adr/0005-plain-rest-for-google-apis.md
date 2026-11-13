<!-- Generated from web/src/content/decisions.ts by web/scripts/gen-adr.mts. Edit that file, not this one. -->

# 5. Call Google Cloud with plain REST, not client libraries

- Status: Accepted
- Date: 2026-10-19

## Context

The API reads uptime results from Cloud Monitoring and exports OpenTelemetry spans to Cloud Trace. Google's Go client libraries for both bring gRPC and a large dependency tree.

## Decision

Take the project ID and an access token from the metadata server and call the REST APIs directly: Monitoring's timeSeries query, and a small span exporter for Cloud Trace's traces:batchWrite.

## Consequences

What it buys:

- The dependency tree stays small (ADR 2), and both clients are tested against fake servers, metadata server included.
- Each Ask answer can show its own spans, because the spans pass through a recorder the API owns.

What it costs:

- I own the exporter: batching, timeouts and any change in the API are mine to handle.
- Only the calls the site needs exist; anything new is another hand-written request.

## Evidence

- [api/internal/gcp: the metadata server client](../../api/internal/gcp/metadata.go)
- [api/internal/tracing/cloudtrace.go: the exporter](../../api/internal/tracing/cloudtrace.go)
