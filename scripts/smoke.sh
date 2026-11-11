#!/usr/bin/env bash
# Smoke-test a running instance: ./scripts/smoke.sh [base-url]
set -uo pipefail
# Checks pipe into grep without -q: grep -q exits at the first match, curl then fails
# writing the rest of the body, and pipefail would report a passing check as FAIL.
BASE="${1:-http://localhost:8080}"
# The home page answers curl with a text card unless HTML is asked for, so checks of the page itself
# say so, as a script that scrapes it would.
HTML="-H 'Accept: text/html'"
fail=0
check() { # name, command
  if eval "$2" >/dev/null 2>&1; then echo "  ok    $1"; else echo "  FAIL  $1"; fail=1; fi
}
echo "Smoke test against $BASE"
check "health (/api/health)"         "curl -fsS $BASE/api/health | grep ok"
check "home page has the name"      "curl -fsS $HTML $BASE/ | grep '<title>' | grep 'Li ZhenXi'"
check "curl gets the text card"     "curl -fsS $BASE/ | grep 'This page is a live service'"
check "knowledge.json served"       "curl -fsS $BASE/knowledge.json | grep case-reaper"
check "unknown page is 404"         "test \$(curl -s -o /dev/null -w '%{http_code}' $BASE/does-not-exist) = 404"
check "SLO JSON"                    "curl -fsS $BASE/api/slo | grep '\"target\":0.999'"
check "status JSON"                 "curl -fsS $BASE/api/status | grep '\"status\":\"ok\"'"
check "ask answers from facts"      "curl -fsS -X POST $BASE/api/ask -H 'Content-Type: application/json' -d '{\"question\":\"How did you cut the cloud bill?\"}' | grep 15%"
check "ask rejects bad input"       "test \$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/ask -H 'Content-Type: application/json' -d '{\"question\":\"x\"}') = 400"
# 429 also counts: the contact limit is 3 per 10 minutes, so back-to-back runs hit it first.
check "contact rejects bad input"   "curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/contact -H 'Content-Type: application/json' -d '{\"name\":\"\"}' | grep -E '^(400|429)$'"
check "CSP header"                  "curl -fsSI $HTML $BASE/ | grep -i 'content-security-policy'"
asset_immutable() {
  local a
  a=$(curl -fsS -H 'Accept: text/html' "$BASE/" | grep -o '/_next/static/[^"]*[.]js' | head -1)
  [ -n "$a" ] && curl -fsSI "$BASE$a" | grep -i immutable
}
check "hashed assets immutable"     "asset_immutable"
check "pages sent compressed"       "curl -fsS -o /dev/null -D - $HTML -H 'Accept-Encoding: br, gzip' $BASE/ | grep -i '^content-encoding: br'"
# The site as an MCP server: an older client's handshake, then a tool call in the current protocol.
mcp() { curl -fsS -X POST "$BASE/mcp" -H 'Content-Type: application/json' "$@"; }
check "MCP handshake (legacy)"      "mcp -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-06-18\",\"capabilities\":{}}}' | grep '\"protocolVersion\":\"2025-06-18\"'"
META='\"_meta\":{\"io.modelcontextprotocol/protocolVersion\":\"2026-07-28\",\"io.modelcontextprotocol/clientCapabilities\":{}}'
check "MCP tool call (2026-07-28)"  "mcp -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: tools/call' -H 'Mcp-Name: ask' -d '{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"ask\",\"arguments\":{\"question\":\"How did you cut the cloud bill?\"},'\"$META\"'}}' | grep 15%"
check "llms.txt and a Markdown page" "curl -fsS $BASE/llms.txt | grep '/md/work/gke.md' && curl -fsS $BASE/md/work/gke.md | grep '^# '"
check "metrics exposed"             "curl -fsS $BASE/metrics | grep portfolio_build_info"
exit $fail
