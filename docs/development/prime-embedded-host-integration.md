# Prime embedded harness — host integration (phase 4)

Status: implemented on `feat/prime-embedded-host` (stacked on
`feat/prime-embedded-broker`). Design context:
`prime-embedded-harness-design.md` §3 + §6 phase 4.

Phase 4 teaches `CanonicalCoreRuntimeHost` to compose and launch the embedded
runtime in place of the ACP adapter for `type:'orvilo'` runs, keeping every
guarantee the supervisor evidence model already provides. Dispatch routing —
actually selecting this path for `type:'orvilo'` runs — is phase 5; the option
exists but nothing flips it on yet.

## 1. Runtime option swap — `coreRuntimeHost.ts`

`CanonicalCoreHostOptions.embedded?: EmbeddedRuntimeComposition` — presence is
the opt-in. Absent keeps the ACP path (`PrimeExecutionRuntime` +
`PrimeStdioTransport` + image-digest `verifyArtifact`) that third-party agents
use, unchanged.

`EmbeddedRuntimeComposition` is everything `createEmbeddedInferenceBridge`
needs except the canonical binding/database the host already owns, plus:

- `artifact`: the runner bundle (`packages/prime-harness/dist/runner.mjs`)
- `verifyArtifact`: the trusted embedded-artifact check (see §2)
- `args`: runner argv, defaults to `[artifact]`

Composition:

```
open(): journal resolve → recovery check
        → embedded && !recovering: createEmbeddedInferenceBridge
            (resolveOrviloProviderBinding → issueBindingExecution →
             backend.capabilities → pin {bindingId, revision, modelRoute})
        → ctor builds PrimeEmbeddedRuntime
            (HarnessTransport on supervisor.connect streams)
start():  withRegistration row locks → issueBindingExecution(tx, claim)
          re-verified → registering + no tree → runtime.start → activate
```

The constructor lifts the ACP-only closures into shared seams (`authorize`,
`supervisedLaunch`, `supervisedStreams`) so both runtimes get identical
isolation persistence and fence re-verification; only the transport differs —
`HarnessTransport` (harness protocol) vs `PrimeStdioTransport` (ACP). The
`runtime` field is now typed `ExecutionRuntime`, and `verifyArtifact` becomes
`PrimeRuntimeOptions['verifyArtifact'] | undefined` — required for ACP (open()
throws without it), supplied per-run as `embedded.verifyArtifact` for the
embedded path. A `supervisor?: (options) => HostSupervisorPort` seam lets
tests substitute the tree port without a Docker daemon; production keeps
`DockerProcessTreeSupervisor`.

## 2. Artifact / image verification

Two forms, one pin (`PRIME_EMBEDDED_PIN` = commit `7d442aa…`, `0.9.8`, MIT):

- **Bundle manifest (works everywhere).** `packages/prime-harness/scripts/
build.mjs` now emits `dist/runner.manifest.json` next to `dist/runner.mjs`:
  `{artifact, bytes, sha256, prime:{commit,version,license}, schemaVersion:1}`.
  The upstream provenance is read from `vendor/prime/MANIFEST.json` — the
  single source of vendored truth — so the manifest can only attest the
  pinned upstream. `embeddedArtifactVerifier(manifest)` (new
  `packages/agent-execution/src/controlPlane/primeEmbeddedArtifact.ts`,
  exported via `controlPlane/server`) re-hashes the artifact, checks digest +
  byte length, and requires `manifest.prime` to equal the pin fields. A
  tampered bundle, drifted manifest, or unreadable artifact denies launch.
- **Supervised image (production path).** `packages/prime-harness/Dockerfile`
  builds the runner image on the same pinned `node:22-bookworm-slim@sha256:…`
  base as the ACP image, copies `runner.mjs` + `runner.manifest.json` to
  `/opt/orvilo/prime-harness/`, and stamps labels mirroring the prime-agent
  convention: `orvilo.prime.commit`, `orvilo.prime.version`, and
  `orvilo.prime-harness.bundle.sha256` (a required build arg). Under Docker the
  supervisor's `imageId` sha256 pin is the artifact pin, exactly like
  prime-agent; the labels let a host-side `docker image inspect` confirm
  provenance before launch.

