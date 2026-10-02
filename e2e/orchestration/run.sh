#!/usr/bin/env bash
# Orchestration-scenario harness: seeds SQL, drives in-process workflow passes
# (watchdog / onTopicComplete / runTask), asserts DB state transitions, and
# writes a markdown report. Requires the dockerless env from
# docs/development/local-setup.md plus the e2e fixture — see README.md.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

DSN="${ORCH_DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/orvilo_test}"
ENV_FILE="${ORCH_ENV_FILE:-.records/harness/dev-env.sh}"
REPORT="${ORCH_REPORT:-$ROOT/e2e/orchestration/REPORT.md}"
VITE="bunx vite-node --config apps/server/viteNodeServer.config.ts"

RESULTS="$(mktemp)"; : > "$RESULTS"
LOGDIR="$(mktemp -d)"

q()      { psql "$DSN" -tA -c "$1"; }
assert() { echo "ASSERT|$1|$2|$3|$4" >> "$RESULTS"; }
seed()   { psql "$DSN" -q -v ON_ERROR_STOP=1 -f "e2e/orchestration/seeds/$1.sql" >/dev/null; }

drive() { # <driver> [args...]  -> prints driver stdout, tees to log
  local driver="$1"; shift
  (source "$ENV_FILE" && $VITE "e2e/orchestration/drivers/$driver.ts" "$@") 2>"$LOGDIR/$driver.$$.err"
}

poll() { # <sql-true/false> <timeout-sec> -> 0 when query returns 't'
  local deadline=$((SECONDS + $2))
  while [ "$SECONDS" -lt "$deadline" ]; do
    [ "$(q "$1")" = "t" ] && return 0
    sleep 3
  done
  return 1
}

# ------------------------------------------------------------------ S1 ------
echo "== S1 blocked-by cascade =="
seed cleanup
seed s1

OUT="$(drive watchdog)"; echo "$OUT" | grep -o '===WATCHDOG_JSON===.*' >> "$LOGDIR/s1.watchdog1"
B_DISP="$(q "select count(*) from task_dispatches where task_id='task_s1b'")"
BLOCKED="$(echo "$OUT" | grep -o '"intakeBlocked":[0-9]*' | cut -d: -f2)"
assert S1 "B gets no dispatch while A active" "$([ "$B_DISP" = 0 ] && echo PASS || echo FAIL)" \
  "dispatches_for_B=$B_DISP intakeBlocked=$BLOCKED"

q "update agent_operations set status='done' where id='op_s1a'" >/dev/null
OC="$(drive oncomplete --task task_s1a)"; echo "$OC" >> "$LOGDIR/s1.oncomplete"
A_STATUS="$(q "select status from tasks where id='task_s1a'")"
A_PHASE="$(q "select phase from task_dispatches where id='dsp_s1a'")"
assert S1 "A settles completed via onTopicComplete" \
  "$([ "$A_STATUS" = completed ] && [ "$A_PHASE" = succeeded ] && echo PASS || echo FAIL)" \
  "task_s1a=$A_STATUS dsp_s1a=$A_PHASE"

OUT2="$(drive watchdog)"; echo "$OUT2" | grep -o '===WATCHDOG_JSON===.*' >> "$LOGDIR/s1.watchdog2"
poll "select exists(select 1 from task_dispatches where task_id='task_s1b')" 30
B_AFTER="$(q "select count(*) from task_dispatches where task_id='task_s1b'")"
B_PHASE="$(q "select phase from task_dispatches where task_id='task_s1b' limit 1")"
assert S1 "intake fires and dispatch created for B after A completes" \
  "$([ "$B_AFTER" -ge 1 ] && echo PASS || echo FAIL)" \
  "dispatches_for_B=$B_AFTER phase=$B_PHASE"

