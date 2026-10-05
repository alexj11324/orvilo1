# MCP Events acceptance evidence

## Integration update (2026-09-30)

The combined Core / Provider / Memory / Events branch registers
`packages/database/migrations/0198_mcp_events.sql` after 0196 and 0197. The worker
admission port is canonical `EventDispatchAdmission`. No production admission adapter
is installed, bare `trigger: 'event'` remains rejected, and provider connection checks
enter the canonical broker with network access refused. The sections below record the
pre-integration candidate.

## Baseline audit

Baseline: `28dc3bbad36e4661f8d09154ff8b017cf5cadaeb`.

The existing automation UI is backed by real schedule and heartbeat execution, not external event subscriptions. `src/features/Automations/AutomationTriggerDraft.tsx` restricts persisted trigger drafts to `schedule | heartbeat`. The comment in `automationTemplates.ts` explicitly says webhook/API templates have no implementation equivalent. A Slack digest template is therefore not evidence of Slack webhook delivery.

`apps/server/src/router-hono/webhooks/index.ts` registers identity-provider, Linear, and memory callbacks; it has no Slack, GitHub, or MCP Events receiver at the baseline. `packages/types/src/task/index.ts` and `packages/database/src/schemas/task.ts` support manual, schedule, heartbeat, goal, and orchestrator run origins, with no event run origin.

`TaskRunnerService` requires a stable idempotency key for non-manual runs and enters `TaskDispatchService`/`TaskDispatchModel` for durable request, admission, claim, and fenced transitions. This is the existing execution boundary an event worker must reuse. A persisted event inbox by itself does not establish that an agent ran.

The existing `EventOutboxModel` and `CollaborationOutboxProjector` serve transactional domain events. The projector fans out per-consumer receipts for realtime rooms and notification projection. This is not an outbound MCP webhook transport and cannot establish remote event delivery.

## Acceptance requirements

