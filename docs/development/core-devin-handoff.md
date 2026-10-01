# Core handoff to Devin

## Frozen delivery identity

- Repository: `alexj11324/orvilo1`; branch: `feat/core-cloud-integration`; draft PR targets `canary`.
- Exact implementation base: `28dc3bbad36e4661f8d09154ff8b017cf5cadaeb`.
- Frozen code/evidence HEAD: `052f8873b1644be4f00be9952961d578af81094b`.
- The publishing commit adds only this report and the final targeted-test log. Its exact SHA is recorded in the PR body and remote branch; no implementation changes or additional tests are part of publishing.
- User explicitly stopped implementation and requested draft publication for Devin. Do not infer production enablement or merge authorization.

## Delivered scope

The full branch includes all 11 original transferred control-plane files and subsequent implementation, tests and evidence (no missing untracked business files).

1. `packages/agent-execution/src/controlPlane`: portable contracts and configuration/inference guards; trusted server exports; typed action admission; file capabilities; durable filesystem/SQL receipts; read-only reconciliation; Docker whole-tree supervision; real stdio ACP transport and pinned Prime adapter; handoff and completion contracts.
2. `apps/server/src/services/controlPlane`: canonical task/dispatch/grant/member admission, opt-in runtime host, action drain/stop, owner handoff, actual Verify completion adapter, immutable authority snapshots, PostgreSQL/host acceptance.
3. `packages/database`: task-topic execution registration, CAS/atomic owner+lease+epoch handoff, durable phase history, legacy writer fencing, completion hook. Existing ACP paths remain available for unregistered tasks.
4. `scripts/acceptance` and linked documentation: pinned Prime protocol, nonempty history, SQL recovery and Docker evidence. Package exports expose portable and trusted server entry points separately.

Run `git diff --name-status 28dc3bbad36e4661f8d09154ff8b017cf5cadaeb HEAD` for the complete file list.

## Evidence and exact coverage

| Evidence                                                           | Source checkpoint                          | Result                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Restored Core boundaries, Docker, SQL and package boundary         | `940c450ac3e77692d162cef469f5d7d1795e61bc` | 141 tests / 14 files; actual pinned ACP initialization and shutdown; no provider prompt                                             |
| Canonical integration                                              | `097a909fc4e81a3b8bc57fc85706a00fe694ef29` | Core 142; PostgreSQL admission 12, completion 10; existing Verify 28 and TaskDispatch 29; see historical report                     |
| Atomic handoff candidate                                           | `3880ea52be5fd7a59ccd69bd3c75622a6b8d96fa` | PostgreSQL model 14, admission 18, completion 10; real Prime host/handoff 2; process crashes across five phases                     |
| Receipt recovery/snapshot implementation                           | `139f5de99379073d3c15326d374f42f95ed2d520` | Receipt suites 45; actual PostgreSQL recovery 9; affected admission/completion 28 and handoff 14                                    |
| Full dependency graph comparison                                   | `3e7b9f0dea82e4f869aadec3c5c32ba2db16da6b` | Both baseline/candidate exit 2 with 7,854 diagnostics; zero added sites, three existing message-only pairs. Not a passing typecheck |
| Final corrected fixtures, actual PostgreSQL restart/late callbacks | `052f8873b1644be4f00be9952961d578af81094b` | **9/9 passed**, exit 0, 2026-09-30 18:17:44 UTC, 9.81 seconds; committed sibling log                                                |

Earlier documentation says the two final fixture fixes were not rerun; this final 052f run supersedes that limitation. It does not supersede other documented fixture boundaries. No full suite was rerun for publication. Scoped lint passed during implementation; commit-time Markdown formatting is the only publication check.

No real Provider inference, external event subscription, production runner enablement, production migration or safe execution resume has been validated. Nonempty history/tool records were seeded through official upstream APIs, not produced by real model execution. See [nonempty history evidence](../../scripts/acceptance/prime-nonempty.md). The late callback test gates recovery while SQL remains prepared, so rejection specifically exercises reservation-owner fencing.

## Reproduction from a fresh checkout

Use repository-pinned dependencies (`pnpm install --frozen-lockfile`), Node 24 and Docker on Linux. Commands below are repository-relative; old machine paths in historical logs are provenance, not required inputs. Use only disposable fixture databases. Never point these tests at user or production data.

```sh
node node_modules/vitest/vitest.mjs run packages/agent-execution/src/controlPlane/receiptRecovery.test.ts packages/agent-execution/src/controlPlane/sqlReceiptStore.test.ts packages/agent-execution/src/controlPlane/actionGateway.test.ts --silent=passed-only
```

For the final nine-case suite, recreate its specifically named, labelled fixture (verify names are unused first):

