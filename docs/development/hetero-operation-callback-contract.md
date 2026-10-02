# Heterogeneous operation callback contract (ingest/finish acks)

`heteroIngest` and `heteroFinish` authenticate via
`authorizeOperationCallback`, which delegates to
`resolveActiveHeteroOperationPrincipal` when the caller presents an
operation-scoped OIDC credential. Principal resolution fails in order:

scope/claims → user active → operation-row ownership → **operation still
`running`** → workspace membership → RBAC.

## Duplicate-delivery semantics

The `status !== 'running'` guard maps to `CONFLICT` (409). Past the scope
check that code is unambiguous: the operation has already settled — a
duplicate or late delivery, not an authorization failure. Both mutations
therefore translate `CONFLICT` into `{ ack: true }`:

- **heteroFinish**: `completeOperation` settles the durable row before the
  completion hook is delivered (see `CompletionLifecycle`). A transient
  delivery failure surfaces as a producer-facing error on the _first_ call,
  and any retry would otherwise collide with the now-settled row. The
  first-wins outcome is already persisted, so an ack is the only correct
  answer — a bounded producer retry (e.g. `TrpcIngestSink.finish`) must not
  report a successful run as failed.
- **heteroIngest**: batches landing after settle are dropped by the service
  anyway; a late duplicate is likewise a no-op ack.

Other principal errors keep their status → code mapping (401 →
`UNAUTHORIZED`, otherwise `FORBIDDEN`) and still surface to the caller.

## Known gap (not yet fixed)

Serialized `_hooks` in `agent_operations.metadata` are redelivered only
while the settling process lives: `shouldRetainHooksForRetry` keeps the
in-memory registration for queue retry / provider redelivery, but a crash
between `persistCompletion` and a failed synchronous delivery leaves no
sweeper-driven replay. Revisit if hook-loss window matters at production
load.
