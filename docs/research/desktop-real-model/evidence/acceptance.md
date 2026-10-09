# Real Electron / Step5 acceptance

- Date: 2026-10-09 UTC
- Source revision: `fd0b7c8e15f6fc66a3376f6340c91f57c4b1cbff`
- Runtime: Electron development app, isolated local PostgreSQL/Redis, Next
  `localhost:3010`, web authorization SPA `localhost:9876`.
- Model: `opencode/step-5-preview-free`, OpenCode `1.18.35`.
- Device gateway: workspace-patched CI artifact from run `37175710468`, artifact
  `11292804722`; ZIP SHA256
  `3b02bfc133b162fba284d21f8f95ed7f4384e7f1414a4d40b6cd7c6e2f5079f7`.
  Its SHA256 manifest passed. ARM64 binary ran locally under QEMU user emulation
  on port 3417. Agent gateway was upstream 0.4.0 on port 3418.

## Verified path

1. Electron generated its own PKCE authorization request. The local test user
   completed the normal OIDC login/consent endpoints, desktop callback, handoff
   polling and authorization-code exchange. No desktop JWT was fabricated or
   injected. Only the web identity fixture used the existing test Clerk session;
   there was no mock device gateway or model response.
2. The device registered through the product API and its gateway connection
   reported `connected`. The personal device was also shared privately into the
   test workspace through the existing enrollment endpoint.
3. A real prompt was entered and sent using the Electron composer:
   `Real Electron integration probe 2026-10-09: reply only STEP5_ELECTRON_CONNECTED. Do not use tools or execute commands.`
4. The embedded CLI started OpenCode ACP. Its configuration event selected
   `opencode/step-5-preview-free`; two assistant text chunks produced
   `STEP5_ELECTRON_CONNECTED`, followed by `end_turn`.
5. The reply appeared in Electron and remained visible after a full renderer
   reload. The topic was `tpc_48yTMHJzsHLR`.

Artifacts:

- [Real response](./electron-response.png)
- [Response after reload](./electron-after-reload.png)
- [Redacted execution receipt](./real-execution.json)
- [Persistence check](./persistence.json)

## Fixes and checks

The real integration setup required a workspace-capable gateway, normal desktop
authorization, an embedded CLI build, an installed OpenCode executable on the
desktop PATH, and a valid execution directory. The earlier mock UI environment
did not provide these. The new integration guide documents those prerequisites.

Running web authorization and Electron concurrently also exposed their shared
Vite dependency cache: web optimization invalidated desktop dynamic imports.
The renderer now has its own cache. After restarting with separate caches, the
web authorization entry served HTTP 200 and the desktop settings/chat loaded.

- Focused Vite configuration regression: 1 test passed.
- Scoped `bun run check` across the four source/documentation files: lint clean,
  1 test passed.
- `apps/cli` full build: passed, including staged Prime runner artifacts.
- Independent light review: no findings in the four-file change.

## Limits

This proves real model sending, ACP output, display and reload persistence in a
local development environment. It does not verify production Clerk/Google
login, production gateways, tool execution or approval behavior. The receipt
records the actual execution directory; the screenshot's Desktop sidebar label
is not evidence of execution-directory selection. This headless host has no
system keyring, so restarting Electron required another normal authorization.