```sh
docker volume create --label orvilo.acceptance=core-recovery orvilo-core-recovery-20260930
docker run -d --name orvilo-core-recovery-20260930 --label orvilo.acceptance=core-recovery -e POSTGRES_PASSWORD=core_recovery_fixture_only -e POSTGRES_DB=core_recovery -p 127.0.0.1:32772:5432 -v orvilo-core-recovery-20260930:/var/lib/postgresql sha256:545120602ea0cefb0992449b40b99e7ff88f784a339f5194b86b609a2517f722
docker exec orvilo-core-recovery-20260930 pg_isready -U postgres -d core_recovery
CORE_RECOVERY_DATABASE_URL=postgresql://postgres:core_recovery_fixture_only@127.0.0.1:32772/core_recovery node node_modules/vitest/vitest.mjs run apps/server/src/services/controlPlane/receiptRecovery.postgres.test.ts --silent=passed-only
```

The password above is a disposable test constant. The suite applies real migrations and candidate DDL and intentionally restarts that container. It currently requires Docker at `/usr/local/bin/docker`; provision that tool location on the test machine. The image must already be present or obtained from a trusted registry by its pinned identity. After tests, verify ownership labels before removing only this fixture container and volume.

For canonical/host acceptance use `TEST_SERVER_DB=1 DATABASE_TEST_URL=<disposable-url>` and, for runtime tests, `CORE_DOCKER_IMAGE=<trusted-immutable-image-id>`. See [host instructions](../core-runtime-host-acceptance.md), [handoff](core-handoff-integration.md) and [pinned build/protocol](../../scripts/acceptance/prime-protocol.md). Missing opt-in inputs skip tests; skipped is not passed.

## Remaining work, blockers and known limitations

- Production migration is absent. Core proposes `action_receipts`, `task_execution_handoffs`, `core_session_snapshots`, plus `task_topics.execution_control` and `execution_control_revision`. Do not deploy code selecting these columns before coordinated migration. Core has allocated no numbered migration.
- Provider/Events live in separate candidates. Their cloud artifacts were not shared; this branch does not contain their implementation. Existing `EventDispatchAdmission`, configuration/inference ports still require cross-branch integration and trusted backend wiring. Do not claim end-to-end event automation or ready inference.
- Opt-in host is not enabled in legacy production runners. Audit every cancellation, revocation, epoch and task-owner writer against registration/hold before enablement. Lease renewal is explicit, not a background service.
- Known existing cross-workflow task/dispatch lock-order inversion remains a reliability risk; errors fail closed. Resolve deliberately in integration, not by removing locks.
- File receipt takeover and cross-epoch receipt adoption are blocked. SQL recovery requires trusted original-writer quiescence, current authority and read-only postcondition checking. Uncertain effects remain blocked.
- Snapshot receipt reads span private durable storage and PostgreSQL; double checking is not a cross-store atomic transaction. Fresh admission is required for every later operation.
- Prime is pinned to TS v0.9.8 commit `7d442aafa985f9342134fac16c2ef41f03fb45c1`. ACP has no supported session load. History reload does not recover Python heap or authorize unfinished effects. Same-path restart locking failure is recorded. Keep `resume:none`, `loadSession:false`, explicit unsupported errors; only separately authorized fresh sessions are supported.
- Full root typecheck fails at baseline as documented; no new diagnostic sites is not a green CI claim.

## Cross-PR integration order

1. Review/import Core contracts and trusted exports from this draft. Do not touch Devin PR #357 or merge #358 as part of this handoff.
2. Reconcile Provider configuration/backend and Events admission with these canonical contracts, avoiding duplicate interfaces or a second TaskRunner. Parent coordinates their exact PR URLs.
3. Consolidate schema/migration journal once across branches: Provider had candidate 0196/0197 and Events 0198; do not overwrite or independently allocate those numbers.
4. Run combined negative/recovery acceptance with actual adapters, then separately decide production enablement. Keep external credentials, subscriptions and deployment behind explicit authorization.

## Safety boundaries and resource state

Orvilo alone owns task owner, lease, epoch, revisions, policy, decisions, dependencies, tombstones, commitments and completion. Kernel history/end_turn is never authority. Credentials/endpoints remain in trusted brokers. All effects require scope/fence/receipt/postcondition checks. Cancel/handoff must drain actions and stop the whole registered tree. Missing isolation, uncertain quiescence or stale authority must fail closed.

All implementation agents are completed or stopped. At publication preparation there are no running Docker containers or task-owned test/runtime processes. The disposable PostgreSQL recovery container and volume were removed after the final run; no user databases were deleted. Local pinned image caches may remain but are not publication artifacts. No credentials, profiles, dependency trees, scratch directories or database volumes are included. Only source, tests and textual evidence are handed off. Further dispatch to Devin is coordinated by the parent; no external agent was contacted here.
