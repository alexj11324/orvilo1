# Prime execution-architecture cutover

The builtin Orvilo agent's harness is **fixed to Prime**. It is not a
wrapper over Claude Code / Codex CLI engines, and no engine or harness
selector exists for it anywhere. Claude Code and Codex remain first-class
**external** agents and are untouched by this cutover.

`type:'orvilo'` does **not** bypass Device resolution: like every agent
type, a run resolves a device first and the device picks the harness
adapter (`orvilo` → Prime). The shared resolution contract lives in
[docs/development/device-execution-contract.md](./device-execution-contract.md)
— the repo source of truth for selectable vs runnable devices, the
resolution priority chain, and the `DEVICE_*` admission errors. The
device-side Prime adapter is packaged separately; until it ships a
**transitional embedded fence** keeps orvilo device plans on the
embedded/sandbox fork — pre-cutover device-bound orvilo configs ran that
path silently, so refusing them outright would break normal chat
mid-cutover. The fence is marked in code, pinned by a flip test, and the
resolved deviceId is still recorded on the run's operation row (see the
dispatch section).

This document records the data-model, UI, and dispatch changes: the
data-model and settings-UI engine removal first, then the chat-path cutover
that admitted `type:'orvilo'` chat runs onto the same embedded Prime host
task dispatches already use.

## What was deleted

- `OrviloEngineKind`, `ORVILO_ENGINE_KINDS`, `ORVILO_ENGINE_CAPABILITIES`,
  `isOrviloEngineKind`, `DEFAULT_ORVILO_ENGINE`,
  `ORVILO_ENGINE_CLI_AGENT_TYPES`, `resolveOrviloEngine`,
  `resolveOrviloEngineCliType`, and the orvilo-engine branch of
  `resolveHeteroCliAgentType` (now the identity of `provider.type`).
- The `engine` field on `HeterogeneousProviderConfig` (`engine?: never`
  blocks new writers) and the whole engine-armed compat surface in
  `providerBinding/execution.ts` (`selectOrviloProviderBinding`,
  `OrviloBindingTarget`, `OrviloBindingResolution`,
  `IssuedByokSpawnExecution`, `buildByokExecutionCredentials`, and the
  engine-narrowing resolver overloads).
- `src/features/HeterogeneousAgent/engine.ts` reduced to
  `isBuiltinEngineType` + `buildHarnessProviderPatch`; the engine select and
  `agentEngine.engine.*` locale keys removed.
- `docs/development/builtin-agent-harness-binding.md` (documented the
  retired wrapper story).
- `hetero exec --type orvilo` / `--engine` in `apps/cli` — the builtin agent
  cannot be executed by the CLI.
- `spawnHeteroSandbox`/`buildHeteroSpawnArgs`/`buildHeteroExecArgs` orvilo
  vocabulary: `{type:'orvilo'}` providers early-return `provider.args` and
  are never in the local-CLI family list.

## Existing rows carrying `engine` — ignore-read normalization

`normalizeHeterogeneousProviderConfig` strips `adapterType` + `engine` from
`heterogeneousProvider` configs on read, so pre-cutover agent rows
normalize cleanly without a migration. `selection.engine` inside
`provider_bindings.config.selection` is kept as a dead optional in
`providerBindingConfigSchema` (a strict parse would reject pre-cutover
rows); no resolver or writer consults it. Preference: smallest correct
normalization — engine becomes meaningless, not destructive.

## Provider bindings — canonical surface only

`resolveOrviloProviderBinding(db, userId, target, match?: {model?,
provider?})` resolves the newest enabled `runtime:'orvilo'` +
`target:'sandbox'` binding, narrowed by the run's **model route** only.
The run's provider pin is the `orvilo` type marker — never a binding
provider id — so it must not be passed as `match.provider`.

`issueBindingExecution(db, {bindingId, bindingRevision, ownerId,
tenantId})` issues the contract binding the broker consumes, refusing
stale revisions, non-owned credentials, and disabled rows. `enabled` is
deliberately **not** revision-fenced (a flip bumps no revision), so
issuance re-checks it at claim time.

Rows written for the retired `local`/`device` binding targets are inert:
embedded dispatch always queries `target:'sandbox'`.

## Settings UI (EngineConfigCard)

- Builtin (orvilo) renders no Harness/Engine row and no execution-target
  row — the contract forbids them. External agents keep their own config.
- The model picker lists the model routes of the user's enabled
  `runtime:'orvilo'` + `target:'sandbox'` provider bindings
  (`useProviderBindingStore`); it is Prime's inference backend
  (`broker.infer` `modelRoute`), not an agent/harness concept. With no
  bindings configured the picker shows a hint to create one.