# ------------------------------------------------------------------ S2 ------
echo "== S2 subtask completion =="
seed cleanup
seed s2
drive watchdog >/dev/null
poll "select exists(select 1 from task_dispatches where task_id='task_s2c')" 30
C_DISP="$(q "select count(*) from task_dispatches where task_id='task_s2c'")"
assert S2 "child C dispatched by backlog intake" \
  "$([ "$C_DISP" -ge 1 ] && echo PASS || echo FAIL)" "dispatches_for_C=$C_DISP"

# Parked at 'waiting' by the project concurrency slot — drive the resume sweep
# by backdating updated_at past the 5-minute staleness gate.
q "update task_dispatches set updated_at=now()-interval '6 minutes' where task_id='task_s2c' and phase='waiting'" >/dev/null
drive watchdog >/dev/null
poll "select exists(select 1 from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='task_s2c')" 90
C_OP="$(q "select operation_id from task_dispatches where task_id='task_s2c' and operation_id is not null limit 1")"
C_PH2="$(q "select phase from task_dispatches where task_id='task_s2c' limit 1")"
assert S2 "resume sweep re-drives C and mints its op" \
  "$([ -n "$C_OP" ] && echo PASS || echo FAIL)" "op=$C_OP phase=$C_PH2"

q "update agent_operations set status='done' where id='$C_OP'" >/dev/null
drive oncomplete --task task_s2c >"$LOGDIR/s2.oncomplete"
C_STATUS="$(q "select status from tasks where id='task_s2c'")"
P_STATUS="$(q "select status from tasks where id='task_s2p'")"
C_PHASE="$(q "select phase from task_dispatches where task_id='task_s2c' limit 1")"
assert S2 "C lands completed via completeSubtask" \
  "$([ "$C_STATUS" = completed ] && echo PASS || echo FAIL)" \
  "task_s2c=$C_STATUS dispatch=$C_PHASE"
assert S2 "P stays paused (checkpoint afterIds unset)" \
  "$([ "$P_STATUS" = paused ] && echo PASS || echo FAIL)" "task_s2p=$P_STATUS"

# ------------------------------------------------------------------ S3 ------
echo "== S3 fence/supersede =="
seed cleanup
seed s3
RT="$(drive runtask --task task_s3 --count 2)"; echo "$RT" >> "$LOGDIR/s3.runtask"
F_OK="$(echo "$RT" | grep -c 'FULFILLED')"
F_CONFLICT="$(echo "$RT" | grep -c 'REJECTED|TRPCError:CONFLICT\|REJECTED|CONFLICT')"
S3_DISP="$(q "select count(*) from task_dispatches where task_id='task_s3' and phase not in ('succeeded','failed','canceled','abandoned')")"
assert S3 "at most one runTask attempt fulfilled" \
  "$([ "$F_OK" -le 1 ] && echo PASS || echo FAIL)" "fulfilled=$F_OK"
assert S3 "loser rejected with CONFLICT (TaskDispatchConflictError)" \
  "$([ "$F_CONFLICT" -ge 1 ] && echo PASS || echo FAIL)" \
  "conflict_rejects=$F_CONFLICT out=$(echo "$RT" | grep 'RUNTASK' | tr '\n' ' ')"
assert S3 "single active dispatch for the task" \
  "$([ "$S3_DISP" = 1 ] && echo PASS || echo FAIL)" "active_dispatches=$S3_DISP"

# ------------------------------------------------------------------ S4 ------
echo "== S4 orphan recovery =="
seed cleanup
seed s4
HB_BEFORE="$(q "select last_heartbeat_at from tasks where id='task_s4'")"
for i in 1 2 3; do drive watchdog >/dev/null; sleep 1; done
S4_PHASE="$(q "select phase from task_dispatches where id='dsp_s4'")"
S4_ATTEMPTS="$(q "select recovery_attempts from task_dispatches where id='dsp_s4'")"
S4_HB="$(q "select last_heartbeat_at > '$HB_BEFORE' from tasks where id='task_s4'")"
assert S4 "orphan reaches a terminal phase within recovery bounds" \
  "$([ "$S4_PHASE" != running ] && [ "$S4_PHASE" != outcome_unknown ] && echo PASS || echo FAIL)" \
  "phase_after_3_passes=$S4_PHASE attempts=$S4_ATTEMPTS heartbeat_rearmed=$S4_HB"
