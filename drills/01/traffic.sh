#!/usr/bin/env bash
# What the site's visitors send: the uptime checks' /api/health, status polls, and questions to
# /api/ask from many visitors (a different X-Forwarded-For each). Every two seconds, what they saw.
BASE=${BASE:-http://localhost:8080}
# Words from the site's subjects, so questions find something to answer.
WORDS=(kubernetes cluster migration terraform pipeline kafka topics reaper grafana alerts budget rollback latency agents benchmark prefix cache gpu sglang apptainer postmortem uptime deploys monitoring)

# And the questions people ask when they first open a chat box.
OPENERS=("who are you" "what do you do" "tell me about it" "how does this work" "what is this")

question() {
  # One visitor in five opens with small talk; the rest ask about 2 to 18 of the site's subjects.
  if [ $((RANDOM % 5)) -eq 0 ]; then
    echo "${OPENERS[$((RANDOM % ${#OPENERS[@]}))]}"
  else
    echo "what about $(shuf -n "$((RANDOM % 17 + 2))" -e "${WORDS[@]}" | paste -sd' ')"
  fi
}
visitor() { echo "10.$((RANDOM % 200)).$((RANDOM % 250)).$((RANDOM % 250))"; }

ok=0 fail=0 hok=0 hfail=0 sum=0 n=0 times=()
last=$SECONDS
trap 'echo; echo "traffic stopped; the server is still running (make stop)"; exit 0' INT
echo
echo "time      uptime checks   questions answered   failed"
while :; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health" -H "X-Forwarded-For: $(visitor)")
  [ "$code" = 200 ] && hok=$((hok + 1)) || hfail=$((hfail + 1))
  curl -s -o /dev/null "$BASE/api/status" -H "X-Forwarded-For: $(visitor)"
  for _ in 1 2 3; do
    q=$(question)
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/ask" -H 'Content-Type: application/json' \
      -H "X-Forwarded-For: $(visitor)" -d "{\"question\":\"$q\"}")
    if [ "$code" = 200 ]; then ok=$((ok + 1)); else fail=$((fail + 1)); fi
  done
  if [ $((SECONDS - last)) -ge 2 ]; then
    total=$((ok + fail))
    pct=$([ "$total" -gt 0 ] && echo $((100 * fail / total)) || echo 0)
    printf '%s  %3d ok, %d down   %4d of %-4d        %d%%\n' "$(date +%T)" "$hok" "$hfail" "$ok" "$total" "$pct"
    ok=0 fail=0 hok=0 hfail=0 last=$SECONDS
  fi
done
