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

poll "select exists(select 1 from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='task_s5' and o.status='done')" 900
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

# ------------------------------------------------------------------ S6 ------
# Blocked-by cascade driven end-to-end by real opencode runs: only A may
# dispatch while B's 'blocks' edge holds; after A's run finishes and A is
# force-completed (user accept at the review gate -> updateStatus), the
# dependency cascade must dispatch B for its own real run.
echo "== S6 blocked-by cascade (real runs) =="
seed cleanup
seed s6
rm -f "$ROOT/apps/cli/e2e-orchestration-s6a.txt" "$ROOT/apps/cli/e2e-orchestration-s6b.txt"

drive watchdog >/dev/null
poll "select exists(select 1 from task_dispatches where task_id='task_s6a')" 30
S6_A_DISP="$(q "select count(*) from task_dispatches where task_id='task_s6a'")"
S6_B_DISP="$(q "select count(*) from task_dispatches where task_id='task_s6b'")"
assert S6 "only A dispatches while B's dep edge holds" \
  "$([ "$S6_A_DISP" -ge 1 ] && [ "$S6_B_DISP" = 0 ] && echo PASS || echo FAIL)" \
  "dispatches_A=$S6_A_DISP dispatches_B=$S6_B_DISP"

q "update task_dispatches set updated_at=now()-interval '6 minutes' where task_id='task_s6a' and phase='waiting'" >/dev/null
drive watchdog >/dev/null
poll "select exists(select 1 from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='task_s6a' and o.status='done')" 900
S6_A_OP="$(q "select o.status from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='task_s6a' limit 1")"
assert S6 "A's real opencode run finishes the op" \
  "$([ "$S6_A_OP" = done ] && echo PASS || echo FAIL)" "op_status=$S6_A_OP"
S6_A_FILE="MISSING"; [ -f "$ROOT/apps/cli/e2e-orchestration-s6a.txt" ] && S6_A_FILE="$(cat "$ROOT/apps/cli/e2e-orchestration-s6a.txt")"
assert S6 "opencode wrote apps/cli/e2e-orchestration-s6a.txt containing ok" \
  "$(echo "$S6_A_FILE" | grep -q 'ok' && echo PASS || echo FAIL)" "file=$S6_A_FILE"

drive oncomplete --task task_s6a >"$LOGDIR/s6a.oncomplete"
S6_A_ST="$(q "select status from tasks where id='task_s6a'")"
S6_A_PH="$(q "select phase from task_dispatches where task_id='task_s6a' limit 1")"
assert S6 "A parks at the review gate (paused) after a real run" \
  "$([ "$S6_A_ST" = paused ] && [ "$S6_A_PH" = succeeded ] && echo PASS || echo FAIL)" \
  "task_s6a=$S6_A_ST dispatch=$S6_A_PH"

# Force-complete A the way a user accepts a paused run; the service fires
# cascadeOnCompletion which runs B. A following watchdog pass is the fallback
# intake path (identical production outcome either way).
drive setstatus --task task_s6a --status completed >"$LOGDIR/s6.complete"
S6_A_FINAL="$(q "select status from tasks where id='task_s6a'")"
drive watchdog >/dev/null
poll "select exists(select 1 from task_dispatches where task_id='task_s6b')" 60
S6_B_DISP2="$(q "select count(*) from task_dispatches where task_id='task_s6b'")"
assert S6 "completing A dispatches B (cascade/intake)" \
  "$([ "$S6_A_FINAL" = completed ] && [ "$S6_B_DISP2" -ge 1 ] && echo PASS || echo FAIL)" \
  "task_s6a=$S6_A_FINAL dispatches_B=$S6_B_DISP2"

q "update task_dispatches set updated_at=now()-interval '6 minutes' where task_id='task_s6b' and phase='waiting'" >/dev/null
drive watchdog >/dev/null
poll "select exists(select 1 from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='task_s6b' and o.status='done')" 900
S6_B_OP="$(q "select o.status from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='task_s6b' limit 1")"
assert S6 "B's real opencode run finishes the op" \
  "$([ "$S6_B_OP" = done ] && echo PASS || echo FAIL)" "op_status=$S6_B_OP"
