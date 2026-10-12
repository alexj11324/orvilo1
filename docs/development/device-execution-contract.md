# Device Execution Contract

Authoritative contract for the Orvilo execution-architecture convergence.
Updated by the product owner’s decisions in #748 and #759 (2026-10-12). All rules here
are normative; the two specialist packages (device-side Prime execution,
create/settings UI) implement against this document. When prose here conflicts
with an earlier doc, this document wins.

## North star

Orvilo AI uses the builtin **Prime** harness; Codex and Claude Code use their
own external harnesses. Every harness executes on an explicit **Device**. The
local machine and the user's own remote server are merely different devices —
there is no third "managed Orvilo" execution location.

Device and model selection belong to Agent settings. Creation and saving require
an explicit device and model. Chat chooses only an Agent; its default is the
Orchestrator. Starting a chat does not create an Agent or modify its settings.
A valid singleton host may hide the settings picker, while an unset or invalid
binding keeps the repair controls visible even with one candidate.

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

## Device settings and resolution

A device has one enrolling user and one stable physical identity. There is no
private/workspace device visibility, shared device copy, enrollment into a
workspace, or sharing toggle. The configuring member can bind any of their own
registered devices to either a private or workspace Agent. Both Agent visibility
choices are available inside a workspace. Changing visibility preserves the host.

A run uses the Agent’s saved `boundDeviceId` and model. Topic pins, chat requests,
member preferences, and the current desktop never replace that saved choice.
Agent Use authorizes a workspace member to run on the saved host, including a
host owned by another active member. Physical gateway routing uses that enrolling
user; content, tool authorization, and ingest retain the run’s workspace.

Loading/query failure is never treated as zero devices. Offline hosts remain
registered candidates, and cannot run until their owner reconnects. The error
names the saved device and says it is offline. Invalid bindings expose repair
controls in settings. A valid singleton host may hide the picker.

## Binding invalidation

A stale binding is not "never bound": if bound device A is deleted, revoked or
incompatible and only B remains, the result is `DEVICE_BINDING_INVALID` — no
silent re-bind; the UI offers an explicit "switch to B" repair. Automatic use
of the single device applies only to a principal that never chose.

## Binding writes

Agent creation/saving records the explicit selected host. Opening settings never
writes a binding, and execution does not fill an unset binding. Invalid bindings
require a deliberate settings change; another available machine is never a fallback.

## Data model — reuse, don't extend

`heterogeneousProvider { type: 'orvilo' }`, `executionTarget: 'device'`, and
`boundDeviceId` are the existing fields — do not add `harness: 'prime'`. The
`type → adapter` mapping is fixed so contradictory configs cannot be written.
The local machine also has a stable `deviceId` and must not be listed twice
(unified entry with a "this machine" marker). `local` means the saved physical device, and resolution always ends at its
concrete id. Device ownership and workspace resource ownership remain separate.

## Runtime branding — derived on reads, never stored

There is no separate persisted branding column. Every surface derives the
runtime type at read time through `resolveAgentRuntimeType` /
`normalizeAgentRuntimeIdentity`:

- `agencyConfig.heterogeneousProvider` (normalized via
  `normalizeHeterogeneousProviderConfig`, so legacy/alias spellings resolve to
  the registered type) is the single source of truth.
- Legacy rows with no `agencyConfig` fall back to
  `isHeterogeneousAgentModelId(config.model)` (a model id that names a known
  heterogeneous runtime brands as that runtime).
- Otherwise the row is `'orvilo'`.

Every consumer — sidebar `heterogeneousType`, `AgentRuntimeIcon`,
settings/headers, selectors — reads the derived type through this one
function, so rebranding never requires a data migration and an icon is always
bound to a registered runtime (unknown types fall back to the Orvilo mark,
never to a stale per-agent asset).

## Saved Agent configuration

There are no member device/model overrides or per-conversation model settings.
`useEffectiveAgencyConfig` reads the saved Agent configuration. Member mode and
topic sharing remain independent settings. Agent edits affect the next run for
all authorized users, while a live run keeps its admitted configuration.

## Reading a device's filesystem skills

The slash menu, the skill chips in a message and the Skills panel all list the
skills found on the machine the Agent runs on. They must agree, so they resolve
that machine the same way: `useProjectSkillsDeviceId` (menu and chips) and the
working sidebar both start from the caller's effective config
(`useTopicAgencyConfig`), not from the shared Agent row.

`resolveBoundExecutionDeviceId` turns that config into the device to scan. A run
that goes through a device scans it over `device.listProjectSkills`; a run on
this machine returns `undefined` and reads over Electron IPC. Reading the shared
row instead treats a member's own "this device" pick as a workspace device, and
the scan fails with `Workspace device not found.`

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

