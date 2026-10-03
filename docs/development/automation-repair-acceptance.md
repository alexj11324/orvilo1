# Automation repair evidence

Date: 2026-10-03. Branch: `fix/automation-occurrence-contract`.
Base: `8dc0cae4aed282f59384ac98f2b4b87220c70459` (later than the audited
`3cd7e9b4509debd4c3f57c7d8146eb166346a5f4`). Evidence below covers the working
tree on this base, not the untouched base commit or a deployed production build.

## Implemented behavior

- Creation persists maximum execution count, normalizes intervals once, and
  rereads the saved configuration before enabling. Failed enabling retries the
  saved draft, without creating a second task. Event creation saves paused.
- The existing Task row remains the automation definition. A content hash of
  its authorized saved instruction/configuration identifies the version bound
  when an occurrence is recorded. The occurrence and input live on existing
  dispatch/trigger-run records; no second dispatch state machine was added.
- Schedule, heartbeat and event occurrences use `fresh_occurrence`. A fresh
  contract does not inherit the last topic. Retries preserve the original
  version, prompt and input. Existing authorized replan remains separate.
- Event evidence and business input are separate. Admission reloads durable
  scoped evidence; the contract freezes payload/ref/hash. Prompt data is bounded
  and explicitly untrusted. Large input is read through the run-scoped Task tool.
- Event settlement keeps the automation waiting for future events. Three
  consecutive automatic failures use the common existing fuse policy. Limits
  retain their real stop reasons rather than becoming successful completion.
- The saved Device is checked and passed through workspace provisioning and
  Agent execution. One eligible Device can be bound automatically; multiple
  Devices require selection. An offline binding is retained, without fallback.
- Readiness observes the source, actor, tools, host executor and worker.
  CAS enabling verifies the saved definition and source revisions. Pause blocks
  future occurrences; stopping the source is separate. Events received while
  paused are skipped, including backlog older than the last enabling boundary.
- Event receipt wakes the existing persistent scheduler. Individual renewable
  leases and bounded concurrent claims prevent a slow first startup from holding
  an entire batch. Watchdog remains recovery; unhealthy work affects health output.
  Heartbeat startup restores persisted tokens. Schedule identity uses the planned
  UTC slot and IANA timezone; missed slots coalesce to one current occurrence.
- Final output is frozen only after handoff/integration or verification has
  settled. `resultReadyAt`/`resultOutcome` are durable receipts. The output outbox
  retries delivery independently; ambiguous external writes remain unknown.
  Webhook output uses scoped credential references and bounded HTTPS transport.
- Existing Automations pages expose event settings and output history. Event
  pause does not cancel a run; resuming goes through readiness. Shared-task
  output reads and creator/owner management remain distinct permissions.

Migration `0203_automation_occurrences_and_outputs.sql` adds nullable snapshot,
result receipt and output outbox fields. Generated metadata and DBML are included.
The migration regression applies it twice and checks preservation and uniqueness.

## Automated evidence

Run from the root unless a package working directory is specified. These are
targeted regressions, not a full repository test run or a production acceptance.

| Scope                                                          | Result                            | Local log                                     |
| -------------------------------------------------------------- | --------------------------------- | --------------------------------------------- |
| MCP receipt, admission, database, worker, schedule/recovery    | 21 files / 170 passed             | `/tmp/automation-all-events-final.log`        |
| Final lifecycle receipt and gated readiness                    | 2 files / 72 passed               | `/tmp/automation-ready-receipt-final.log`     |
| Dispatch and immutable definition SQL (database package)       | 2 files / 40 passed               | `/tmp/automation-sql-final.log`               |
| Event active/paused list SQL                                   | 1 passed, unrelated cases skipped | `/tmp/automation-list-sql.log`                |
| Idempotent migration and watchdog                              | 2 files / 9 passed                | `/tmp/automation-migration-tests.log`         |
| Output RPC permission/configuration (selected cases)           | 4 passed                          | `/tmp/automation-rpc-final2.log`              |
| Automations creation/list/actions/helper regressions           | 4 files / 36 passed               | Agent verification                            |
| Final contracts, output, Task input tools and UI               | 11 files / 185 passed             | `/tmp/automation-contract-output-ui-last.log` |
| ACP parameter mount and host preflight (heterogeneous package) | 2 files / 58 passed               | `/tmp/automation-acp-regression.log`          |