S6_B_FILE="MISSING"; [ -f "$ROOT/apps/cli/e2e-orchestration-s6b.txt" ] && S6_B_FILE="$(cat "$ROOT/apps/cli/e2e-orchestration-s6b.txt")"
assert S6 "opencode wrote apps/cli/e2e-orchestration-s6b.txt containing ok" \
  "$(echo "$S6_B_FILE" | grep -q 'ok' && echo PASS || echo FAIL)" "file=$S6_B_FILE"

drive oncomplete --task task_s6b >"$LOGDIR/s6b.oncomplete"
S6_B_ST="$(q "select status from tasks where id='task_s6b'")"
S6_B_PH="$(q "select phase from task_dispatches where task_id='task_s6b' limit 1")"
assert S6 "B settles at the review gate after its real run" \
  "$([ "$S6_B_ST" = paused ] && [ "$S6_B_PH" = succeeded ] && echo PASS || echo FAIL)" \
  "task_s6b=$S6_B_ST dispatch=$S6_B_PH"

# ------------------------------------------------------------------ S7 ------
# Subtask completion with a real run: C dispatches and runs real opencode,
# then settles 'completed' (subtasks bypass the root review gate); the parent
# stays paused on its checkpoint.
echo "== S7 subtask (real run) =="
seed cleanup
seed s7
rm -f "$ROOT/apps/cli/e2e-orchestration-s7.txt"

drive watchdog >/dev/null
poll "select exists(select 1 from task_dispatches where task_id='task_s7c')" 30
S7_C_DISP="$(q "select count(*) from task_dispatches where task_id='task_s7c'")"
assert S7 "child C dispatched by backlog intake" \
  "$([ "$S7_C_DISP" -ge 1 ] && echo PASS || echo FAIL)" "dispatches_for_C=$S7_C_DISP"

q "update task_dispatches set updated_at=now()-interval '6 minutes' where task_id='task_s7c' and phase='waiting'" >/dev/null
drive watchdog >/dev/null
poll "select exists(select 1 from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='task_s7c' and o.status='done')" 900
S7_C_OP="$(q "select o.status from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='task_s7c' limit 1")"
assert S7 "C's real opencode run finishes the op" \
  "$([ "$S7_C_OP" = done ] && echo PASS || echo FAIL)" "op_status=$S7_C_OP"
S7_FILE="MISSING"; [ -f "$ROOT/apps/cli/e2e-orchestration-s7.txt" ] && S7_FILE="$(cat "$ROOT/apps/cli/e2e-orchestration-s7.txt")"
assert S7 "opencode wrote apps/cli/e2e-orchestration-s7.txt containing ok" \
  "$(echo "$S7_FILE" | grep -q 'ok' && echo PASS || echo FAIL)" "file=$S7_FILE"

drive oncomplete --task task_s7c >"$LOGDIR/s7.oncomplete"
S7_C_ST="$(q "select status from tasks where id='task_s7c'")"
S7_P_ST="$(q "select status from tasks where id='task_s7p'")"
S7_C_PH="$(q "select phase from task_dispatches where task_id='task_s7c' limit 1")"
assert S7 "C lands completed via completeSubtask (not paused)" \
  "$([ "$S7_C_ST" = completed ] && [ "$S7_C_PH" = succeeded ] && echo PASS || echo FAIL)" \
  "task_s7c=$S7_C_ST dispatch=$S7_C_PH"
assert S7 "P stays paused (checkpoint afterIds unset)" \
  "$([ "$S7_P_ST" = paused ] && echo PASS || echo FAIL)" "task_s7p=$S7_P_ST"

# ------------------------------------------------------------------ S8 ------
# Tier matching with real runs: a three-band roster (low/mid/high). The
# high-priority task seeded on the low agent must rebind to the high band; the
# low-priority task seeded on the high agent must rebind down to the cheap
# band. Bindings are asserted off task_dispatches.agent_id + tier, then both
# dispatches execute real opencode runs.
echo "== S8 tier matching (real runs) =="
seed cleanup
seed s8
rm -f "$ROOT/apps/cli/e2e-orchestration-s8-high.txt" "$ROOT/apps/cli/e2e-orchestration-s8-low.txt"

