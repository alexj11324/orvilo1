# @orvilo/prime-harness

First-party agent harness runner — the container's PID 1 for `type: 'orvilo'`
runs, replacing the `prime-agent --mode acp` adapter for the embedded Prime
harness (design: `docs/development/prime-embedded-harness-design.md`).

## What it is

A single Node.js process that speaks the bounded ndjson JSON-RPC vocabulary in
`@orvilo/agent-execution/controlPlane/harnessProtocol` on stdin/stdout. It wraps
an **in-process** `createAgentSession` from the vendored upstream
(`vendor/prime`, Prime v0.9.8 @ `7d442aa`, MIT) configured so that:

- **No credentials exist in-process** — `AuthStorage.inMemory({})`, empty and
  never persisted. The runner is a _safe place_ for model traffic only.
- **No filesystem surfaces** — `SessionManager.inMemory`, `McpManager` with an
  in-memory `connectionStore` and no background verification, and
  `EmptyResourceLoader` (no extension/skill/prompt/theme/AGENTS.md discovery —
  workspace content is untrusted). Telemetry off.
- **No tools** — `noTools: 'all'` + `tools: []` + `customTools: []`; the init
  ack advertises `tools: []` and the host fail-closed-terminates the session if
  any `tool_execution_*`/`toolcall_*` event ever surfaces.
- **All inference exits through `orvilo-broker`** — the only registered
  provider. Its `streamSimple` converts each upstream `Context` into a
  sanitized `broker.infer` request (messages + modelRoute + maxOutputTokens —
  no endpoints, headers, or secrets) and streams host-pushed `broker.event`
  notifications back into a `AssistantMessageEventStream`. `baseUrl`/`apiKey`
  are inert placeholders (`orvilo-broker://local` / `embedded`).

stdout carries protocol frames only — every console method is rebound to
stderr so stray upstream logging can't corrupt the wire.

## Wire vocabulary (v1, `HARNESS_PROTOCOL_VERSION = 1`)

Host → runner requests: `harness.init`, `session.prompt`, `session.abort`.
Runner → host notifications: `harness.event` (text/usage/tool-violation/error).
Runner → host reverse requests (the only two allowed): `broker.infer`,
`broker.cancel`. Host → runner notifications: `broker.event`
(text/usage/error/end). Same bounds as the ACP transport: 1 MiB frames, 16
pending requests, 30 s request timeout (prompts are bounded by cancel, not the
wire — their request uses a 24 h timeout).

## Building

```sh
# one-time vendor dependency install (upstream lockfile, no scripts)
cd ../../vendor/prime && npm ci --ignore-scripts

# bundle to dist/runner.mjs — the single artifact verifyArtifact hashes
node scripts/build.mjs

# wire-level smoke: spawn the artifact, emulate the host, prompt → end_turn
node scripts/smoke-host.mjs

# re-verify / regenerate vendor/prime/MANIFEST.json
node scripts/vendor-manifest.mjs --check
```

`dist/` is intentionally gitignored — the artifact is produced by the image
build that assembles the container rootfs.

## Host side

`packages/agent-execution/src/controlPlane/primeEmbeddedRuntime.ts` is the
`ExecutionRuntime` that drives this runner under
`DockerProcessTreeSupervisor` (authorize → verifyArtifact → launch →
verifiedIsolation → connect → init handshake → re-authorize → register).
`HarnessTransport`/`HarnessChannel` in `harnessTransport.ts` is the generalized
bounded transport; `primeStdioTransport` keeps the ACP vocabulary.

## Deferred (phases 3–6)

- `SqlTrustedProviderBackend` binding resolution behind `broker.infer` (the
  host seam is typed — `inferenceBroker` + `buildInferenceRequest` on
  `PrimeEmbeddedRuntimeOptions` — and phase-1 default fills
  `bindingRevision: 0` with the session fence attached host-side).
- `resume` (stays `'none'`/`unsupported_capability`), richer message
  projection (media/tool calls), multi-session, usage accounting.