- The device picker follows the shared `showDeviceSelector` rule
  (permissions loaded && inventory complete && canSelectDevice &&
  > 1 selectable candidate); it is wired against the device-resolution
  > contract separately.
- Effort/mode/speed selects route through `applyHeteroSelection`.

## Dispatch — device first, then the non-device fork

`heteroDispatch` resolves the execution plan identically for every agent
type. The device branch is gated by
`heteroPlan.kind !== 'sandbox' && !orviloDeviceFencedToEmbedded(type)` —
external types take the device route unconditionally; **`'orvilo'` stays
fenced off the device gateway** (the transitional embedded fence:
`orviloDeviceFencedToEmbedded` in `helpers/heteroErrors.ts`, marked
TRANSITIONAL, pinned by the flip test in `execAgent.device.test.ts` —
the package that ships the device-side Prime adapter deletes both).
Resolution still runs for orvilo: a plan that resolves to a concrete
device writes `{deviceResolution: {deviceId, fence:
'transitional-embedded'}}` onto the run's `agent_operations.metadata` so
the audit trail shows which device execution WOULD target once the
adapter lands. For external types, an unbound plan still fails at the
`No bound device` fence, unchanged.

A fenced orvilo plan — sandbox or device-resolved alike — reaches the
embedded fork:

- `resolveEmbeddedDispatchRoute` returns a canonical context for real task
  dispatches (`operationTaskId` + `taskRunner`-written `appContext`
  dispatch fields) → `openEmbeddedDispatchHost`.
- `resolveEmbeddedChatDispatchRoute` returns the chat-scoped context
  (`agentId` + `operationId` + `topicId`, `operationTaskId` absent) →
  `openEmbeddedChatDispatchHost`. `EMBEDDED_CHAT_NOT_ADMITTED` remains only
  for a malformed or context-less orvilo plan.
- Both paths converge on `composeEmbeddedRunHost` (shared artifact
  verification + binding issuance + `CanonicalCoreRuntimeHost` open) and
  `driveEmbeddedCanonicalRun` → `PrimeEmbeddedRuntime` → the same
  `heteroIngest`/`heteroFinish` `'orvilo'` producer surface — a chat run
  streams and settles exactly like a task run.
- (The embedded fork is the only orvilo route: sandbox plans land here
  directly and device-resolved plans are fenced into it — see the
  transitional fence above.)

## Chat-scoped canonical contract

Chat runs carry no task rows, so the canonical fence is re-anchored on the
chat-parallel execution record — `agent_operations` — instead of a new
table or migration:

- `CanonicalChatRunBinding` (apps/server/src/services/controlPlane/
  canonicalChatRun.ts) extends `CanonicalRunBinding`: `operationId` stands
  in for `dispatchId`/`grantId`, `executionEpoch`/`generation` are 1,
  `dispatchFence`/`policyRevision`/`stateRevision` are 0, `taskId` maps to
  the topic id, and `workspaceId` is the run tenant (`chatWorkspaceId ??
'personal:<userId>'` — a personal chat gets a synthetic tenant so its
  fence can never collide with workspace scope).
- `runExpiresAt` is the bounded window the server mints at admission — the
  chat parallel of a delegated grant's expiry (chat runs carry no grant
  row; `allowedActions` is always empty).
- `agent_operations.metadata.executionControl` holds the same version-1
  process-ownership blob `task_topics.execution_control` does;
  `metadata.executionControlRevision` is the revision counter.
- The operation row's `status` is the kill fence: interrupt/settle
  transitions it out of `'running'` and every subsequent admission fails
  `stale_fence` — the same posture as the task path's dispatch-fence
  advance.
- `CanonicalChatRunAuthority` applies the identical NOWAIT row-lock chain
  (agent_operations → topics → workspaceMembers for workspace-scoped
  chats) and the same ownership/lease/state checks as
  `CanonicalRunAuthority`; `ChatExecutionControlModel`
  (packages/database/src/models/chatExecutionControl.ts) provides
  register/activate/stop/readControl/renew on the metadata blob. The
  handoff family throws loudly — chat runs never hand off.
- `CanonicalCoreRuntimeHost` gained `authority`/`registration` option
  ports (`CanonicalRunAuthorityPort`/`CanonicalRunRegistrationPort` in
  canonicalRun.ts — structural, since the concrete classes carry private
  members); the embedded bridge's existing `runAuthority` seam admits
  every inference resolve under the same chat row locks.

## Non-negotiables preserved

- No raw model/engine names leak into non-settings work surfaces — model
  appears only as the binding-driven settings picker and the pinned
  `modelRoute` on the wire.
- Claude Code / Codex stay first-class external agents (Local CLI /
  platform groups), selectable as separate agent types.
- Prime is fixed builtin — never a selectable engine.
