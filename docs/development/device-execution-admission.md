# Device Execution Admission (WD-03)

Companion note to `device-execution-contract.md`, recording the implemented
behavior of unified admission — the single place a hetero/device run gets its
execution plan. Live module:
`apps/server/src/services/deviceGateway/executionAdmission.ts`.

## One plan, one resolver

`resolveHeteroExecutionPlan` is the only entry `dispatchHeteroAgent` (and every
surface that reaches it — chat, Issue, automation, subtask, resume) uses to
decide _where_ a run executes. It calls `resolveExecutionDevice` from
`packages/types` exactly once and returns one of:

- `{ kind: 'device', deviceId, reason }` — dispatch proceeds against that
  device id.
- `{ kind: 'sandbox' }` — the family may execute in the cloud sandbox.
- `{ kind: 'blocked', code, detail }` — the contract error code
  (`DEVICE_BINDING_INVALID`, `DEVICE_REQUEST_UNAUTHORIZED`,
  `DEVICE_REQUIRED`, `DEVICE_SELECTION_REQUIRED`,
  `DEVICE_ACCESS_DENIED`, `EXECUTION_TARGET_NONE`) is carried on `detail`;
  the surfaced `error` label keeps the legacy `No bound device` /
  `Device access denied` strings for compatibility.

## Authorized candidate set

`listAuthorizedDeviceCandidates` builds the inventory the resolver sees from
three sources:

1. **Scoped registry rows** — `DeviceModel.queryPersonal` /
   `queryWorkspaceDevices` for the caller's principal. Workspace scope fails
   closed when the list cannot be proven complete (`inventoryComplete: false`
   → the resolver never auto-binds and never answers `single_candidate`).
2. **Scoped online gateway devices** — personal scope only, the same
   gateway-transient compatibility window `getScopedOnlineDevices` allows
   (a freshly connected desktop may register before its DB row exists).
3. **Referenced devices** — a stored binding, session pin, member pick, the
   caller's own machine, or an explicit request may name a device outside the
   scoped list. Each referenced id is verified individually:
   `findByDeviceId` (caller registry) → `findWorkspaceDeviceById` (when the
   run is workspace-scoped) → `findByDeviceId` in the **agent owner's**
   registry. The owner-registry probe applies only to stored bindings and
   session pins (`ownerRegistry: true`): an author's personal device bound to
   a public workspace agent stays executable by authorized members, while a
   member's _explicit request_ can only name devices in the caller's own or
   the workspace registry. An unverifiable reference stays a non-candidate —
   the resolver then blocks honestly instead of silently substituting a
   default.

## Resolver input mapping

Stored config is normalized before the resolver runs:

- Topic pin (`topic.metadata.executionConfig.boundDeviceId` →
  `turn.topicBoundDeviceId`) → `sessionBoundDeviceId`.
- The raw per-request `deviceId` → `explicitDeviceId`, gated by
  `explicitRequestAllowed = !fixedPolicy && !workspaceScoped` (a disallowed
  request is dropped, never a silent override).
- The caller's resolved `agentDeviceOverrides[agentId]` →
  `userAgentPreferenceDeviceId`; a member pick shadows the shared-row default
  and is suppressed entirely under a fixed policy.
- Stored `executionTarget` → `agentDefaultDeviceId`: `device` → the bound id;
  `local` → the caller's `localDeviceId` under a member-select policy (fixed
  policy still resolves the bound id; remote/platform families never consume
  a stale bound id for `local`).
- `auto` suppresses the session binding so the resolver re-picks every run.

## Run identity

On admission the dispatcher records the full run identity onto
`agent_operations.metadata.executionPlan` (guarded `jsonb_set`, same ledger
pattern as `remoteAdmission`): `operationId`, `subject` (`{kind:'conversation',
topicId}` or `{kind:'task', taskId, dispatchId}`), `agentId`, `deviceId`,
derived `harnessId` (`type → adapter`, never a config field), model-route
reference, `executionGeneration`, and the resolution kind/reason.
`authorizedToolCall` still re-checks the device at dispatch time — admission
is never a bypass.

## Client transport intent

The client no longer picks a machine. `agentDispatcher` resolves
execution _intent_:

- Desktop `local` hetero + connected device gateway + personal agent →
  `gateway`: the server admits the run onto that same desktop via
  `agent_run_request` → `heteroIngest` — the unified, web-observable
  lifecycle.
- Gateway disconnected, or a workspace agent → `hetero` IPC (local-only
  lifecycle). **Remaining gap (W2-E):** these IPC runs stay invisible to the
  server; full convergence routes local execution through device-gateway
  ingest so `local` is purely a transport difference. That step is not landed
  yet.
- Everything else → `gateway`; the gateway transport sends only
  `localDeviceId` ("this machine") — the server resolves the rest.

## Not covered here

- Prime-device (device-side Prime) transport — blocked explicitly rather than
  faked through the builtin path.
- Real two-device verification (web→B, desktop-A→B) — exercised by unit
  tests against the resolver + candidate semantics; end-to-end matrix belongs
  to WD-06/WD-07.

## Known adjacent issue (pre-existing, not introduced here)

During WD-03 verification, dispatches that finalize in under \~100 ms (e.g. an
honest `GATEWAY_NOT_CONFIGURED` transport error) were observed leaving
`topics.status='running'` on at least one send path: `agent_operations`,
`messages`, and the Redis stream all settle correctly, but the UI keeps an
infinite "Task is running" banner on every surface. The settle/finalize path
predates this change — flagged for a staging sanity check and a follow-up fix,
not patched here.
