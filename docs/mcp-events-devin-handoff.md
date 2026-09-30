# MCP Events consumer: Devin handoff

Development stopped at the user's request on 2026-09-30. This is a draft candidate,
not an enabled event automation feature. Do not resume implementation in the originating agent.

## Exact revisions and scope

- Source base: `28dc3bbad36e4661f8d09154ff8b017cf5cadaeb`.
- Complete business-code candidate: `e2aa71913824aca039f1c88c4f718b5fa606a51d`.
- Branch: `feat/mcp-events-cloud-consumer`; PR targets `canary`.
- The final PR head adds only this handoff, provenance, and corrected acceptance documentation.
  Its exact SHA is recorded in the PR body (a document cannot contain its own commit hash).
- All 58 candidate files are committed. No untracked business files remained at handoff.

## Delivered changes

1. MCP Events discovery, pagination, subscription verification, renewal, key rotation,
   revocation and authenticated connector transport.
2. Raw signed Hono callback, bounded body reading, JSON/schema validation and SQL
   persist-before-ACK; duplicate identities cannot rewind the receipt cursor.
3. Five SQL/Drizzle tables: bindings, challenges, inbox, triggers and trigger runs.
   Durable leases, stale-owner fencing, bounded retry and stable trigger-run dispatch keys.
4. Bounded declarative filters and consumer integration into the existing watchdog.
   No second TaskRunner or independent scheduler was introduced.
5. Workspace-authorized TRPC source/trigger management, client service/store and automation
   settings UI with English/Chinese strings. Saved subscriptions can be stopped even
   when discovery fails. Triggers are created disabled; UI cannot enable them.
6. Event source discriminant and existing TaskDispatch policy/idempotency handling.
   TaskRunner rejects bare event requests before effects pending authoritative Core wiring.
7. Targeted tests and a registered consolidated migration
   `packages/database/migrations/0196_cloud_control_plane.sql` (the earlier
   candidate file in `docs/development/` was removed once the journal entry landed).

## Validation evidence and limits

Evidence applies to business source recorded in `e2aa71913824aca039f1c88c4f718b5fa606a51d`.
The final documentation-only commit was not subjected to another test run.

- Linux Node 24.19.0 / Vitest 5.0.0: combined targeted suite passed **14 files / 116 tests**
  at 16:40:27 UTC, 48.31 seconds. Separate database TaskDispatch suite passed **30 tests**,
  9.09 seconds. Do not sum earlier subset runs into this count.
- Changed-file lint: 58 files passed; SQL has no configured linter. Scoped worker strict
  TypeScript passed. Final documentation changes were not used to trigger autofix/test runs.
- Full server TypeScript initially exceeded default heap. With 8 GiB it exits 2 on both
  exact base and candidate: **292 diagnostics each, complete output byte-identical**.
  Output SHA256: `430a5ee2c2b35fd3c0a36ff4173fece455df261df73a216350df7cb314a25094`.
  Comparison used the same absolute checkout, same dependencies and `--incremental false`.
- PGlite tests use the real PostgreSQL WASM engine, real receiver/repositories and
  disposable filesystem close/reopen. Remote MCP and Core admission outcomes are
  explicitly controlled boundaries, not real external provider or runtime execution.
- No browser/product UI acceptance, live provider subscription, Prime/ACP execution,
  OS process-kill recovery or independent multi-server PostgreSQL concurrency acceptance.
- Earlier review fixes and limits are detailed in [acceptance evidence](mcp-events-acceptance.md).
  [Original-file provenance](mcp-events-restoration-provenance.md) verifies 7/10 original
  draft hashes; three initial restorations were not hash-verified. Preserve cloud fixes.

Reproduce from repository root after installing repository dependencies with pnpm:

```sh
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --silent=passed-only \
  apps/server/src/services/mcpEvents \
  apps/server/src/router-hono/webhooks/handlers/mcpEvents.test.ts \
  apps/server/src/router-hono/workflows/task/handlers/watchdog.test.ts \
  apps/server/src/routers/lambda/__tests__/mcpEvents.test.ts \
  src/features/Automations/useSavedEventTrigger.test.ts \
  apps/server/src/services/taskRunner/sa05.test.ts
(cd packages/database && node ../../node_modules/vitest/vitest.mjs run --silent=passed-only src/models/__tests__/taskDispatch.test.ts)
(cd apps/server && node --max-old-space-size=8192 ../../node_modules/typescript/bin/tsc --noEmit --pretty false --incremental false)
```

