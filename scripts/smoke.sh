#!/usr/bin/env bash
# Smoke-test a running instance: ./scripts/smoke.sh [base-url]
set -uo pipefail
BASE="${1:-http://localhost:8080}"
fail=0
check() { # name, command
  if eval "$2" >/dev/null 2>&1; then echo "  ok    $1"; else echo "  FAIL  $1"; fail=1; fi
}
echo "Smoke test against $BASE"
check "health (/api/health)"         "curl -fsS $BASE/api/health | grep -q ok"
check "home page has the name"      "curl -fsS $BASE/ | grep -q 'Li ZhenXi'"
check "knowledge.json served"       "curl -fsS $BASE/knowledge.json | grep -q case-reaper"
check "résumé PDF served"           "curl -fsS -o /dev/null -w '%{content_type}' $BASE/Li_ZhenXi_Resume.pdf | grep -q pdf"
check "unknown page is 404"         "test \$(curl -s -o /dev/null -w '%{http_code}' $BASE/does-not-exist) = 404"
check "status JSON"                 "curl -fsS $BASE/api/status | grep -q '\"status\":\"ok\"'"
check "ask answers from facts"      "curl -fsS -X POST $BASE/api/ask -H 'Content-Type: application/json' -d '{\"question\":\"How did you cut the cloud bill?\"}' | grep -q 15%"
check "ask rejects bad input"       "test \$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/ask -H 'Content-Type: application/json' -d '{\"question\":\"x\"}') = 400"
check "contact validates"           "test \$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/contact -H 'Content-Type: application/json' -d '{\"name\":\"\"}') = 400"
check "CSP header"                  "curl -fsSI $BASE/ | grep -qi 'content-security-policy'"
asset_immutable() {
  local a
  a=$(curl -fsS "$BASE/" | grep -o '/_next/static/[^"]*[.]js' | head -1)
  [ -n "$a" ] && curl -fsSI "$BASE$a" | grep -qi immutable
}
check "hashed assets immutable"     "asset_immutable"
check "metrics exposed"             "curl -fsS $BASE/metrics | grep -q portfolio_build_info"
exit $fail
