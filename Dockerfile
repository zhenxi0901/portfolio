# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
# One image, one origin: the Next.js static export and the Go API that serves it.
# Base images are pinned by digest, so they only change in a reviewed commit (Dependabot proposes
# the updates).

# 1. Build the static site.
FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 2. Build the API as a static binary.
FROM golang:1.27-alpine@sha256:d200d2dd76b03a99b52651fd1325aff7dcd35422c35c01bac56571b0507f3deb AS api
WORKDIR /src
COPY api/go.mod api/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY api/ ./
ARG VERSION=dev
ARG COMMIT=unknown
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath \
      -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" \
      -o /out/server ./cmd/server

# 3. Minimal runtime: no shell, no package manager, non-root.
FROM gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab
COPY --from=api /out/server /server
COPY --from=web /web/out /site
ENV PORT=8080 STATIC_DIR=/site DATA_DIR=/tmp/contact
EXPOSE 8080
USER nonroot:nonroot
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD ["/server", "healthcheck"]
ENTRYPOINT ["/server"]
