# Orchestration scenario harness

Deterministic scenario suite for the durable-dispatch orchestration semantics
(task graphs, blocking dependencies, subtask completion, dispatch fencing,
orphan recovery) plus real bound-device `opencode` executions: S5-S9 each
drive the scenario through at least one genuine `opencode run` on the fixture
device and assert both the model artifact and the orchestration state
transitions (S6 blocked-by cascade, S7 subtask completion, S8 tier matching,
S9 escalate-on-failure).

This is a DB-state-driven harness, separate from the Cucumber/Playwright suite
in `e2e/src`: each scenario is `SQL seed → in-process workflow passes → DB
assertions → PASS/FAIL`. Workflow passes drive the real code paths
(`watchdog` handler, `onTopicComplete` handler, `TaskRunnerService.runTask`)
via `bunx vite-node` — no HTTP, no mocks of the sweep logic itself.

## Prerequisites

1. Dockerless dev env per `docs/development/local-setup.md`: Postgres + Redis
   running, `orvilo_test` migrated, e2e fixture applied (`user_agent_testing_001`,
   `ws_e2e`, `ag_opencode_e2e`, `prj_e2e` with autoDispatch).
2. `dev-env.sh` (server env incl. `FEATURE_FLAGS` with `+caid_dispatch`,
   `DEVICE_GATEWAY_*`) reachable at `.records/harness/dev-env.sh` or
   `ORCH_ENV_FILE`.
3. For scenarios 5-9: the CLI device daemon connected
   (`bun apps/cli/src/index.ts connect --gateway <gw> --workspace ws_e2e -d`)
   and `opencode` installed (`opencode run --model opencode/big-pickle "say ok"`).
   Scenarios 1-4 only need the DB; they fabricate dispatch/op rows.

## Run

```bash
./e2e/orchestration/run.sh
```

Writes `e2e/orchestration/REPORT.md` and echoes the assertion table. Useful
overrides: `ORCH_DATABASE_URL`, `ORCH_ENV_FILE`, `ORCH_REPORT`.

## Layout

- `drivers/watchdog.ts` — invokes the real watchdog workflow handler.
- `drivers/oncomplete.ts` — delivers the on-topic-complete lifecycle webhook
  in-process (reads dispatch/fence/generation/op/topic ids from the DB for
  `--task`), the same handler the Hatchet worker POSTs to.
- `drivers/runtask.ts` — fires N concurrent `TaskRunnerService.runTask` calls
  on one task for the fencing scenario.
- `drivers/setstatus.ts` — transitions a task through the real
  `TaskService.updateStatus` path (the user accept/retry action): `completed`
  force-completes a paused task and fires the dependency cascade, `backlog`
  requeues a failed task so the next intake pass can re-dispatch it.
- `seeds/*.sql` — per-scenario seeds; each deletes its own rows first, so the
  suite is re-runnable.
