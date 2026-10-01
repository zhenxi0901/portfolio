#!/usr/bin/env bash
# Tiny dependency-free load test (curl + awk): ./scripts/loadtest.sh [base-url] [requests] [concurrency]
set -uo pipefail
BASE="${1:-http://127.0.0.1:8080}"
N="${2:-2000}"
C="${3:-32}"

run() { # label, path, method, body
  local label=$1 path=$2 method=${3:-GET} body=${4:-}
  local start end
  start=$(date +%s.%N)
  seq "$N" | xargs -P "$C" -I{} curl -s -o /dev/null -X "$method" \
      ${body:+-H 'Content-Type: application/json' -d "$body"} \
      -w '%{http_code} %{time_total}\n' "$BASE$path" > /tmp/lt.out
  end=$(date +%s.%N)
  sort -k2 -n /tmp/lt.out | awk -v label="$label" -v secs="$(awk -v a="$start" -v b="$end" 'BEGIN{print b-a}')" '
    { t[NR]=$2*1000; code[$1]++ }
    END {
      n=NR; codes="";
      for (c in code) codes=codes c "x" code[c] " ";
      printf "%-22s %5d req  %6.0f req/s  p50 %6.1f ms  p95 %6.1f ms  p99 %6.1f ms  codes: %s\n",
        label, n, n/secs, t[int(n*0.50)], t[int(n*0.95)], t[int(n*0.99)], codes }'
}

echo "Load test: $N requests per endpoint, $C concurrent, against $BASE"
run "GET / (page)"        "/"
run "GET /api/status"     "/api/status"
run "GET /knowledge.json" "/knowledge.json"
# The Ask API allows 8 requests a minute per client, so almost all of these should be 429s.
run "POST /api/ask"       "/api/ask" POST '{"question":"How did you cut the cloud bill?"}'
echo
echo "Server-side view (/api/status):"
curl -s "$BASE/api/status" | python3 -c 'import sys,json; s=json.load(sys.stdin); print("  requests_total", s["requests_total"], " latency_ms", s["latency_ms"], " heap_mb", round(s["heap_mb"],1), " goroutines", s["goroutines"])'
