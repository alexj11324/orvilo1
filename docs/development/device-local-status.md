# Device local status

Settings → Devices (personal) lists devices from the server registry. On desktop, this machine only
appears there if it registered successfully. Before this change, every way registration or
auto-connect could fail was silent, so "this machine did not register" looked the same as
"you have no devices".

## What was silent before

| Where                                 | What happened                                                                                                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GatewayConnectionCtr.registerDevice` | `fetch` to `/trpc/lambda/device.register` was awaited but `res.ok` never checked; a 401/403/500 resolved normally. It also returned silently when the server URL or token was missing. |
| `gatewayConnectionSrv.doConnect`      | Registration only ran when the JWT carried a `sub`; otherwise it was skipped with no log. A thrown registration error was only logged as "non-fatal".                                  |
| `GatewayConnectionCtr.tryAutoConnect` | Returned with no trace when the gateway switch was off, no remote server was active, or there was no access token.                                                                     |
| Renderer                              | Had no notion of this machine's own state; only the server list was rendered.                                                                                                          |

## Phases

The main process records the last outcome and exposes it as `GatewayLocalState`
(`{ phase, reason?, at }`) on the existing `gatewayConnection.getConnectionStatus` IPC and the
`gatewayConnectionStatusChanged` broadcast. The mapping lives in
`apps/desktop/src/main/services/gatewayLocalState.ts` (pure, unit tested).

| Phase                | Meaning                                                                                                                       | UI action     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `disabled`           | Gateway switch is off (also after the user disconnects)                                                                       | none          |
| `notConfigured`      | No active remote server config                                                                                                | none          |
| `signInRequired`     | No access token, or token refresh failed                                                                                      | Sign in again |
| `registering`        | `device.register` in flight                                                                                                   | none          |
| `registerFailed`     | Register returned non-2xx / threw / token has no user id. Wins over a connected socket, because the device will not be listed | Retry         |
| `connecting`         | Registered, socket handshake in progress                                                                                      | none          |
| `connected`          | Socket up and registration accepted                                                                                           | none          |
| `gatewayUnreachable` | Socket closed or connect threw after an attempt                                                                               | Retry         |

`reason` is a status code plus a short server message (`HTTP 403: ...`), clipped to 160 chars. It
never contains headers or tokens.

Retry calls the existing `connect` IPC. When the socket is already up and the last outcome is
`registerFailed`, `connect` re-runs only the registration instead of returning early.

Auto-connect timing is unchanged; only its result is now recorded.

## Renderer

`src/features/DeviceManager/LocalDeviceStatus.tsx` renders a compact row above the personal list,
desktop only. It is hidden when the phase is `connected` and the machine is already in the list
(that row is the status).

## Still unknown

We do not know why the owner's machine stopped appearing. Candidates, in order of likelihood:

1. `device.register` returns a non-2xx (auth, schema or permission change on the server).
2. The access token expired or is missing, so auto-connect never runs.
3. The JWT has no `sub`, so registration is skipped.
4. The gateway switch is off or the remote server config is inactive.

The new row will name which one it is. Reproduce in Electron: sign out (expect `signInRequired`),
turn the gateway off (expect `disabled`), point the server URL at a host that rejects
`device.register` (expect `registerFailed` with the status), block the gateway host (expect
`gatewayUnreachable`).