The repository disables pnpm lockfiles. PGlite is declared in the server devDependencies.
No machine-specific executable or dependency symlink is required by the committed source.

## Blockers, dependencies and integration order

1. Obtain and verify the separate Core candidate. Parent reported checkpoint
   `0b6c57c37045a654a45fe203f2f61e406b62a9b1`, but its bundle/patch/manifest were **not
   present in this cloud environment**. Core PR URL and final head must come from the
   parent; do not assume this checkpoint is the final Core candidate.
2. Integrate canonical `@orvilo/agent-execution/controlPlane` exports and trusted
   `@orvilo/agent-execution/controlPlane/server` dependencies. Replace the structural
   `McpEventDispatchAdmission` port in `worker.ts` with canonical `EventDispatchAdmission`.
   The current consumer has no injected production admission implementation.
3. Core must resolve immutable inbox references and recheck live tenant, task, connector,
   trigger revision, ownership, execution grant, lease, causation/loop and isolation policy.
   Then enter existing TaskDispatch/TaskRunner/outbox. Do not simply remove the bare-event guard.
4. Integrate Provider/Memory schemas before generating canonical migrations. This checkout
   journal ends at 0195; 0196/0197 were reserved by the parent. Generate 0198 or the actual
   next index from the combined schema with repository tooling. Candidate SQL is tested
   twice in PGlite but is **not registered or deployed** as a canonical migration.
5. Integrate Core's later Docker isolation/SQL recovery work and acceptance evidence.
   Canonical exports alone do not prove runtime safety. Cross-PR URLs must be supplied by
   the parent; no guessed PR numbers or dependency refs are embedded here.
6. Complete real end-to-end acceptance before considering enablement. Keep external
   provider registration/subscription and credentials subject to explicit user authorization.

Known gaps: truncated replay gaps and full causation-loop policy are not end-to-end proven.
Opaque cursors cannot be ordered locally: a newly seen older occurrence can move the cursor
backward and cause extra replay; only duplicates are prevented from rewinding it. Provider
replay completeness is unproven. Renewal uses an eight-minute lead against the five-minute
watchdog, bounded batches/concurrency and short-grant rejection; production scheduling and
large deployment capacity still need operational acceptance. No claim of complete product delivery.

## Required end-to-end cases

- Signed raw callback through durable ACK, filters, authoritative Core admission,
  exactly one existing dispatch and approved isolated runtime.
- Lost admission acknowledgement, process interruption and SQL restart reuse dispatch
  identity; expired lease owners cannot settle or repeat effects.
- Revoked binding/trigger, changed policy/ownership, cross-tenant attempts, malformed
  signatures and unsupported runtime isolation yield no execution.
- Duplicate/out-of-order replay, truncated replay gaps, causal loops and retry exhaustion
  preserve evidence and enforce the authoritative policy.
- Missing Core fails closed without claiming inbox work; recovery resumes safely.
- Runtime turn completion cannot mark task done without authoritative completion verification.

## Resources and immutable safety boundaries

No active task-owned dev server, browser, provider subscription, runtime or test process
remained at handoff; only defunct prior tool children and platform-managed services were
observed. Do not stop platform Docker/container services. Test PGlite databases are disposable
fixtures with cleanup hooks, not user databases. Local logs, dependency caches, temporary
migration snapshots and transfer bundles stay outside the PR and are unnecessary to run it.
No production credentials, login profiles, user data or real signing secrets are committed.

Execution stays disabled. Preserve tenant isolation, raw-byte signature validation,
persist-before-ACK, lease/revision fencing, replay/run deduplication and no-second-runner
constraints. Do not trust event metadata as authority, auto-approve effects, enable production
subscriptions, deploy or merge merely because local controlled-boundary tests pass.
