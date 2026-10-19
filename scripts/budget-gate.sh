#!/usr/bin/env bash
# Error-budget gate for releases: ./scripts/budget-gate.sh <base-url>
#
# Reads the live site's own SLO (/api/slo). While error budget is left, every release ships. Once it
# is spent, releases freeze: only a commit that says it is a reliability fix, with a
# "Reliability-fix: <why>" line in its message, ships, or a manual deploy that states an override.
# If the SLO cannot be read, the gate stays open and says so: losing the measurement should not
# stop a fix from shipping.
#
# Environment: COMMIT_MESSAGE (the full message of the commit being released), OVERRIDE (a reason,
# optional), GITHUB_STEP_SUMMARY (optional; the verdict is also written there).
set -euo pipefail
BASE="${1:?usage: budget-gate.sh <base-url>}"

verdict() { # line for the log and the run summary
  echo "$1"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$1" >>"$GITHUB_STEP_SUMMARY"; fi
}

if ! slo=$(curl -fsS --max-time 20 "$BASE/api/slo"); then
  echo "::warning::Could not read the SLO; the error-budget gate is open by default."
  verdict "**Error-budget gate: open.** The SLO could not be read, and a missing measurement does not block a release."
  exit 0
fi

releases=$(jq -r '.releases // "unknown"' <<<"$slo")
budget=$(jq -r 'if .available then ((.budget_remaining * 1000 | round) / 10) as $p
  | if $p < 0 then "overspent by \(-$p)%" else "\($p)% left" end else "not measured" end' <<<"$slo")

case "$releases" in
open)
  verdict "**Error-budget gate: open.** 30-day error budget: $budget."
  exit 0
  ;;
frozen) ;;
*)
  verdict "**Error-budget gate: open.** Nothing measured yet, so there is no budget to enforce."
  exit 0
  ;;
esac

fix=$(grep -i -m1 '^Reliability-fix:' <<<"${COMMIT_MESSAGE:-}" | sed 's/^[^:]*: *//' || true)
if [ -n "$fix" ]; then
  verdict "**Error-budget gate: frozen, release allowed.** The 30-day error budget is spent ($budget); this commit is a reliability fix: $fix"
  exit 0
fi
if [ -n "${OVERRIDE:-}" ]; then
  echo "::warning::Error budget spent; released on a manual override."
  verdict "**Error-budget gate: frozen, overridden.** The 30-day error budget is spent ($budget). Override: $OVERRIDE"
  exit 0
fi
echo "::error::The 30-day error budget is spent ($budget), so releases are frozen. Ship reliability work first: add a 'Reliability-fix: <why>' line to the commit message, or run the deploy by hand with an override reason."
verdict "**Error-budget gate: frozen, release held.** The 30-day error budget is spent ($budget) and this commit is not marked as a reliability fix."
exit 1