Reuse the existing runner — the upstream-capability unseal (protocol v2 +
`docs/development/prime-runner-unseal.md`) made the vendored SDK defaults the
device defaults: builtin tool surface enabled (default `ipython`; bash/edit
extension-registered when their runtime deps exist — the shipped image only
guarantees what it ships, the runner reports what it actually activated),
persistent `SessionManager` under the device `stateDir` (restart = real resume,
not rebuild — the init ack's `sessionId` echo is the truth oracle), real
`ResourceLoader`/`McpManager`/`SettingsManager` against the device-supplied
workspace, thinking level upstream-clamped to the model capability the issued
binding advertises. Tools execute INSIDE the runner on the device — the broker
only relays inference traffic (`broker.infer` carries tool schemas +
`tool_calls`/`tool` results both directions; there is no host-side tool
round-trip). The device host ships the Prime artifact (packaged
into Desktop + CLI releases; no reliance on dev relative paths); the device
reports a verified version + artifact digest + protocol capability, re-checked
at startup; real isolation is kept (Docker ≠ Device; bare `spawn` on this
machine is not isolation); reuse the unified ACP boundary (Prime's own NDJSON
protocol must not pretend to be ACP); reuse the `apps/cli` agentRun lifecycle
(serial admission per operation, dedup, no duplicate writers); no separate
Prime gateway / cancel registry / callback settlement.

Still sealed (credential architecture, not capability): zero-credential
`AuthStorage`, single-provider `ModelRegistry` = `orvilo-broker` only, telemetry
off, broker-only inference egress, artifact pin verification, lease bounds.

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

Changing the Agent’s saved device does not migrate a live run; the next run
uses the new device. Switching a live
session's device = explicit execution-context rebuild (verify target device
repo/workdir/tools; never send device A paths or local session ids). Cancel
propagates to the actual executing device; only after confirmed exit/block does
the UI show cancelled. Disconnect ≠ failure ≠ re-run on another device ("state
unknown / reconnecting"; on reconnect re-verify the old run first). Device
leases are bounded; missed renewals stop side effects per policy.

## Create flow

Creating a conversation must not create a new agent. "New Orvilo agent" is
a configuration form (no LLM call, no `purpose` write, no Builder); requires
a runtime, model, and device; idempotency key guards
double-clicks; the entry decides the destination (chat entry → new
conversation; Settings → that agent's settings); a single explicit "select
agent" action instead of writing `lastUsedAgentId` directly; navigation goes
through the unified `openNewConversation({ agentId })` helper — do not
hard-code the not-yet-wired `/chat/new` early.

Agent names remain editable; their icons identify the declared runtime. Agent
lists, selectors, settings headers and welcome surfaces use `AgentRuntimeIcon`
with the shared provider catalog: Orvilo uses the product logo, and supported
external agents use their own brand icons. Saved custom avatars and name
initials do not override these runtime icons.

At the `AgentModel` write boundary, ordinary creation without an external
provider explicitly binds to `type:'orvilo'`. An external provider must declare
a type accepted by `HeterogeneousAgentTypeSchema`; missing, empty, null,
numeric or unknown types return `BAD_REQUEST` before insertion. Batch creation,
duplication and configuration updates enforce the same rule. Partial provider
updates merge with the existing configuration before validation, so changing
the command or display name preserves the runtime. Legacy type inference is a
read compatibility path and must not manufacture an external identity for a
new write. This does not bulk-migrate existing records.

## Settings page

Compact single-page groups: `AgentGeneralSettings` / `AgentModelSettings` /
`AgentDeviceSettings` / `AgentRuntimeSettings` /
`ExternalAgentConnectionSettings` (external only) / `AgentUseSettings`. No Harness/Engine/Embedded
rows. Zero-device / invalid-binding / offline states explain the blocking condition
and keep repair controls available. Failed saves show the server’s reason and
leave the form editable. The diagnostics page may show the actual
device / Prime version / run identity. External agents share the same device
component and rules; the connect flow follows the same 0/1/many rules; opening
settings never triggers inference; each setting has exactly one write entry.

## First-agent gate (post-login onboarding)

While no usable agent exists, `AgentOnboarding` (mounted once at the
`(main)`/`(mobile)` layouts, not inside a page) covers the entire app window
— sidebar, title area, and every route — because nothing else can run yet.
Provider/credential/device settings stay reachable during the block: they are
the fix-it paths (`isFirstAgentSetupPath`). Device selection is deliberately
absent from the flow — it is an advanced concern owned by Settings → Devices.
The host auto-resolves via `useFirstAgentDevice`: this computer on Electron
(`resolveLocalExecutionIdentity`), then a still-online persisted pick, then
the first online personal device; the resolved id is checkpointed into the
onboarding setup record. Creating the first agent selects it through
`selectAgentForConversation` so the user lands on the agent they just made.

## Schema changes

There are no real users: retired device sharing fields, member override fields,
and topic model/provider columns are removed by schema DROP statements. There
is no data migration, backfill, or compatibility handling for these fields.

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
  `editorData`, `params`, `profile`, and the device binding, while synchronizing
  the saved runtime model.

## Acceptance matrix (all must pass)

- New agent → no Builder, no model call; new conversation → no agent created.
- Settings page → no Harness/Engine/Embedded row.
- 0 devices → creation blocked with a device setup path, no arbitrary backend.
- 1 device → valid saved binding may hide picker; unset binding remains repairable.
- 2 devices → picker shown, selectable.
- A online + B offline → both remain candidates.
- Bound A offline → no silent switch to B.
- A deleted, B remains → `DEVICE_BINDING_INVALID` + explicit repair.
- Query failure → not treated as 0 or 1.
- Access-surface switch → device unchanged.
- Member runs a workspace Agent → owner’s saved host, with Agent Use authorization.
- Private/workspace visibility switch → saved host unchanged.
- Member cannot change another owner’s device settings.
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
