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

This document records the data-model, UI, and dispatch changes plus the
known boundary that remains open.

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

- `resolveEmbeddedDispatchRoute` returns a canonical context only for
  real task dispatches (`operationTaskId` + `taskRunner`-written
  `appContext` dispatch fields). Task runs open
  `openEmbeddedDispatchHost` → `driveEmbeddedCanonicalRun` →
  `PrimeEmbeddedRuntime`, same as before.
- **Chat runs have no canonical task context**, so they hit the honest
  boundary `EMBEDDED_CHAT_NOT_ADMITTED` and fail loudly through
  `finalizeHeteroDispatchError` — they never fall back to the retired
  engine→CLI spawn path. See "Open boundary" below. (The embedded fork
  is now the only orvilo route: sandbox-plan runs land here directly and
  device-resolved plans are fenced into it.)

## Open boundary — chat admission to the embedded host

`CanonicalCoreRuntimeHost` / `CanonicalRunAuthority` /
`TaskExecutionControlModel` / `executionGrants` are row-locked to
task-shaped rows (`createGrant` requires `task:{id,projectId,workspaceId}`),
and `agent_operations` / `topics` carry no execution-control columns. A
chat-scoped admission needs a control-plane expansion (the deferred item
the dispatch doc names): either chat-shaped canonical rows or a
chat-scoped grant contract — with an explicit `RunSubject`
(`{kind:'conversation',topicId}` | `{kind:'task',taskId,dispatchId}`) so a
conversation id can never stand in for a task id. Until that lands, orvilo
chat runs on the embedded host fail at `EMBEDDED_CHAT_NOT_ADMITTED`
rather than executing on the retired engine path.

## Non-negotiables preserved

- No raw model/engine names leak into non-settings work surfaces — model
  appears only as the binding-driven settings picker and the pinned
  `modelRoute` on the wire.
- Claude Code / Codex stay first-class external agents (Local CLI /
  platform groups), selectable as separate agent types.
- Prime is fixed builtin — never a selectable engine.
