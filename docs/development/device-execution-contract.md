# Device Execution Contract

Authoritative contract for the Orvilo execution-architecture convergence.
Distilled verbatim from the product owner's spec (2026-10-03). All rules here
are normative; the two specialist packages (device-side Prime execution,
create/settings UI) implement against this document. When prose here conflicts
with an earlier doc, this document wins.

## North star

Orvilo AI uses the builtin **Prime** harness; Codex and Claude Code use their
own external harnesses. Every harness executes on an explicit **Device**. The
local machine and the user's own remote server are merely different devices —
there is no third "managed Orvilo" execution location.

A device picker is shown only when the current user has **more than one**
legitimate candidate device **and** is allowed to change the selection; hiding
the picker does **not** unbind the device.

## Three dimensions — never interchangeable

| Dimension   | Meaning                                | Fixed?                                          |
| ----------- | -------------------------------------- | ----------------------------------------------- |
| **Harness** | Agent-loop implementation              | Fixed: Prime for builtin; external for CC/Codex |
| **Model**   | Inference model                        | User setting                                    |
| **Device**  | The actual machine running the harness | Resolved to a real device — always              |

Forbidden: restoring purpose/role-generation/Persona wizards; showing a
Harness/Engine/"Embedded Prime" configuration row in builtin-AI settings;
falling back to a backend machine when no device exists; changing the
execution machine because the access surface changed (Mac app → browser);
bulk-renaming internal "runtime" to "Device".

## Device candidate sets

- `selectableDevices`: devices the principal may execute on — execution
  authorization, legal scope, capability, and version compatibility all pass.
- `runnableDevices`: the subset that is online and can start right now.

These are different sets. A device being offline does **not** remove it from
the candidate set — it only means it cannot start at this moment. The
candidate set is based on execution authorization, not visibility.

## `showDeviceSelector` rule

```
showDeviceSelector =
  permissionsLoaded && deviceInventoryComplete && canSelectDevice
  && selectableDevices.length > 1
```

- Loading / query failure is never treated as 0 or 1 device.
- **0 devices**: picker hidden; starting a run produces an explicit blocking
  message.
- **1 device**: picker hidden; resolves to the single device; re-verified
  before launch.
- **>1 devices**: picker shown.
- Policy-pinned / no permission: the picker is a non-editable item.
- With no device there is no managed Prime, no implicit sandbox, no automatic
  server fallback.

## Resolution priority chain

1. The execution session's already-bound device.
2. An explicit device on the request (when policy allows it).
3. The user's device preference for that agent.
4. Agent / workspace default.
5. The single legitimate candidate (only when exactly one exists).
6. Otherwise: `DEVICE_REQUIRED` (0 candidates) or `DEVICE_SELECTION_REQUIRED`
   (multiple candidates, no default).

Forbidden as unconditional defaults: "current desktop", "first online device",
"array item zero".

## Binding invalidation

A stale binding is not "never bound": if bound device A is deleted, revoked or
incompatible and only B remains, the result is `DEVICE_BINDING_INVALID` — no
silent re-bind; the UI offers an explicit "switch to B" repair. Automatic use
of the single device applies only to a principal that never chose.

## Auto-binding

Auto-binding happens only at server write time or at execution admission
(conditional write — never overwrites an existing binding, and each run
persists the final `deviceId`). Never `useEffect`-driven `updateAgentConfig`
from a settings page.

## Data model — reuse, don't extend

`heterogeneousProvider { type: 'orvilo' }`, `executionTarget: 'device'`, and
`boundDeviceId` are the existing fields — do not add `harness: 'prime'`. The
`type → adapter` mapping is fixed so contradictory configs cannot be written.
The local machine also has a stable `deviceId` and must not be listed twice
(unified entry with a "this machine" marker). Legacy `local` fields keep a
compat layer, but resolution must always end at a concrete device.

## Workspace preferences (existing chain, kept)

`useEffectiveAgencyConfig` + `agentDeviceOverrides`: Personal → agent config;
workspace member's own choice → `agentDeviceOverrides`; admin default → shared
config; policy-pinned → members cannot override. Automations bind their own
execution principal — never "whichever member last opened the page".