drive watchdog >/dev/null
poll "select exists(select 1 from task_dispatches where task_id='task_s8_high')" 30
poll "select exists(select 1 from task_dispatches where task_id='task_s8_low')" 30
S8_H_BIND="$(q "select agent_id||':'||coalesce(tier,'-') from task_dispatches where task_id='task_s8_high' order by generation desc limit 1")"
S8_L_BIND="$(q "select agent_id||':'||coalesce(tier,'-') from task_dispatches where task_id='task_s8_low' order by generation desc limit 1")"
assert S8 "priority-1 task binds the high-tier agent" \
  "$([ "$S8_H_BIND" = 'ag_opencode_e2e:high' ] && echo PASS || echo FAIL)" "bind=$S8_H_BIND"
assert S8 "priority-5 task binds the low-tier agent" \
  "$([ "$S8_L_BIND" = 'ag_opencode_e2e_low:low' ] && echo PASS || echo FAIL)" "bind=$S8_L_BIND"
S8_H_AS="$(q "select assignee_agent_id from tasks where id='task_s8_high'")"
S8_L_AS="$(q "select assignee_agent_id from tasks where id='task_s8_low'")"
assert S8 "assignee write matches the dispatch binding" \
  "$([ "$S8_H_AS" = ag_opencode_e2e ] && [ "$S8_L_AS" = ag_opencode_e2e_low ] && echo PASS || echo FAIL)" \
  "high=$S8_H_AS low=$S8_L_AS"

# Drive both dispatches through real runs serially: the project's
# concurrencyLimit=1 parks the loser at 'waiting', so each task must run AND
# settle (oncomplete) before the next one's resume pass frees the slot.
S8_H_OP=none; S8_L_OP=none
for T in task_s8_high task_s8_low; do
  q "update task_dispatches set updated_at=now()-interval '6 minutes' where task_id='$T' and phase='waiting'" >/dev/null
  drive watchdog >/dev/null
  poll "select exists(select 1 from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='$T' and o.status='done')" 900
  [ "$T" = task_s8_high ] && S8_H_OP="$(q "select o.status from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='$T' limit 1")"
  [ "$T" = task_s8_low ] && S8_L_OP="$(q "select o.status from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='$T' limit 1")"
  drive oncomplete --task "$T" >>"$LOGDIR/s8.oncomplete"
done
assert S8 "both bound agents run real opencode to done" \
  "$([ "$S8_H_OP" = done ] && [ "$S8_L_OP" = done ] && echo PASS || echo FAIL)" \
  "high_op=$S8_H_OP low_op=$S8_L_OP"
S8_H_FILE="MISSING"; [ -f "$ROOT/apps/cli/e2e-orchestration-s8-high.txt" ] && S8_H_FILE="$(cat "$ROOT/apps/cli/e2e-orchestration-s8-high.txt")"
S8_L_FILE="MISSING"; [ -f "$ROOT/apps/cli/e2e-orchestration-s8-low.txt" ] && S8_L_FILE="$(cat "$ROOT/apps/cli/e2e-orchestration-s8-low.txt")"
assert S8 "opencode wrote both tier artifacts" \
  "$( { grep -q 'ok' "$ROOT/apps/cli/e2e-orchestration-s8-high.txt" 2>/dev/null && grep -q 'ok' "$ROOT/apps/cli/e2e-orchestration-s8-low.txt" 2>/dev/null; } && echo PASS || echo FAIL)" \
  "high_file=$S8_H_FILE low_file=$S8_L_FILE"

S8_H_PH="$(q "select phase from task_dispatches where task_id='task_s8_high' order by generation desc limit 1")"
S8_L_PH="$(q "select phase from task_dispatches where task_id='task_s8_low' order by generation desc limit 1")"
assert S8 "both tiered dispatches settle succeeded" \
  "$([ "$S8_H_PH" = succeeded ] && [ "$S8_L_PH" = succeeded ] && echo PASS || echo FAIL)" \
  "high=$S8_H_PH low=$S8_L_PH"

# ------------------------------------------------------------------ S9 ------
# Escalate-on-failure with real runs: the low band's model is seeded broken so
# its opencode run errors for real. After the dispatch lands 'failed' and the
# task parks 'paused', requeueing to backlog (user retry) triggers the next
# intake pass to escalate required 'low' -> 'mid' off the terminally failed
# orchestrated dispatch and rebind the mid-tier agent for a real success.
echo "== S9 escalate-on-failure (real runs) =="
seed cleanup
seed s9
rm -f "$ROOT/apps/cli/e2e-orchestration-s9.txt"

