<!-- Generated from web/src/content/decisions.ts by web/scripts/gen-adr.mts. Edit that file, not this one. -->

# 2. One Go binary serves the static site and the API

- Status: Accepted
- Date: 2026-10-01

## Context

The front end is a Next.js static export; the API answers questions, takes contact messages and reports status.

Hosting the pages and the API separately means two deploys and cross-origin requests; running Next.js as a server means a Node runtime in the image and CPU on every page view.

## Decision

A Go server built on the standard library serves the export and /api/* from one origin and one image: distroless, non-root, about 30 MB.

Pages are compressed with brotli and gzip at build time and served as-is; hashed assets are cached as immutable.

## Consequences

What it buys:

- One origin, so the site needs no CORS and the content security policy stays strict.
- One image to build, test, attest and release (ADR 3); no compression work per request.
- Four direct Go dependencies: Prometheus' client and three OpenTelemetry modules.

What it costs:

- No server rendering: changing content means a rebuild, which every push to main does in minutes anyway.
- The Ask console's retrieval exists twice, in Go and in TypeScript (the browser's offline fallback). A parity test in CI keeps them giving the same answers.

## Evidence

- [Dockerfile](../../Dockerfile)
- [api/internal/server/static.go](../../api/internal/server/static.go)
- [web/scripts/gen-parity.mts: the parity fixtures](../../web/scripts/gen-parity.mts)
