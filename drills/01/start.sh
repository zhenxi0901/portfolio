#!/usr/bin/env bash
# Build the site's Go server, start it on :8080 with the real knowledge base, then send it traffic.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
bash "$ROOT/drills/01/serve.sh"
cat "$ROOT/drills/01/BRIEF.txt"
exec bash "$ROOT/drills/01/traffic.sh"
