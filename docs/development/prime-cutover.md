# Prime execution-architecture cutover

The builtin Orvilo agent is **bound to the embedded Prime harness — fixed**.
It is not a wrapper over Claude Code / Codex CLI engines, and no engine or
harness selector exists for it anywhere. Claude Code and Codex remain
first-class **external** agents and are untouched by this cutover.

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

- Builtin (orvilo) rows render a fixed `Orvilo` harness label — no harness
  select, no engine select. External agents keep their own config.
- The model picker lists the model routes of the user's enabled
  `runtime:'orvilo'` + `target:'sandbox'` provider bindings
  (`useProviderBindingStore`); it is Prime's inference backend
  (`broker.infer` `modelRoute`), not an agent/harness concept. With no
  bindings configured the picker shows a hint to create one.
- Execution target is a static `Embedded` label for builtin agents
  (`builtin = embedded-only` — see below); the device picker stays for
  external types.
- Effort/mode/speed selects route through `applyHeteroSelection`.

## Dispatch — task path and the chat boundary

`heteroDispatch` admits **every** `type:'orvilo'` plan — regardless of
`executionTarget` — into the embedded fork:

- `resolveEmbeddedDispatchRoute` returns a canonical context only for
  real task dispatches (`operationTaskId` + `taskRunner`-written
  `appContext` dispatch fields). Task runs open
  `openEmbeddedDispatchHost` → `driveEmbeddedCanonicalRun` →
  `PrimeEmbeddedRuntime`, same as before.
- **Chat runs have no canonical task context**, so they hit the honest
  boundary `EMBEDDED_CHAT_NOT_ADMITTED` and fail loudly through
  `finalizeHeteroDispatchError` — they never fall back to the retired
  engine→CLI spawn path. See "Open boundary" below.
- The device branch is gated by `heteroPlan.kind !== 'sandbox' &&
heteroType !== 'orvilo'`, so an orvilo plan can never reach
  `spawnHeteroSandbox`/device even when a stale `executionTarget` says
  local/device. **Builtin = embedded-only**: local builtin execution via
  a pinned on-device runner is not wired; there is nothing to point the
  device picker at, so the UI hides it for builtin agents and dispatch
  ignores it.

## Open boundary — chat admission to embedded Prime

`CanonicalCoreRuntimeHost` / `CanonicalRunAuthority` /
`TaskExecutionControlModel` / `executionGrants` are row-locked to
task-shaped rows (`createGrant` requires `task:{id,projectId,workspaceId}`),
and `agent_operations` / `topics` carry no execution-control columns. A
chat-scoped admission needs a control-plane expansion (the deferred item
the dispatch doc names): either chat-shaped canonical rows or a
chat-scoped grant contract. Until that lands, orvilo chat runs fail at
`EMBEDDED_CHAT_NOT_ADMITTED` rather than executing on the retired engine
path.

## Non-negotiables preserved

- No raw model/engine names leak into non-settings work surfaces — model
  appears only as the binding-driven settings picker and the pinned
  `modelRoute` on the wire.
- Claude Code / Codex stay first-class external agents (Local CLI /
  platform groups), selectable as separate agent types.
- Prime is fixed builtin — never a selectable engine.
