# Electron real-model integration

Use three distinct checks when developing a chat interface:

| Check               | Runtime                                                               | What it proves                                         |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| UI fixtures         | Electron with deterministic responses                                 | Layout and interaction states                          |
| CLI smoke test      | Installed OpenCode and a real provider                                | CLI/provider availability                              |
| Product integration | Electron, authenticated real gateways, registered device and provider | Sending, execution, streaming and persistence together |

A successful CLI response or a mock gateway screenshot does not prove the last
row. Keep the fixture and real-integration launch configurations separate.

## Local configuration

Use an isolated development database and desktop profile. Keep secrets outside
the repository, preserve the existing development authentication configuration,
and use the same application origin throughout the flow (`localhost`, not a mix
of `localhost` and `127.0.0.1`). Never reuse production device identities or
credentials for a disposable test environment.

The server and Electron must agree on `DEVICE_GATEWAY_URL`. The server must also
have `ENABLE_AGENT_GATEWAY=1`, `AGENT_GATEWAY_URL`, and the corresponding
`DEVICE_GATEWAY_SERVICE_TOKEN` and `AGENT_GATEWAY_SERVICE_TOKEN`. Use real gateway
listeners, not the fixture server on port 3407. Example local ports are 3417 for
the device gateway and 3418 for the agent gateway.

The gateway processes take their shared secret as `SERVICE_TOKEN`. They verify
application-issued JWTs with `JWKS_PUBLIC_KEY`; export only the public JWK from
the server's existing `JWKS_KEY`. The application retains the private signing
key. Health responses alone do not prove that the keys and tokens agree.

Use the repository's workspace-capable device gateway from a successful
[CI build](../../docker-compose/deploy/device-gateway/README.md), and verify its
SHA256 manifest before running it. The unpatched upstream 0.4.0 device gateway
does not implement Orvilo's workspace pools. Use an artifact matching the host
architecture, or user-mode emulation for an isolated local test. Do not run the
production activation script or bypass the CI-only build guard.

Point the device gateway's `ORVILO_API_BASE_URL` and the agent gateway's
`LOBE_API_BASE_URL` at the local Next server. `APP_URL` must match that server's
origin, including its port. Start the web authorization SPA as well as Electron:
the `/oauth/consent/*` and `/oauth/callback/*` pages use the web SPA. The backend's
`VITE_DEV_PORT` must match that SPA's port; Electron's renderer is a separate
server. Their dependency caches are isolated because they compile different
platform branches.

## Authorize and connect

Build the embedded CLI in each new worktree before testing device execution:

```sh
cd apps/cli
bun run build
```

This produces `dist/index.js` and stages the Prime runner. Starting the Electron
renderer alone does not produce these artifacts. Verify the complete build
succeeds, then launch Electron from an environment where `opencode --version`
works. In a disposable integration environment, install the CLI under a private
tools directory and put its `bin` directory on the desktop process's PATH.

1. Configure Electron to use the local self-hosted server and sign in with the
   development account through the normal browser flow.
2. Complete desktop authorization. A renderer session cookie alone is
   insufficient: Electron generates a PKCE challenge, receives the callback via
   the handoff endpoint, and exchanges the authorization code itself.
3. Confirm the desktop gateway indicator is connected and the device list shows
   this machine as **registered and online**. A connected socket alone does not
   prove execution admission.
4. If the Agent runs in a workspace, share the personal device into that
   workspace through the existing device controls. Keep it private unless other
   workspace members actually need access. Select the device and a real working
   directory through the existing execution controls.
5. Confirm OpenCode is available to Electron's process, and select an available
   provider/model in the Agent configuration. A shell-only PATH can differ from
   the desktop launch environment.

On headless Linux, provide a functioning browser opener or have browser
automation open the exact authorization request created by Electron. Preserve
the normal cookies, consent, state, PKCE exchange and handoff. Do not replace
this with a fabricated JWT or injected desktop token. Without a system keyring,
the desktop may keep credentials only in memory; reauthorize after restarting
instead of assuming that preserving the profile also preserves credentials.

## Acceptance

Send a fresh, identifiable prompt from the Electron chat composer. Check that
the selected device starts a real OpenCode session, the provider returns output,
and that output streams into the same conversation. Reload and confirm the
response persists. Record the source commit, provider/model, device scope and
result, and attach a screenshot and redacted execution evidence to the PR.

Do not publish session cookies, OAuth codes, refresh tokens, private JWKs or
gateway service tokens. Report the last successful stage when a run fails:
browser login, desktop authorization, registration, workspace enrollment,
dispatch, provider execution, stream delivery, or persistence.
