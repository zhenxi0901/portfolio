#!/usr/bin/env bash
# Vet and race-test the API in the same Go toolchain CI uses, without installing Go locally.
set -euo pipefail
cd "$(dirname "$0")/.."
docker run --rm -v "$PWD":/src -w /src -v portfolio-gomod:/go/pkg/mod golang:1.27-alpine sh -euc '
  apk add --no-cache build-base >/dev/null
  go mod tidy
  test -z "$(gofmt -l .)" || { echo "gofmt needed:"; gofmt -l .; exit 1; }
  go vet ./...
  CGO_ENABLED=1 go test -race -count=1 -cover ./...
'