Wire references: [OpenAI MCP Events webhook profile](https://developers.openai.com/plugins/build/mcp-events) and the [official experimental MCP Events design sketch](https://raw.githubusercontent.com/modelcontextprotocol/experimental-ext-triggers-events/main/docs/design-sketch-proposal.md), read 2026-09-30. The sketch is explicitly a draft, dated 2026-02-19. The implementation profile negotiates `2026-07-28`; discovery, listing, subscription, and unsubscribe are protocol requests. Webhook occurrences have `eventId`, `name`, `timestamp`, and object `data`; control verification is separate. Raw callback bytes are signed using Standard Webhooks. These references do not imply all installed MCP servers support Events.

The acceptance harness must exercise the implemented services and SQL against an isolated real database. Network/provider/runtime substitutes must be named as boundaries; a mocked internal receiver, inbox model, task dispatch, or UI shell is not product delivery evidence.

Required cases:

- Deliver a valid raw signed callback, inspect the durable inbox, repeat delivery concurrently, and observe one event identity and one target dispatch identity.
- Reject tampered signatures, malformed envelopes, wrong subscriptions, expired/inactive subscriptions, and ownership mismatches without writing event or dispatch state.
- Close and reopen a disk-backed database after claiming inbox work. Before lease expiry another worker must not claim it; after expiry work must recover. An old lease owner must not settle the new owner's claim.
- Interrupt after durable dispatch preparation and before inbox acknowledgement; replay must reuse the stable dispatch identity rather than start another run.
- Filter before dispatch, recheck active subscription/task ownership at execution, and retain failed rows for bounded retry and operator inspection.
- Record the actual official specification version/URL and distinguish protocol conformance, local transport acceptance, and real remote provider/runtime execution.

## Linux validation

The restored draft was verified against its handed-over Git blobs before changes:
`acceptance.test.ts` = `9d66c32e`, `__tests__/inbox.test.ts` = `042294f7`, and this
document = `254c03bc`. The source baseline remains
`28dc3bbad36e4661f8d09154ff8b017cf5cadaeb`; the following evidence covers the cloud
working tree, not the earlier Mac draft or a published revision.

On 2026-09-30 in the repository checkout on Linux, Node 24.19.0 and Vitest 5.0.0 ran:

```sh
node node_modules/vitest/vitest.mjs run --silent=passed-only \
  apps/server/src/services/mcpEvents/acceptance.test.ts \
  apps/server/src/services/mcpEvents/__tests__/inbox.test.ts
```

At 16:28:17 UTC, **2 files / 19 tests passed**, exit zero, 11.64 seconds. The suites
execute the real receiver, SQL inbox and binding repository against PGlite
(PostgreSQL compiled to WASM), including a disposable filesystem database and a
close/reopen recovery. No internal receiver or persistence service is mocked.
The separate Drizzle SQL adapter suite also passed its two tests in the preceding
17-test run at 16:27:07 UTC.

Coverage includes signed challenge consumption, exact raw-byte preservation,
concurrent duplicate delivery, identity conflicts, tenant and connector scopes,
malformed envelopes and payloads, signature tampering and expiry, revoked/pending
bindings, signing-key expiry, bounded bodies, cursor preservation on duplicate
replay and concurrent renewal, retry/dead evidence, disjoint claims, and stale
lease fencing before and after recovery.

Two additional commit-order cases establish that a successful ACK cannot precede
persistence: a delayed SQL transport leaves the receive promise pending with no
receipt, and a real PostgreSQL trigger that rejects the watermark update rolls
back the receipt and returns 503. Removing the fault permits the signed retry to
commit and return 202. The delay is an explicitly controlled SQL transport boundary;
the transaction rollback is executed by the real database engine.

## Consolidated cloud candidate

On 2026-09-30 at 16:40:27 UTC, the final combined targeted run passed **14 files / 116 tests**
in 48.31 seconds on Linux. The selectors were `apps/server/src/services/mcpEvents`,
the MCP webhook handler, existing watchdog, MCP router, saved-event settings hook, and
`taskRunner/sa05.test.ts`. Separately, the existing database package's
`src/models/__tests__/taskDispatch.test.ts` passed **30 tests** in 9.09 seconds,
including event-source project-policy enforcement and persistent dispatch identity.

The combined suite executes the real Hono raw-Request handler and Drizzle parameter
adapter, real SQL subscriptions and receiver, filter/worker persistence, and a
filesystem reopen after an interrupted admission acknowledgement. Remote MCP
transport and the core admission outcome are explicit controlled boundaries.
Router/hook tests exercise authorization and state transitions with those dependencies
controlled; they are not a browser or live provider acceptance run. The initial new
component test was replaced with a hook test in accordance with the repository's testing skill.

Both independent review findings were reproduced and repaired: retryable admission
waiting no longer exhausts the transport failure budget, and an older refresh may
not revoke or unsubscribe a newer successful refresh. Challenge consumption also
checks the binding revision, and failed key rotation retains all live grace keys.

The single follow-up review confirmed those fixes and identified two additional
issues. Subsequent author-tested repairs align renewal with the five-minute watchdog
and keep saved-subscription management available during discovery/source failures.
Renewal now uses an eight-minute window, batches of twenty and concurrency four;
deployment configuration rejects finite grants too short for that window. Fixed-clock
and SQL tests cover the missed-tick deadline and minimum-grant boundary. Stop revokes
local ingress before remote cleanup, including when the connector is gone. These last
repairs have regression coverage but did not receive another independent review round.

`bun run check --lint` passed for 58 changed files (six final formatting fixes; the SQL
artifact has no configured linter). The server package TypeScript check initially
hit Node's default heap ceiling; a larger-heap check reported repository-wide
desktop/frontend declarations and two new diagnostics. The new handler optional
parameter and worker discriminated-union diagnostics were corrected; the worker's
strict scoped TypeScript check passed. The second server package check completed
with 292 diagnostics, none matching the changed MCP Events files, worker, MCP client,
or TaskRunner/TaskDispatch paths. A subsequent exact-base comparison at candidate `e2aa71913824aca039f1c88c4f718b5fa606a51d`
used the same checkout path and installed dependencies with incremental caching disabled.
Base and candidate each emitted 292 diagnostics; their complete output was byte-identical
(SHA256 `430a5ee2c2b35fd3c0a36ff4173fece455df261df73a216350df7cb314a25094`).
There are no added or removed diagnostics in that comparison. The full package
type-check status remains non-green on both revisions.

### Migration integration

`packages/database/migrations/0197_cloud_control_plane.sql` is generated by
`drizzle-kit generate` from the integrated schema — the five MCP event tables
plus the Provider/Memory and Core execution-control objects — with reviewed
idempotent DDL. `migration.test.ts` applies that artifact twice to PGlite and uses
the production SQL repository to commit and deduplicate a receipt. The earlier
proposal file `docs/development/mcp-events-migration.sql` was superseded by the
registered migration and removed. The integration merged those schemas and
regenerated a single canonical migration as `0197_cloud_control_plane` covering
Provider bindings, experience memory, the five MCP event tables, and Core
execution-control objects (0196/0197 drafts were consolidated into it).

### Current execution integration (2026-10-03 working branch)

The consumer already implements the canonical `EventDispatchAdmission` imported
from `@orvilo/agent-execution/controlPlane`. It resolves persisted trigger runs and
enters the existing `TaskDispatchModel` / `TaskRunnerService`; the former temporary
structural-port integration item is obsolete. Admission re-verifies scope, inbox
lease, source binding, trigger revision, connector/member/task state and causation
under the task lock. Wire payloads are not execution authority.

New occurrences bind a saved definition hash and immutable inbox input. Their
contracts do not inherit a prior topic; retries reuse the same snapshot. Event
inputs reach the Agent as untrusted business data; oversized inputs are available
through a run-scoped builtin tool. Event settlement preserves the recurring
automation lifecycle and the raw stop reason.

Receipt wakes the existing persistent Hatchet task. A minute sweep and watchdog
recover missed wakes; claims are individual, renewed and bounded, rather than a
batch lease covering sequential device provisioning. Local heartbeat timers are
rebuilt from persistent scheduling state. Output delivery has its own durable
outbox and never starts the Agent again.

The product can save paused event drafts, check actual device/tool/worker readiness,
and CAS-enable a checked definition. The release flag `mcp_event_automations`
defaults to false, so these routes cannot enable production event execution before
real Device acceptance is deliberately released. Missing executor capability,
source credentials, device or recent worker health remain independent blockers.
Prime is an executor choice; this patch does not substitute a fixed server for the
bound Device or implement a missing Prime Device transport.

See [automation repair acceptance](development/automation-repair-acceptance.md)
for current tests and the distinction between SQL, real ACP and real Device proof.

## Evidence limits

PGlite recovery is a database close/reopen, not an OS process kill, multi-server
Postgres lock test, or remote provider delivery. Test signing secrets are deterministic
fixtures. No production credentials, OAuth, provider registration, outbound messages,
deployment, or live agent execution is part of these tests.

The receipt cursor is opaque. Duplicate retries cannot replace a newer stored
receipt cursor; the consumer does not infer cursor ordering from event timestamps.
Receiving a previously unseen older occurrence may move the saved cursor backward
and replay extra data; inbox and trigger-run deduplication must absorb those retries.
A provider's replay completeness and ordering are not proven by these local tests.

Worker tests with a controlled admission port establish worker retry and dispatch-key
behavior only. They do not prove that the authoritative core admitted a task or that
Prime/ACP executed it. The production worker must remain unavailable until the core
EventDispatchAdmission integration rechecks live ownership, policy, loop prevention,
and execution isolation, then enters the existing TaskDispatch/TaskRunner path.
