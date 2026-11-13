#!/usr/bin/env bash
# (Re)build and (re)start the server in the background. TRUST_PROXY is on, as it is behind Google's
# front end in production, so each simulated visitor (X-Forwarded-For) gets its own rate limit.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
PIDFILE=/tmp/portfolio-server.pid
cd "$ROOT/api"
echo "building the server..."
go build -o /tmp/portfolio-server ./cmd/server
mkdir -p /tmp/drill-site
cp "$ROOT/drills/01/site/index.html" /tmp/drill-site/
cp internal/ask/testdata/knowledge.json /tmp/drill-site/
bash "$ROOT/drills/01/stop.sh" >/dev/null

# Wait for the old server to let go of the port. Anything still answering after that isn't ours
# (a `go run` left open?), and the check would grade it instead of this build.
for _ in $(seq 1 10); do
  curl -s -o /dev/null localhost:8080/api/health || break
  sleep 0.3
done
if curl -s -o /dev/null localhost:8080/api/health; then
  echo "something else is already serving :8080 (a go run left open?). Stop it first, or the check would grade it instead of your build." >&2
  exit 1
fi

STATIC_DIR=/tmp/drill-site TRUST_PROXY=true PORT=8080 nohup /tmp/portfolio-server >/tmp/drill-server.log 2>&1 &
pid=$!
echo "$pid" >"$PIDFILE"
for _ in $(seq 1 50); do
  kill -0 "$pid" 2>/dev/null || break # it exited: a build that can't serve
  if curl -fsS localhost:8080/api/health >/dev/null 2>&1; then
    echo "the server is up on :8080 (log: /tmp/drill-server.log)"
    exit 0
  fi
  sleep 0.2
done
echo "the server did not start; the end of its log:" >&2
tail -20 /tmp/drill-server.log >&2
rm -f "$PIDFILE"
exit 1
