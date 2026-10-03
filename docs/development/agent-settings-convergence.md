# Agent settings convergence (Prime cutover, work package C)

The create flow, agent settings page, and execution-device picker converge on
the contract in [device-execution-contract.md](./device-execution-contract.md):
a conversation is owned by exactly one agent, agent creation is one click with
no configuration wizard, and a builtin agent's settings page shows model,
device, and access — never Harness, Engine, or an "Embedded Prime" placeholder.

## Create flow

`src/features/HomeSidebar/hooks/useCreateMenuItems.tsx`

- **新会话 creates no agent.** It reuses the current explicit selection (or the
  last explicit pick) and opens a blank conversation through
  `openNewConversation` in `src/features/Conversation/selectAgent.ts`.
- **新增 Orvilo Agent is one click** — `type: 'orvilo'` binding, deterministic
  title (`Orvilo AI`, numbered by the store when it collides), legal defaults,
  no LLM call, no purpose field, no Agent Builder. The leftover
  `openCreateModal('agent')` branch in `ModalProvider.tsx` is gone; the modal
  provider only handles `'group'`.
- **Idempotency**: every create carries a `clientRequestId`
  (`crypto.randomUUID()`); the store's `#createAgentInFlight` map shares the
  in-flight promise so a double-click or retry can't mint a twin.
- **Origin decides destination**: `origin: 'chat'` selects the new agent and
  opens a blank conversation; `origin: 'settings'` navigates to
  `/settings/agents/:agentId` without touching the chat default.
- Group creation is untouched and mints no agents.

## Settings page

`src/features/AgentSettings/` (plural — the singular `AgentSetting` is the chat
modal) hosts the compact single-page groups:

| Group      | File                                  | Renders for                                                  |
| ---------- | ------------------------------------- | ------------------------------------------------------------ |
| General    | `AgentGeneralSettings.tsx`            | builtin orvilo agents (migrate row for legacy providers)     |
| Model      | `AgentModelSettings.tsx`              | any agent with a heterogeneous provider (builtin + external) |
| Device     | `AgentDeviceSettings.tsx`             | every agent — the single device component                    |
| Access     | `AgentAccessSettings.tsx`             | workspace-scoped agents only                                 |
| Connection | `ExternalAgentConnectionSettings.tsx` | external agents only (remote availability + local CLI tabs)  |

`ProfileEditor/index.tsx` composes these groups; `EngineConfigCard`,
`RemoteAgentConfigCard`, `WorkspaceAgentPolicyCard`, and
`WorkspaceAgentDevicePolicy` are deleted. `HeterogeneousAgentStatusCard` and
`CloudHeterogeneousConfig` moved into `AgentSettings/` unchanged.

- **No Harness row, no Engine row, no fixed Embedded Prime row** for builtin.
- Reasoning strength / effort / mode rows render only when the runtime
  capability says the model+adapter supports them — never statically.
- One write path per setting. Device selection goes through
  `useSelectAgentDevice` for builtin, workspace, and external agents alike —
  no parallel pickers on Profile/Workspace/connection cards.

## Device picker

`src/features/DeviceManager/useDeviceSelectorState.ts` consumes the shared
formula:

```
showDeviceSelector = permissionsLoaded && deviceInventoryComplete
                  && canSelectDevice && selectableDevices.length > 1
```

- **Loading / failed inventory ≠ 0 or 1 devices.** `deviceInventoryComplete`
  stays false on error; the group shows an `AsyncError` retry instead of a
  judgment.
- **0 legal devices** → hidden picker + blocking zero-device notice.
- **1 legal device** → hidden picker; resolution happens at admission (the
  connect flow auto-picks its single candidate once, guarded by a ref), never
  as a render-time `useEffect` write.
- **>1** → the picker renders. Offline devices stay visible as candidates —
  offline ≠ removed from config — they just can't run.
- **Policy-fixed / no permission** → non-editable display of the bound device.
- **Stale binding** → `DEVICE_BINDING_INVALID` repair prompt listing each legal
  device ("改用 B"); never a silent rebind.
- A bound-but-offline device gets its own blocking notice.

The local machine has a stable `deviceId` and a unified "this machine" entry
with a badge — never listed twice. Shared targets (`local`/`sandbox`) appear
only for external CLI agents; builtin orvilo agents bind to real devices only.

`src/features/ConnectAgent/` applies the same 0/1/many rules to the external
connect flow: inventory failure ≠ empty, single candidate auto-resolves at
flow admission, zero candidates shows the blocking empty state with offline
devices still listed.

## Agent sidebar nav

`src/features/AgentSidebar/Header/Nav.tsx` carries the lobehub nav rows —
新话题 / 搜索 / 助理档案 /self-learning+goals (labs-gated) / 任务 — with the
permission gate (`hideProfile` = not editable, or access not yet resolved, or
no resource/content edit rights) restored. The profile entry pushes
`/agent/:aid/profile`, whose route owns the Settings→Agents exile redirect
into `/settings/agents/:aid`; the tasks entry lands on `/agent/:aid/tasks`.

## Invariants pinned by tests

- `useDeviceSelectorState.test.tsx` — the visibility matrix (loading, error,
  0/1/2 devices, offline candidates, permission, scope pools) plus binding
  state classification.
- `AgentDeviceSettings.test.tsx` — picker vs. blocked states vs. read-only
  display at the component level, and zero Harness/Engine/Embedded rows.
- `useCreateMenuItems.test.tsx` — one-click create contract, per-origin
  routing, and `clientRequestId` issuance.
- `action.test.ts` (`createAgent`) — in-flight dedupe by `clientRequestId`.