drive watchdog >/dev/null
poll "select exists(select 1 from task_dispatches where task_id='task_s9')" 30
S9_B1="$(q "select agent_id||':'||coalesce(tier,'-') from task_dispatches where task_id='task_s9' order by generation desc limit 1")"
assert S9 "first attempt binds the low-tier agent" \
  "$([ "$S9_B1" = 'ag_opencode_e2e_low:low' ] && echo PASS || echo FAIL)" "bind=$S9_B1"

q "update task_dispatches set updated_at=now()-interval '6 minutes' where task_id='task_s9' and phase='waiting'" >/dev/null
drive watchdog >/dev/null
poll "select exists(select 1 from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='task_s9' and o.status='error')" 900
S9_OP1="$(q "select o.status from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='task_s9' limit 1")"
assert S9 "broken-model opencode run lands the op in error" \
  "$([ "$S9_OP1" = error ] && echo PASS || echo FAIL)" "op_status=$S9_OP1"

drive oncomplete --task task_s9 >"$LOGDIR/s9.oncomplete1"   # reason defaults to op status 'error'
S9_PH1="$(q "select phase from task_dispatches where task_id='task_s9' order by generation desc limit 1")"
S9_T1="$(q "select status from tasks where id='task_s9'")"
assert S9 "failed orchestrated attempt settles failed + task paused" \
  "$([ "$S9_PH1" = failed ] && [ "$S9_T1" = paused ] && echo PASS || echo FAIL)" \
  "dispatch=$S9_PH1 task=$S9_T1"

# User requeue: paused -> backlog through the real updateStatus path, then the
# next intake pass must escalate to the next tier up.
drive setstatus --task task_s9 --status backlog >"$LOGDIR/s9.requeue"
drive watchdog >/dev/null
poll "select exists(select 1 from task_dispatches where task_id='task_s9' and generation=2)" 60
S9_B2="$(q "select agent_id||':'||coalesce(tier,'-') from task_dispatches where task_id='task_s9' order by generation desc limit 1")"
S9_AS2="$(q "select assignee_agent_id from tasks where id='task_s9'")"
assert S9 "retry rebinds the next tier up (mid)" \
  "$([ "$S9_B2" = 'ag_opencode_e2e_mid:mid' ] && [ "$S9_AS2" = ag_opencode_e2e_mid ] && echo PASS || echo FAIL)" \
  "bind=$S9_B2 assignee=$S9_AS2"

q "update task_dispatches set updated_at=now()-interval '6 minutes' where task_id='task_s9' and phase='waiting'" >/dev/null
drive watchdog >/dev/null
poll "select exists(select 1 from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='task_s9' and o.status='done')" 900
S9_OP2="$(q "select o.status from agent_operations o join task_dispatches d on d.operation_id=o.id where d.task_id='task_s9' order by d.created_at desc limit 1")"
assert S9 "escalated agent's real run finishes the op" \
  "$([ "$S9_OP2" = done ] && echo PASS || echo FAIL)" "op_status=$S9_OP2"
S9_FILE="MISSING"; [ -f "$ROOT/apps/cli/e2e-orchestration-s9.txt" ] && S9_FILE="$(cat "$ROOT/apps/cli/e2e-orchestration-s9.txt")"
assert S9 "opencode wrote apps/cli/e2e-orchestration-s9.txt containing ok" \
  "$(echo "$S9_FILE" | grep -q 'ok' && echo PASS || echo FAIL)" "file=$S9_FILE"

drive oncomplete --task task_s9 >"$LOGDIR/s9.oncomplete2"
S9_PH2="$(q "select phase from task_dispatches where task_id='task_s9' order by generation desc limit 1")"
S9_T2="$(q "select status from tasks where id='task_s9'")"
assert S9 "escalated attempt settles succeeded + task at review gate" \
  "$([ "$S9_PH2" = succeeded ] && [ "$S9_T2" = paused ] && echo PASS || echo FAIL)" \
  "dispatch=$S9_PH2 task=$S9_T2"

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
