# Prime embedded harness — dispatch routing (phase 5a)

Status: implemented on `feat/prime-embedded-dispatch` (stacked on
`feat/prime-embedded-host`). Design context: phase 5 (first half) of the
embedded-harness plan; the composition contract is
`prime-embedded-host-integration.md`.

Phase 5a routes own-agent task runs — the runs `resolveExecutionBinding`
discriminates as `heteroType: 'orvilo'` — to `CanonicalCoreRuntimeHost` +
`createEmbeddedInferenceBridge` instead of the cloud ACP-sandbox path.
Third-party ACP/hetero agents keep the existing path byte-identical.

## 1. Where the seam lives

The production run path is
`TaskRunnerService.runTask` → `taskDispatch.prepare` →
`dispatch.transition(phase:'dispatched')` → `AiAgentService.execAgent` →
`setupTurn` → `resolveExecutionBinding` → `dispatchHeteroAgent`. For an
own-agent run without an explicit hetero provider, `resolveExecutionBinding`
synthesizes `heterogeneousProvider { type: 'orvilo' }` and `heteroType: 'orvilo'` — that discriminator is what the
seam matches; ACP hetero kinds never satisfy it.

Inside `dispatchHeteroAgent`'s sandbox-plan `else` branch, **before**
`supportsCloudHeterogeneousSandbox`, `resolveEmbeddedDispatchRoute` admits a
run only when all of these hold:

- `heteroType === 'orvilo'` (checked first — hetero kinds short-circuit),
- a canonical task-dispatch context exists (`operationTaskId`, string
  `dispatchId`, numeric `dispatchFence` + `executionGeneration` from the
  dispatch lease's `appContext`) — chat runs carry none.

Anything else falls through to the unchanged sandbox path below the seam.

## 2. No gate

There is no feature flag. `orvilo` is Orvilo's own engine: a task that
selects it runs the embedded Prime harness the same way a task that selects
`codex` runs the codex CLI — per-task choice, not a deployment toggle. (The
`prime_embedded_dispatch` flag that shipped this seam dark was removed; see
the acceptance doc's deploy-readiness checklist for rollout prerequisites.)

## 3. Composition — `openEmbeddedDispatchHost`

On admission, `openEmbeddedDispatchHost` (server-side,
`apps/server/src/services/controlPlane/embeddedDispatch.ts`) builds
`EmbeddedDispatchHost { binding, directories, host, initModelId }`:

1. **Run contract.** Task read (`stale_fence` when deleted/gone) →
   `TaskDispatchModel.findById` verified against taskId/operationId/fence/
   generation/agentId/policyRevision — the same contract the sandbox path's
   dispatch lease asserts.
2. **Grant.** Reuse the `taskTopics.executionGrantId`/`executionEpoch` a
   delegated dispatch already bound; otherwise mint a bounded run grant
   (`createGrant`, 6h TTL) + `claimExecutionEpoch`. `registration.register`
   has not run yet, so the epoch claim's no-runtime guard still passes.
3. **Artifact + image.** `runner.manifest.json` beside the pinned
   `packages/prime-harness/dist/runner.mjs`, `isEmbeddedArtifactManifest`
   re-validated; `imageId` explicit or `ORVILO_PRIME_EMBEDDED_IMAGE_ID`
   (`policy_denied` when absent).
4. **Binding → initModel.** `resolveOrviloProviderBinding(db, userId,
engine, 'sandbox', { model, provider })` — the new `match` filter pins the
   task's `ctx.model`/`ctx.provider` selection, so a task configured for
   provider X resolves binding X; `issueBindingExecution` re-verifies the
   issued row read-only; `backend.capabilities` must cover the issued
   `modelRoutes[0]` with `text`. Failure at any step → `unauthorized` /
   `unsupported_capability` / `stale_fence` and the run finalizes `error`
   **before launch** — there is no env-key fallback.
5. **Compose.** `CanonicalCoreRuntimeHost.open` with
   `embedded: { artifact, backend, engine, resolveBinding, target:'sandbox',
verifyArtifact: embeddedArtifactVerifier(manifest) }` plus the supervisor/
   docker options. The test seam `EmbeddedDispatchEnvironment` substitutes
   supervisor/backend/artifact/dirs without a Docker daemon.

## 4. Drive — `driveEmbeddedCanonicalRun`

The driver runs the turn through the canonical host and the shared hetero
surface, keeping `runTask`'s result contract unchanged:

- `host.start()` (registration locks + `issueBindingExecution` re-verify +
  launch) failure → `heteroFinish` `error`.
- `host.prompt(...)` RuntimeEvents → `heteroIngest`: `stream_start`
  (`{model: initModelId, provider:'orvilo'}`), text → `stream_chunk`, usage →
  `step_complete`, `turn-ended{cancelled}` → `cancelled`, `error` →
  `finishError` + emit.
- Then `heteroFinish` (`done`) and `host.shutdown()`. Order matters:
  `registration.stop` requires `phase==='running'` + the original fence —
  after `heteroFinish` settles the op the drain's stop is expected to miss
  (post-settle/post-cancel `not_quiescent`), which the driver logs and
  tolerates.
- Admission records `channel: 'embedded'` (new `RemoteRunChannel` member) so
  status/cancel flows see the server-hosted run without device fields.

Stop parity comes free from the bridge: every `broker.infer` call and every
streamed `broker.event` re-runs `CanonicalRunAuthority.withRun`, so a
`requestStop` (fence+1, `cancel_requested`) denies the in-flight inference
mid-stream; the runner sees a broker `error` event, the runtime reports the
turn `error`, and the driver settles through the same `heteroFinish` path.

## 5. Deferred

- **Phase 5b** (on `feat/restore-provider-p30`, not this branch): repoint
  restored provider-UI writes to `provider_bindings`; retire
  `streamingExecutor` from the cloud path.
- **Phase 6** (acceptance): end-to-end in a live env (real Docker
  supervisor + runner image); orvilo **chat** runs deliberately do not route
  here yet — the seam requires the canonical task-dispatch context, so only
  task dispatches admit.