q "update task_dispatches set recovery_attempts=60, lease_expires_at=now()-interval '1 minute' where id='dsp_s4'" >/dev/null
drive watchdog >/dev/null; sleep 1
S4_AB="$(q "select phase from task_dispatches where id='dsp_s4'")"
S4_TASK="$(q "select status,error from tasks where id='task_s4'")"
assert S4 "recovery_attempts bound reached: attempts=60 -> abandoned" \
  "$([ "$S4_AB" = abandoned ] && echo PASS || echo FAIL)" \
  "phase=$S4_AB task_s4=[$S4_TASK]"

# ------------------------------------------------------------------ S5 ------
echo "== S5 real opencode run =="
seed cleanup
seed s5
rm -f "$ROOT/apps/cli/e2e-scenario5.txt"
drive watchdog >/dev/null
poll "select exists(select 1 from task_dispatches where task_id='task_s5')" 30
S5_DISP="$(q "select count(*) from task_dispatches where task_id='task_s5'")"
assert S5 "backlog intake mints a dispatch" \
  "$([ "$S5_DISP" -ge 1 ] && echo PASS || echo FAIL)" "dispatches=$S5_DISP"

# Resume path for a 'waiting' park (project concurrency slot was occupied).
q "update task_dispatches set updated_at=now()-interval '6 minutes' where task_id='task_s5' and phase='waiting'" >/dev/null
drive watchdog >/dev/null
poll "select exists(select 1 from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='task_s5')" 120
S5_PH="$(q "select phase from task_dispatches where task_id='task_s5' limit 1")"
assert S5 "dispatch reaches execution (resume or direct)" \
  "$([ "$S5_PH" != waiting ] && [ "$S5_PH" != requested ] && [ "$S5_PH" != claimed ] && echo PASS || echo FAIL)" \
  "phase=$S5_PH"

poll "select exists(select 1 from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='task_s5' and o.status='done')" 300
S5_OP="$(q "select o.status from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='task_s5' limit 1")"
assert S5 "device-bound opencode run completes the op" \
  "$([ "$S5_OP" = done ] && echo PASS || echo FAIL)" "op_status=$S5_OP"

S5_FILE="MISSING"; [ -f "$ROOT/apps/cli/e2e-scenario5.txt" ] && S5_FILE="$(cat "$ROOT/apps/cli/e2e-scenario5.txt")"
assert S5 "opencode wrote apps/cli/e2e-scenario5.txt = orch-ok" \
  "$(echo "$S5_FILE" | grep -q 'orch-ok' && echo PASS || echo FAIL)" "file=$S5_FILE"

drive oncomplete --task task_s5 >"$LOGDIR/s5.oncomplete"
S5_T="$(q "select status from tasks where id='task_s5'")"
S5_P="$(q "select phase from task_dispatches where task_id='task_s5' limit 1")"
S5_TP="$(q "select status from task_topics where task_id='task_s5' limit 1")"
assert S5 "task + dispatch + topic settle terminal" \
  "$([ "$S5_P" = succeeded ] && [ "$S5_TP" = completed ] && [ "$S5_T" != running ] && echo PASS || echo FAIL)" \
  "task=$S5_T dispatch=$S5_P topic=$S5_TP"

# ------------------------------------------------------------------ report --
{
  echo "# Orchestration scenario harness — results"
  echo
  echo "commit: $(git rev-parse --short HEAD) | db: $DSN | run: $(date -u +%FT%TZ)"
  echo
  echo "| Scenario | Assertion | Result | Evidence |"
  echo "|---|---|---|---|"
  sort -t'|' -k2,2 -k3,3 "$RESULTS" | while IFS='|' read -r _ scen name res ev; do
    echo "| $scen | $name | $res | \`$ev\` |"
  done
  echo
  echo "Drive logs: $LOGDIR"
} > "$REPORT"
echo; cat "$REPORT"
