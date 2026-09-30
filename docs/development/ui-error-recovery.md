# Task and settings recovery

These behaviors apply to the existing canary UI and do not require the ReUI shell migration.

## Task submission and handoff

`TaskDetailSliceActionImpl.createTask` owns the in-flight creation guard. Keyboard submission and button submission share that guard, which is released on success or failure. This prevents simultaneous submissions in one client; it does not provide server-side idempotency across clients.

Running-task handoff awaits its confirmation callback. A failed row lookup or missing task revision produces an error and rejects the operation, preserving the confirmation for recovery. The server's ownership CAS and execution fencing are unchanged; the UI does not optimistically change ownership before acceptance.

## Settings bootstrap and authentication

Appearance, shortcut and memory pages use `SettingsUserStateBoundary` for cloud-backed content. Before initialization, it shows the existing settings-section skeleton. A bootstrap failure replaces the skeleton with `AsyncError`; retry calls the existing user-state refresh and prevents simultaneous retry requests. Already initialized settings and locally available desktop controls remain usable.

`AsyncError` exposes recovery consistently across page, block, inline and metric variants. A 401 offers sign-in; a 403 explains the permission failure and offers a home link. Code-only `UNAUTHORIZED` and `FORBIDDEN` errors normalize to those statuses. Explicit Electron sign-in can open the existing authentication flow before cloud configuration initialization; automatic authentication requests retain their existing initialization gate.

## Board limits and shortcut display

The legacy task board still limits each column to 100 cards. Its footer shows the visible/total count and offers the existing list view without discarding filters. This is an access path to the list, not a new unlimited list or backend pagination contract. Cursor-backed work boards keep their existing paging behavior.

Desktop shortcut settings normalize Electron accelerator names for the platform-aware `HotkeyInput`, including its named form binding and reset value. The stored shortcut and Electron IPC registration format are unchanged.

## New topic navigation

The agent sidebar completes the new-topic action against the source conversation before navigating to the bare agent URL. The action awaits topic switching and message refresh. Pending clicks are disabled; a rejected action shows an error, skips the explicit navigation and allows retry. Route subscriptions may also react to topic state changes; message revalidation follows the existing SWR error contract. The explicit SWR data mutation propagates rejection without replaying the action as a revalidation.

## Regression coverage

Targeted tests cover duplicate creation, handoff preflight rejection, user-state failure/retry, 401/403 recovery and the Electron explicit-action gate, capped-column list switching, and accelerator display normalization. Native authenticated Electron flows and healthy-gateway successor execution require separate runtime validation.