## Unified execution chain

Agent config + execution principal → unified config/permission resolution →
unified device resolution → fixed execution plan → harness adapter on the
device. Every entry point (normal chat, Issue execution, automation,
sub-tasks, resume) goes through the same logic — no parallel
`PrimeExecutionPlacementResolver`.

## `ResolvedRunIdentity`

```
{ operationId, agentId, deviceId, harnessId: 'prime', modelRoute,
  executionGeneration, subject: Conversation | Task }
```

plus a snapshot of the config/capability/authorization versions. Chat vs task
subjects are explicitly distinguished — a `RunSubject` is
`{ kind: 'conversation', topicId } | { kind: 'task', taskId, dispatchId }`.
Placeholder identifiers must never leak into task authorization or device
leases.

## Prime on-device

Reuse the existing runner (`noTools`/session/inference gaps are unfinished
work, not the final state): the device host ships the Prime artifact (packaged
into Desktop + CLI releases; no reliance on dev relative paths); the device
reports a verified version + artifact digest + protocol capability, re-checked
at startup; real isolation is kept (Docker ≠ Device; bare `spawn` on this
machine is not isolation); reuse the unified ACP boundary (Prime's own NDJSON
protocol must not pretend to be ACP); reuse the `apps/cli` agentRun lifecycle
(serial admission per operation, dedup, no duplicate writers); no separate
Prime gateway / cancel registry / callback settlement.

Inference credentials do not determine the device: the broker may be reused,
but Prime does not have to be on the same machine as the broker. Short-lived
capability credentials cross devices (bound to execution principal +
operation + device + expiry); API keys are never stuffed into agent config or
gateway messages.

## General agent-capability acceptance

Controlled tool execution (authorized scope + permissions + execution record

- over-authority rejection — deleting `noTools` alone does not count);
  continuous sessions (same-machine process alive → resume; after restart →
  recover or explicit context rebuild; device switch → new execution session +
  context preparation; native resume ≠ replaying history — report them
  separately); reasoning effort is shown only when both model and adapter truly
  support it; Prime tool tests must be actually executed by Prime.

## Changing settings mid-run

