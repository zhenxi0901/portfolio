#!/usr/bin/env bash
# Smoke-test a running instance: ./scripts/smoke.sh [base-url]
set -uo pipefail
# Checks pipe into grep without -q: grep -q exits at the first match, curl then fails
# writing the rest of the body, and pipefail would report a passing check as FAIL.
BASE="${1:-http://localhost:8080}"
fail=0
check() { # name, command
  if eval "$2" >/dev/null 2>&1; then echo "  ok    $1"; else echo "  FAIL  $1"; fail=1; fi
}
echo "Smoke test against $BASE"
check "health (/api/health)"         "curl -fsS $BASE/api/health | grep ok"
check "home page has the name"      "curl -fsS $BASE/ | grep 'Li ZhenXi'"
check "knowledge.json served"       "curl -fsS $BASE/knowledge.json | grep case-reaper"
check "résumé PDF served"           "curl -fsS -o /dev/null -w '%{content_type}' $BASE/Li_ZhenXi_Resume.pdf | grep pdf"
check "unknown page is 404"         "test \$(curl -s -o /dev/null -w '%{http_code}' $BASE/does-not-exist) = 404"
check "status JSON"                 "curl -fsS $BASE/api/status | grep '\"status\":\"ok\"'"
check "ask answers from facts"      "curl -fsS -X POST $BASE/api/ask -H 'Content-Type: application/json' -d '{\"question\":\"How did you cut the cloud bill?\"}' | grep 15%"
check "ask rejects bad input"       "test \$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/ask -H 'Content-Type: application/json' -d '{\"question\":\"x\"}') = 400"
# 429 also counts: the contact limit is 3 per 10 minutes, so back-to-back runs hit it first.
check "contact rejects bad input"   "curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/contact -H 'Content-Type: application/json' -d '{\"name\":\"\"}' | grep -E '^(400|429)$'"
check "CSP header"                  "curl -fsSI $BASE/ | grep -i 'content-security-policy'"
asset_immutable() {
  local a
  a=$(curl -fsS "$BASE/" | grep -o '/_next/static/[^"]*[.]js' | head -1)
  [ -n "$a" ] && curl -fsSI "$BASE$a" | grep -i immutable
}
check "hashed assets immutable"     "asset_immutable"
check "pages sent compressed"       "curl -fsS -o /dev/null -D - -H 'Accept-Encoding: br, gzip' $BASE/ | grep -i '^content-encoding: br'"
check "metrics exposed"             "curl -fsS $BASE/metrics | grep portfolio_build_info"
exit $fail
