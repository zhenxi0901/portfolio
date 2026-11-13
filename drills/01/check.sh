#!/usr/bin/env bash
# Grade the fix: the tests pass, and with the fixed server running, questions of every kind (small
# talk, and 1 to 30 of the site's subjects, each from a different visitor) get a 200 with a real
# answer, and the server doesn't panic once while answering them.
set -uo pipefail
ROOT=$(git rev-parse --show-toplevel)
BASE=http://localhost:8080
LOG=/tmp/drill-server.log
# Thirty different words from the site's subjects, none of them stop words.
WORDS=(kubernetes cluster migration terraform pipeline kafka topics reaper grafana alerts budget rollback latency agents benchmark prefix cache gpu sglang apptainer postmortem uptime deploys monitoring network storage database queue tracing incident)

echo "1. the tests"
out=$(cd "$ROOT/api" && go test ./... 2>&1)
status=$?
echo "$out" | tail -15 | sed 's/^/   /'
[ $status -eq 0 ] || { echo "FAIL: the tests don't pass yet."; exit 1; }

echo "2. the server, rebuilt with your change (a fresh log)"
bash "$ROOT/drills/01/serve.sh" || { echo "FAIL: the server doesn't start."; exit 1; }

echo "3. questions of every kind: small talk, and 1 to 30 of the site's subjects"
bad=()
ask() {
  local out code body
  out=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/ask" -H 'Content-Type: application/json' \
    -H "X-Forwarded-For: 10.9.$2.1" -d "{\"question\":\"$1\"}")
  code=${out##*$'\n'}
  body=${out%$'\n'*}
  if [ "$code" != 200 ]; then
    bad+=("\"$1\": HTTP $code")
  elif ! printf '%s' "$body" | grep -q '"answer":"[^"]'; then
    bad+=("\"$1\": HTTP 200 without an answer")
  fi
}
i=0
for q in "who are you" "what do you do" "tell me about it" "how does this work" "what is this" "hello?"; do
  i=$((i + 1))
  ask "$q" "$i"
done
for n in $(seq 1 30); do ask "what about $(printf '%s ' "${WORDS[@]:0:$n}")" "$((n + 10))"; done
health=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health")
panics=$(grep -c '"msg":"panic"' "$LOG" 2>/dev/null)
panics=${panics:-0}

if [ ${#bad[@]} -eq 0 ] && [ "$panics" -eq 0 ] && [ "$health" = 200 ]; then
  echo
  echo "PASS: all 36 questions got a real answer, and the server didn't panic once."
  echo "Before you close it: write the test that would have caught this (see drills/01/README.md, Afterwards)."
  exit 0
fi
echo
[ ${#bad[@]} -eq 0 ] || { echo "FAIL: ${#bad[@]} of 36 questions still don't get an answer:"; printf '   %s\n' "${bad[@]}"; }
[ "$panics" -eq 0 ] || echo "FAIL: the server panicked $panics times while answering them (\"msg\":\"panic\" in $LOG)."
[ "$health" = 200 ] || echo "FAIL: the health check answers $health."
echo "The server log is $LOG."
exit 1