The logs overlap in some test files and must not be summed as unique tests.
Output delivery regressions cover a sweep during unfinished integration, failed
verification, preserved budget stop reasons, delivery-only retry, private-address
blocking and ambiguous transport outcomes. Existing task tool tests cover input
ownership and bounded paging.

The final check wrapper reports 129 files lint-clean, with two SQL files skipped
because no linter owns them (`/tmp/automation-check-authorized-final.log`). Its
initial attempt hit the sandbox's denied Unix pipe; the final run with network
socket permission completed successfully. The native-control check also passes
directly with `node --import tsx scripts/ci/checkNativeControls.mjs`. Server-wide typecheck
remains non-green with repository dependency/alias diagnostics; it is not claimed
as passed. Existing detail-store test loading is blocked by missing `sonner`.

## Real execution evidence and remaining acceptance

OpenCode CLI 1.18.34 is installed in `/tmp/orvilo-opencode`, with isolated XDG
directories. Only advertised free models and synthetic data are used. The real
ACP initialization exposed an HTTP MCP mount missing required `headers: []`;
the shared ACP session now normalizes absent HTTP/SSE headers, with a regression.

Actual ACP/model/tool evidence is recorded in `/tmp/orvilo-live-automation`, with
four receipts summarized in `live-execution-summary.json`. After the headers fix,
real ACP initialization, session creation and model selection succeeded. Both
`opencode/big-pickle` and `opencode/mimo-v2.6-flash-free` were rejected at inference.
The official native `opencode run --pure --format json --model opencode/big-pickle`
also returned HTTP 403: `OpenCode's free tier can only be used from within OpenCode`.
The cause of this service-side rejection has not been established. No tool call,
unique-field output, second successful occurrence or successful Agent result was
observed. No paid model or client-identity workaround was used.

A free-model catalog or a successful ACP session creation is not inference proof.
The host preflight reports a public model's credential requirement separately
and keeps authentication unknown; catalog availability cannot enable execution.

Follow-up independent review found no remaining P0/P1 after the final-ready
receipt and continuation reset. The continuation SQL regression passed 53 tests;
independent output/lifecycle and migration/transport checks passed 77 and 14
respectively. A further P2 (the first manual automation test run lacking a receipt)
was fixed after that review, with 78 output/lifecycle regressions passing. It has
local test evidence rather than a further independent review pass. Legacy or
first-manual contracts without a frozen occurrence retain internal result history;
they do not read current mutable webhook configuration to redirect output.

This cloud workspace has no running Orvilo server, SQL/Redis services or
authenticated DeviceGateway/CLI daemon. Therefore these tests do not prove the
complete UI → signed source → canonical dispatch → real Device → verified result
path. They also do not prove OS process-kill recovery, multiple-server Postgres
contention or delivery from a real external provider. Production event enabling
is held by default-off `mcp_event_automations`; release it only after first event,
second event, duplicate, interrupted recovery, offline/revoked target and stale
callback acceptance have actual Device evidence.

The core uses authorized saved Task snapshots, not a separate publish/version UI.
Agent/provider settings outside that Task snapshot are still checked at execution;
this is not a complete immutable publication system for every external dependency.
Prime Device transport, generic inbound webhook credentials/rotation, native
GitHub/Linear automation sources and full browser/device acceptance remain later
work. Existing Linear signature/sync reception is preserved. Generic input is not
represented as a fictitious MCP subscription. GitHub repository authorization
does not itself install an inbound webhook or grant an App installation.