Remaining for CI: build `runner.mjs` (`cd packages/prime-harness && node
scripts/build.mjs`), read the manifest sha, `docker build --build-arg
HARNESS_BUNDLE_SHA256=<sha>` the image, and pin its digest into the
environment that sets `embedded.artifact`/`docker.imageId`. This repo env has
no Docker daemon, so the image path is recipe + label plumbing; the manifest
verify path is proven end-to-end against a locally built bundle in
`coreRuntimeHost.embedded.test.ts`.

## 3. Drain/recovery parity

An embedded tree goes through the identical quiescence path as ACP:
`supervisor.terminate` → host `drainActions(treeId)` → `journal.stopping`
latch → `registration.stop` (50×100 ms row-lock retries) → receipt scan for
non-verified/failed actions → `QuiescenceProof`. On host restart, `open()`
reads the journal into `recovering` mode — `start()` refuses, `authorize` is
closed, and `recoverStop()` terminates the journaled (or supervisor-recovered)
tree through the same drain path.

One deliberate asymmetry: a recovered host does **not** compose the inference
bridge — a restart must still be able to drain when the provider binding was
revoked while the tree was orphaned. `recovering` hosts therefore carry no
bridge and can never launch. Proven in `coreRuntimeHost.embedded.test.ts`:
host 1 activates, dies mid-session; host 2 opens in recovery, performs zero
binding resolutions, refuses `start()`, and `recoverStop()` returns
`pendingActions: 0, remainingProcesses: 0` with control `stopped` and the
dispatch fenced `cancel_requested` — no resurrected session.

## 4. provider_bindings → fence wiring

Composition pins `{bindingId, revision, modelRoute}` exactly once (`open()`),
stamping `HarnessInitModel` from the granted route so the runner's
`broker.infer` requests carry a route the issued binding actually permits. The
run's fence stays host-attached: `buildInferenceRequest` injects
`session.fence` on every `broker.infer`, never from payload.

The gap closed in this phase: `EmbeddedInferenceBridge` now carries the
composition-time `claim`, and `start()` re-verifies it with
`issueBindingExecution(tx, claim)` **inside** the `withRegistration` row locks
— before `runtime.start` ever asks the supervisor to launch. A binding
disabled or bumped between `open()` and `start()` returns `unauthorized` with
zero verifyArtifact/launch work, and the registration stays `registering`.
Post-launch drift stays covered by the phase-3 per-event re-issue in
`authority.resolve`.

## 5. Tests

`apps/server/src/services/controlPlane/coreRuntimeHost.embedded.test.ts` (8
tests, wire-level supervised-tree double over ndjson JSON-RPC PassThroughs —
the same frames container stdio carries):

- composition ON: `harness.init` (not `initialize`/`session/new`), model id +
  pin echo asserted, launch argv = `[node, artifact]`
- composition OFF: ACP handshake unchanged
- ordering: `verifyArtifact → launch → harness.init → register(running)`
- tampered bundle and drifted manifest both deny before launch
- restart recovery drains the orphan, no re-resolution, no relaunch,
  dispatch fenced
- mid-compose binding bump → `unauthorized` before any launch work
- no resolvable binding → `open()` throws before any supervisor work

## 6. Remaining

- Phase 5: route `type:'orvilo'` dispatch to this option; reconcile with the
  P30 provider-settings stack (another session owns those files).
- Phase 6: acceptance wiring — real image build + supervised embedded run in
  the acceptance env.

Reviewer note: `resolveOrviloProviderBinding`/`issueBindingExecution` on this
stack duplicate the #367 byok-execution-chain versions; reconciliation is
deferred to merge order.