Changing the default device does not migrate a live run (new sessions use the
new device; surface "will apply to new execution sessions"). Switching a live
session's device = explicit execution-context rebuild (verify target device
repo/workdir/tools; never send device A paths or local session ids). Cancel
propagates to the actual executing device; only after confirmed exit/block does
the UI show cancelled. Disconnect ≠ failure ≠ re-run on another device ("state
unknown / reconnecting"; on reconnect re-verify the old run first). Device
leases are bounded; missed renewals stop side effects per policy.

## Create flow

Creating a conversation must not create a new agent. "New Orvilo agent" is
one-click (no LLM call, no `purpose` write, no Builder; clean up leftover
`openCreateModal('agent')`); writes fixed `type:'orvilo'` + deterministic
naming; does not copy the inbox's temporary model; idempotency key guards
double-clicks; the entry decides the destination (chat entry → new
conversation; Settings → that agent's settings); a single explicit "select
agent" action instead of writing `lastUsedAgentId` directly; navigation goes
through the unified `openNewConversation({ agentId })` helper — do not
hard-code the not-yet-wired `/chat/new` early.

## Settings page

Compact single-page groups: `AgentGeneralSettings` / `AgentModelSettings` /
`AgentDeviceSettings` / `AgentAccessSettings` /
`ExternalAgentConnectionSettings` (external only). No Harness/Engine/Embedded
rows. Zero-device / invalid-binding / offline states render as blocking
notices, not configuration items. The diagnostics page may show the actual
device / Prime version / run identity. External agents share the same device
component and rules; the connect flow follows the same 0/1/many rules; opening
settings never triggers inference; each setting has exactly one write entry.

## Migration

The schema layer refuses new writes of the retired `engine` field (not just a
TS `never`); `local` + `deviceId` → same device; `device` + `deviceId` → kept;
`local` without `deviceId` → unresolved (no guessing); `sandbox`/`embedded` →
mapped only when a real node can be proven; switching models never
batch-clears instructions/history/memory.

Enforcement as shipped (Package D):

- **Write refusal** — `refuseRetiredAgencyConfigFields` (a shared zod
  `superRefine` in `apps/server/src/routers/lambda/_helpers/`) rejects any
  request carrying `agencyConfig.heterogeneousProvider.engine` or
  `adapterType` with `BAD_REQUEST`. It is wired into every client write
  surface that accepts an `agencyConfig` payload: `agent.updateAgentConfig`,
  `agent.createAgent`, `agent.createAgentOnly`, and the agentGroup member
  schema (`batchCreateAgentsInGroup`, `createGroupWithMembers`). Internal
  callers that bypass the schema get the same smallest normalization at the
  write chokepoint instead: `AgentModel.create` / `batchCreate` /
  `updateConfig` strip the retired fields via
  `normalizeAgencyConfigForWrite` (`@orvilo/types`) before persisting — the
  values are meaningless to every reader, so they are dropped rather than
  carried forward.
- **Client merge** — the optimistic-config merge in
  `src/store/agent/slices/agent/action.ts` re-sends the cached row wholesale;
  it normalizes the merged `agencyConfig` first so a legacy row still holding
  retired fields does not re-send them and trip the new rejection.
- **`local` + `deviceId`** — unchanged semantics: the bound device is the
  stored identity (`resolveExecutionTarget` still upgrades a bound `local` to
  `device` off-client; `resolveExecutionPlan` binds `boundDeviceId`).
- **`local` without `deviceId`** — unresolved, no guessing:
  `resolveExecutionPlan` no longer falls back to `localDeviceId` for
  non-platform agents (the machine running the resolution is not the row's
  device — platform-task `local` keeps its own semantic because the locally
  registered runtime IS the provable node), and the bot-trigger `local`
  promotion now leaves unbound rows unrouted instead of auto-grabbing an
  online device.
- **Retired spellings (`embedded`, and any value outside the live
  `executionTarget` union)** — `resolveExecutionTarget` maps them to `device`
  only when a stored `boundDeviceId` proves a real node; otherwise they
  resolve to `none` (pending) and wait for explicit config. `sandbox` stays
  live: it is a current target spelling for heterogeneous harnesses, and for
  builtin-orvilo rows the transitional embedded fence is itself the provable
  node until package B flips it.
- **Model switch** — `AgentModel.updateConfig` deep-merges; a regression test
  pins that `{model, provider}` writes preserve `systemRole`, `chatConfig`,
  `editorData`, `params`, `profile`, and `agencyConfig` verbatim.

## Acceptance matrix (all must pass)

- New agent → no Builder, no model call; new conversation → no agent created.
- Settings page → no Harness/Engine/Embedded row.
- 0 devices → picker hidden, run explicitly blocked, no arbitrary backend.
- 1 device → picker hidden, run record binds that device.
- 2 devices → picker shown, selectable.
- A online + B offline → both remain candidates.
- Bound A offline → no silent switch to B.
- A deleted, B remains → `DEVICE_BINDING_INVALID` + explicit repair.
- Query failure → not treated as 0 or 1.
- Access-surface switch → device unchanged.
- Member changes own choice → others' defaults untouched.
- Policy-pinned → UI and server both reject overrides.
- Prime runs on remote B → a real Prime process exists on B and file ops land
  on B.
- Second message → context continues correctly.
- Default changed to B → run on A is not migrated.
- Cancel/disconnect/retry → no duplicate executors, no false "stopped".
- Prime tool task → tools actually authorized through Prime.
- Claude Code / Codex → no regression.

Remote acceptance requires ≥2 independent device process environments: the
controller initiates, the chosen device creates a temp file, and device
identity / artifact digest / operation / cancel records are checked — same-
process mocks with a swapped `deviceId` do not count.

## Final standard

Choosing Orvilo AI actually starts Prime; choosing device B runs Prime on B
for real; a single candidate → no stray device UI, but the execution record
binds that device explicitly.
