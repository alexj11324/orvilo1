#!/bin/bash
# Serial PR merge pipeline v2 — BEHIND-tolerant.
# Per PR, per round (max 4):
#   1) merge origin/canary into the branch, push if changed
#   2) wait push-event test.yml run on the CURRENT head -> must succeed
#   3) full-rerun the pull_request run on the CURRENT head -> gate flips green
#   4) mergeable? -> squash merge; BEHIND? -> next round
# Global hard deadline 4h. STOP on: real test failure, merge conflict, blocked checks, timeout.
set -u
LOG=/tmp/pr-pipeline.log
DEADLINE=$(( $(date +%s) + 14400 ))
: > "$LOG"
say() { echo "$(date +%H:%M:%S) $*" | tee -a "$LOG"; }

PIPE=(
  "80|fix/audit-r6-quota-focus|/Users/alexjiang/Desktop/vibe/orvilo-r6"
  "86|chore/audit-r5-retire-skill-distribution|/Users/alexjiang/Desktop/vibe/orvilo-r5"
  "83|fix/audit-f8-task-view-mode|/Users/alexjiang/Desktop/vibe/orvilo-f8"
  "85|feat/audit-r1-workspace-context|/Users/alexjiang/Desktop/vibe/orvilo-r1"
  "87|fix/audit-r3-engine-provenance|/Users/alexjiang/Desktop/vibe/orvilo-r3"
  "84|fix/audit-r2-execution-fencing|/Users/alexjiang/Desktop/vibe/orvilo-r2"
  "88|feat/audit-r4-pr-delivery-gate|/Users/alexjiang/Desktop/vibe/orvilo-r4"
)

alive() { [ "$(date +%s)" -lt "$DEADLINE" ]; }

push_run_for() { # branch head8 -> "status conclusion runId" | "none - 0"
  gh run list --branch "$1" --workflow test.yml --event push --json databaseId,headSha,status,conclusion --limit 8 \
    | python3 -c "import json,sys; rs=[r for r in json.load(sys.stdin) if r['headSha'].startswith('$2')]; print(rs[0]['status'],rs[0]['conclusion'] or '-',rs[0]['databaseId']) if rs else print('none - 0')"
}

pr_run_for() { # branch head8 -> runId | ""
  gh run list --branch "$1" --workflow test.yml --event pull_request --json databaseId,headSha --limit 8 \
    | python3 -c "import json,sys; rs=[r for r in json.load(sys.stdin) if r['headSha'].startswith('$2')]; print(rs[0]['databaseId']) if rs else print('')"
}

wait_push_run() { # branch head8 -> same as push_run_for, waits
  while alive; do
    local line; line=$(push_run_for "$1" "$2")
    case "${line%% *}" in
      completed) echo "$line"; return 0 ;;
      none) sleep 20 ;;
      *) sleep 45 ;;
    esac
  done
  echo "TIMEOUT - 0"
}

wait_mergeable() { # pr tries -> MERGEABLE/<state> | BEHIND | BLOCKED/<state> | TIMEOUT/<state>
  local pr=$1 tries=${2:-24}
  while [ $tries -gt 0 ] && alive; do
    local st
    st=$(gh pr view "$pr" --json mergeable,mergeStateStatus --jq '"\(.mergeable)/\(.mergeStateStatus)"' 2>/dev/null)
    case "$st" in
      MERGEABLE/CLEAN|MERGEABLE/UNSTABLE|MERGEABLE/HAS_HOOKS) echo "$st"; return 0 ;;
      */BEHIND) echo "BEHIND"; return 0 ;;
      */BLOCKED|*/DIRTY|CONFLICTING/*) echo "$st"; return 0 ;;
      *) tries=$((tries-1)); sleep 30 ;;
    esac
  done
  echo "TIMEOUT/$(gh pr view $pr --json mergeStateStatus --jq .mergeStateStatus 2>/dev/null)"
}

# returns 0 if branch now contains canary tip (push may or may not have happened)
ensure_updated() { # worktree
  local wt=$1
  ( cd "$wt" || return 1
    git fetch origin canary -q || return 1
    if git merge-base --is-ancestor origin/canary HEAD; then return 0; fi
    if ! git merge origin/canary --no-edit -q; then
      git merge --abort 2>/dev/null; return 2
    fi
    git push -q || return 1
  )
}

for i in "${!PIPE[@]}"; do
  IFS='|' read -r pr br wt <<< "${PIPE[$i]}"
  say "=== [#$pr] start ($br) ==="
  merged=0

  for round in 1 2 3 4; do
    alive || { say "=== GLOBAL DEADLINE ==="; exit 5; }
    say "  round $round: syncing $br to canary"
    ensure_updated "$wt"
    rc=$?
    if [ $rc -eq 2 ]; then say "=== [#$pr] STOP: canary merge conflict ==="; exit 6; fi
    if [ $rc -ne 0 ]; then say "=== [#$pr] STOP: update failed ==="; exit 7; fi

    head=$(cd "$wt" && git rev-parse --short=8 HEAD)
    say "  head=$head — waiting push run"
    res=$(wait_push_run "$br" "$head")
    say "  push run: $res"
    [ "${res%% *}" = "completed" ] && [ "$(echo "$res" | awk '{print $2}')" = "success" ] || {
      say "=== [#$pr] STOP: push run not green ($res) ==="; exit 2; }

    prun=$(pr_run_for "$br" "$head")
    say "  pull_request run for $head: ${prun:-none}"
    if [ -n "$prun" ]; then
      gh run rerun "$prun" >/dev/null 2>&1 && say "  rerun issued on $prun" || say "  rerun request failed"
    else
      say "  !! no pull_request run — gate may be absent"
    fi

    say "  waiting mergeable"
    m=$(wait_mergeable "$pr" 24)
    say "  mergeable: $m"
    case "$m" in
      BEHIND) say "  canary moved again — next round"; continue ;;
      MERGEABLE/*) ;;
      *) say "=== [#$pr] STOP: $m ==="; exit 3 ;;
    esac

    unres=$(gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved}}}}}' -F o=alexj11324 -F r=orvilo1 -F n=$pr --jq '[.data.repository.pullRequest.reviewThreads.nodes[]|select(.isResolved|not)]|length' 2>/dev/null || echo "?")
    say "  unresolved threads: $unres"
    if [ "$unres" != "0" ] && [ "$unres" != "?" ]; then say "=== [#$pr] STOP: unresolved threads ==="; exit 8; fi

    if gh pr merge "$pr" --squash 2>>"$LOG"; then
      say "=== [#$pr] MERGED ==="
      merged=1
      break
    else
      say "  merge command failed — checking if just stale"
      continue
    fi
  done

  [ $merged -eq 0 ] && { say "=== [#$pr] STOP: rounds exhausted ==="; exit 9; }
  sleep 15
done
say "=== PIPELINE COMPLETE ==="
