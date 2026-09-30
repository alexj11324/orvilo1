# Core, Provider, and MCP Events integration handoff to Devin

The user stopped this session on 2026-09-30 and asked for a handover. This document is the
continuation report for the four drafts they named. It is not merge authorization, production
enablement, or a green full typecheck. Do not resume implementation in the originating agent.
Do not infer that a passing fixture authorizes deployment.

## The four source drafts

| PR                                                                       | Branch                           | State at this stop                                                      | What happened                                                                                                                      |
| ------------------------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [#360](https://github.com/alexj11324/orvilo1/pull/360) Core              | `feat/core-cloud-integration`    | Open draft against `canary`                                             | Merged into the integration branch below. Its own report remains [core-devin-handoff.md](./core-devin-handoff.md).                 |
| [#361](https://github.com/alexj11324/orvilo1/pull/361) Provider / Memory | `feat/provider-memory-cloud`     | Open draft against `canary`                                             | Merged into the integration branch. Its own report remains [provider-memory-devin-handoff.md](./provider-memory-devin-handoff.md). |
| [#362](https://github.com/alexj11324/orvilo1/pull/362) MCP Events        | `feat/mcp-events-cloud-consumer` | Open draft against `canary`                                             | Merged into the integration branch. Its own report remains [mcp-events-devin-handoff.md](../mcp-events-devin-handoff.md).          |
| [#363](https://github.com/alexj11324/orvilo1/pull/363) four ReUI fixes   | `fix/reui-cloud-continuation`    | Merged at `2026-09-30T18:45:03Z` into `feat/reui-sidebar` (`ac58fa0b6`) | Not on this integration branch and not on `canary`. Leave it there.                                                                |

\#360, #361, and #362 are still open. Do not close or merge them as a side effect of reading
this report. #363's four fixes (settings search, narrow drawer, Linux toggle, workspace menu)
depend on the ReUI shell, which this branch does not contain. `feat/reui-sidebar` also owns a
different migration `0196_task_due_date_and_reminders`. Do not retarget #363 onto this branch
and do not combine the two journals without a forward renumber. Do not touch #357.

## Frozen integration identity

- Repository: `alexj11324/orvilo1`.
- Integration branch: `cursor/core-provider-events-integration-89d7`.
- Draft PR: [#364](https://github.com/alexj11324/orvilo1/pull/364), base `canary`.
- Merge base with `origin/canary`: `f1b8aca6b965a19f9fa87d4238d4e59826a9366a` (merge of #359).
- Last implementation commit, and the revision the evidence below proves:
  `ca66cf9b9ebbe5e141b792a0166ca4225b3db920`
  (`✅ Keep one dispatch when an event lease expires or retries end`).
- The commit that adds this report is documentation only. Its SHA is recorded in the #364 body.
  It does not change runtime behavior and was not used as a new test revision.

## What the integration added after the three merges

Journal order on this branch, after `0195_team_resources_and_documents`:

1. `0196_provider_bindings`
2. `0197_experience_memory_shadow`
3. `0198_mcp_events`
4. `0199_core_execution_authority`

`0199` creates the Core execution-authority tables. Applying the journal creates those tables.
It does not start the runner.

Behavior wired on `ca66cf9b9`:

- Provider connection checks enter `createProviderConfigurationBroker`. Network and inference
  stay refused, so a saved binding cannot become ready. A stale revision, a foreign owner, or
  a credential the owner does not hold fails closed. A second read during the check fails
  closed as well. Secrets stay in the server credential vault as `credential:cred_...`
  references. `/settings/provider` is the binding UI. The deleted legacy provider and key vault
  were not restored.
- Builtin agents already choose a model through the existing agent model selection. That
  selection is not wired to these provider bindings. Live inference stays off.
- `createCoreEventDispatchAdmission` rechecks the inbox join, tenant, trigger revision,
  membership, a bounded execution grant, causation, and truncated replay, then calls the
  existing `TaskDispatchModel.request` with `trigger: 'event'`. A missing, expired, or
  unbounded grant is denied. There is no second TaskRunner.
- The production watchdog in `apps/server/src/router-hono/workflows/task/handlers/watchdog.ts`
  still calls `sweepMcpEventInbox(db)` with no adapter, so it does not claim inbox rows.
  `sweepAuthoritativeMcpEventInbox` is opt-in. Without verified isolation it returns before
  any claim. Isolation evidence here is a shape check, not a proof of OS enforcement.
- With that opt-in evidence, one signed callback becomes one dispatch in phase `requested`.
  No task topic is created. Tampered signatures do not write an inbox row. A lost
  acknowledgement, an expired lease, and retry exhaustion all keep that same dispatch.
  `TaskRunner` still rejects a bare `trigger: 'event'` before task lookup
  (`Event dispatch admission is not configured` in `apps/server/src/services/taskRunner/index.ts`).
- The known task/dispatch lock-order inversion stays fail-closed. Do not remove locks to make
  a test pass.

## Evidence on `ca66cf9b9`

Runs used Linux, Vitest 5.0.0, and
`/home/ubuntu/.nvm/versions/node/v22.22.2/bin/node` unless a row says otherwise. The default
`node` on that machine was v22.14.0 and cannot load `sa05.test.ts` because
`zlib.zstdDecompress` is missing. That load error is environmental. Skipped tests are not
passes. No full suite and no full typecheck were run.

| Run                                                                            | Command result                                                                                              | Limit                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event sweep `apps/server/src/services/controlPlane/eventDispatchSweep.test.ts` | 1 file, 7 passed, 2026-09-30 20:13:28 UTC, 6.82s                                                            | No isolation does not claim. One dispatch, no task topic. Missing grant denied. Signed body stored before ACK; tamper writes nothing. Lost ACK, expired lease, and retry exhaustion reuse one dispatch. |
| `sa05.test.ts`, canonical completion, canonical run, without `TEST_SERVER_DB`  | 3 files, 51 passed, 1 skipped, 20:13:07 UTC, 12.91s, Node v22.22.2                                          | The skip was the PostgreSQL cancellation case. Bare event trigger is still rejected before task lookup.                                                                                                 |
| Same canonical run file with disposable server DB                              | 1 file, 18 passed, 20:19:56 UTC, 4.11s                                                                      | Includes the previously skipped cancellation case. Supersedes that one skip only.                                                                                                                       |
| `packages/database` `taskExecutionControl.test.ts` with the same server DB     | 1 file, 14 passed, 20:23:39 UTC, 13.33s                                                                     | Includes backend termination mid-transfer and SIGKILL across five handoff phases.                                                                                                                       |
| Prime lexical bridge plus experience-memory router                             | 2 files, 6 passed, 20:21:29 UTC, 6.19s                                                                      | `PRIME_AGENT_ROOT` was a local checkout of `PrimeIntellect-ai/prime-agent` at `7d442aafa985f9342134fac16c2ef41f03fb45c1`. That checkout is not in this repository.                                      |
| Receipt recovery `receiptRecovery.postgres.test.ts`                            | 1 file, 9 passed, 20:25:00 UTC, 11.35s                                                                      | Real PostgreSQL 18.6 restart of the labelled fixture below. Supersedes the earlier note that Docker was absent.                                                                                         |
| Earlier aggregate, still on this implementation revision                       | 22 files, 135 passed, 2 skipped, 20:03:08 UTC; database package 5 files, 31 passed, 2 skipped, 20:04:00 UTC | The two skips were `PRIME_AGENT_ROOT` and `TEST_SERVER_DB`. The lexical and server-db rows above cover those cases later. The captured logs do not list the 22 and 5 filenames.                         |

Disposable server DB for the crash and cancellation rows: PostgreSQL 16.15 with pgvector
0.6.0, database `orvilo_server_test`, URL
`postgresql://postgres:postgres@127.0.0.1:5432/orvilo_server_test`. Whole migration files
whose SQL contains `pg_search` or `bm25` (`0090`, `0093`) were skipped, then every journal
hash was recorded so `nodeMigrate` did not reapply them. This is not ParadeDB parity.
Search and FTS are absent there. The password is a local fixture constant.

ParadeDB recovery fixture, removed after the 9/9 run:

- Image config digest, which older Docker recorded as the image ID:
  `sha256:545120602ea0cefb0992449b40b99e7ff88f784a339f5194b86b609a2517f722`.
- That config belongs to `paradedb/paradedb` tag `pg18` / `0.25.11` / `latest` as published
  2026-09-29, index `sha256:a9cbdcfd8a1c349ab21590fd6d6dcbe7da489878df6502922d032dd64c1a7ae7`,
  amd64 manifest `sha256:ab4a2a49cf8a3b935c6f374859fa8c8a9a612c241f2ac7e7c8b39b435be45b5b`.
- Docker 29.1.3 with the containerd image store reports the manifest digest as `Id`.
  `docker run` of the config digest is the wrong object on that daemon. The container was
  started from the amd64 manifest.
- Container and volume name `orvilo-core-recovery-20260930`, label
  `orvilo.acceptance=core-recovery`, publish `127.0.0.1:32772:5432`, database
  `core_recovery`, password `core_recovery_fixture_only`.
- The suite hardcodes Docker at `/usr/local/bin/docker`. On that machine this was a symlink
  to `/usr/bin/docker`.
- After the run, the label and port binding were checked, then only that container and its
  volume were removed.

## Commands for the next owner

Use a fresh checkout of this branch, `pnpm install --frozen-lockfile`, and disposable
databases only. Never point these URLs at user or production data.

```sh
# Opt-in event sweep, provider fail-closed checks, and bare-event guard.
# Use a Node 22 build that provides zlib.zstdDecompress (v22.22.2 worked; v22.14.0 did not).
node node_modules/vitest/vitest.mjs run --silent='passed-only' \
  apps/server/src/services/controlPlane/eventDispatchSweep.test.ts \
  apps/server/src/services/taskRunner/sa05.test.ts \
  apps/server/src/services/controlPlane/canonicalCompletion.test.ts \
  apps/server/src/services/controlPlane/canonicalRun.test.ts

# PostgreSQL crash and cancellation. Apply the non-search migrations first and record every
# journal hash, or use ParadeDB and let nodeMigrate apply the full journal.
TEST_SERVER_DB=1 DATABASE_TEST_URL='postgresql://postgres:postgres@127.0.0.1:5432/orvilo_server_test' \
  node node_modules/vitest/vitest.mjs run --silent='passed-only' \
  apps/server/src/services/controlPlane/canonicalRun.test.ts
cd packages/database && TEST_SERVER_DB=1 DATABASE_TEST_URL='postgresql://postgres:postgres@127.0.0.1:5432/orvilo_server_test' \
  node ../../node_modules/vitest/vitest.mjs run --config vitest.config.server.mts --silent='passed-only' \
  src/models/__tests__/taskExecutionControl.test.ts

# Pinned Prime lexical ranking. Clone PrimeIntellect-ai/prime-agent at
# 7d442aafa985f9342134fac16c2ef41f03fb45c1 and set PRIME_AGENT_ROOT to that checkout.
PRIME_AGENT_ROOT=/path/to/prime-agent \
  node node_modules/vitest/vitest.mjs run --silent='passed-only' \
  apps/server/src/services/memory/experience/__tests__/primeLexical.integration.test.ts \
  apps/server/src/routers/lambda/__tests__/experienceMemory.test.ts
```

Receipt recovery, only after confirming the container name and volume are unused:

```sh
docker pull paradedb/paradedb@sha256:ab4a2a49cf8a3b935c6f374859fa8c8a9a612c241f2ac7e7c8b39b435be45b5b
docker volume create --label orvilo.acceptance=core-recovery orvilo-core-recovery-20260930
docker run -d --name orvilo-core-recovery-20260930 --label orvilo.acceptance=core-recovery \
  -e POSTGRES_PASSWORD=core_recovery_fixture_only -e POSTGRES_DB=core_recovery \
  -p 127.0.0.1:32772:5432 -v orvilo-core-recovery-20260930:/var/lib/postgresql \
  sha256:ab4a2a49cf8a3b935c6f374859fa8c8a9a612c241f2ac7e7c8b39b435be45b5b
docker exec orvilo-core-recovery-20260930 pg_isready -U postgres -d core_recovery
CORE_RECOVERY_DATABASE_URL='postgresql://postgres:core_recovery_fixture_only@127.0.0.1:32772/core_recovery' \
  node node_modules/vitest/vitest.mjs run --silent='passed-only' \
  apps/server/src/services/controlPlane/receiptRecovery.postgres.test.ts
```

Verify the label and loopback port, then remove only that container and volume.

## Still not done

- `coreRuntimeHost.acceptance.test.ts` and `coreRuntimeHandoff.acceptance.test.ts` were not
  run. They stay skipped unless both `TEST_SERVER_DB=1` and `CORE_DOCKER_IMAGE` are set.
  Building that image was stopped before `npm ci` in the pinned Prime checkout. The intended
  build is `scripts/acceptance/prime-protocol.md`: `npm ci --ignore-scripts`, `npm run build`,
  then `docker build --network none` with
  `scripts/acceptance/PrimeProtocol.Dockerfile`. The Node base digest in that Dockerfile was
  pulled and not used. Do not send a prompt, load a credential, or treat a built image as
  production runtime.
- Browser acceptance of `/settings/provider` and `/memory/...` was not rerun on this combined
  branch. The earlier #361 browser notes do not by themselves prove this integration host.
- No live provider call, external MCP subscription, or production runner path was exercised.
- Root typecheck remains a known baseline failure. Do not describe this branch as type-clean.
- \#363 product and Electron acceptance stay with `feat/reui-sidebar`.

## Safety boundaries and resource state

Orvilo owns task owner, lease, epoch, revisions, policy, decisions, dependencies, tombstones,
commitments, and completion. Credentials stay in the trusted vault. Missing isolation, a
missing or unbounded grant, stale authority, or an incomplete causal chain must fail closed.
Do not enable the watchdog adapter, do not remove the bare-event guard, and do not add another
task runner.

At this stop the labelled recovery container and volume had already been removed. No user
database was dropped. Local image caches, a disposable Postgres 16 cluster, and a Prime
checkout outside the repository may remain on the machine that produced the evidence. They
are not part of the branch. No credential, profile, session dump, or production URL is
included. This publication authorizes a draft update of #364 only.
