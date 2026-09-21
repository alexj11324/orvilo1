# PR Review contract (v6 repair)

The Reviews surface (`/reviews`, `/reviews/:id`) talks to GitHub through
`apps/server/src/services/pullRequestReview`. This document is the contract a
client may rely on — every field below is enforced by tests under
`apps/server/src/services/pullRequestReview/`.

## Reads

### Queue — `pullRequest.queue`

`{ items, loaded, total, hasMore, endCursor, completeness }`. A disconnected
GitHub account is a `PRECONDITION_FAILED` error, never an empty list.

### Detail — `pullRequest.detail`

Returns the pull request plus per-collection first pages:

- `files`, `threads`, `reviews`, `checks.items`, and each thread's `comments`
  are all `PullRequestCollection<T>` — `items` + `loaded`/`total`/`hasMore`/
  `endCursor`/`completeness`. `completeness` is `'complete'` only when every
  item was loaded; partial collections must never render as fully reviewed.
- `checks.summary` is the aggregated rollup state: `passed`, `failing`,
  `pending`, `unknown`, or `partial`. Queued/running checks are `pending`,
  never green; legacy StatusContext `FAILURE`/`ERROR` count as failing.
- `snapshotId` fingerprints the loaded conversation (PR id, head, file names,
  thread ids, review ids). Every write must echo it back.
- `reviewSession` reports the viewer's GitHub pending-review draft
  (`pendingReviewId`, `pendingReviewCreatedAt`) when one exists.
- `rateLimit` surfaces the vendor's remaining budget from the last response.

### Paging — `pullRequest.page`

Loads the next page of a single collection (`files | threads | reviews |
comments | checks`). Every page re-reads the PR head; when it moved since the
snapshot the response carries `stale: true` and the client must reload instead
of appending. `comments` additionally requires `threadId`.

## Writes

`addFileComment`, `replyToThread`, and `submitReview` share the write contract:

| Field             | Meaning                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| `observedHeadSha` | Required. The head the reviewer actually saw — writes bind to it.          |
| `snapshotId`      | The detail snapshot being written against.                                 |
| `operationId`     | Idempotency key. Same operation + same payload replays the stored receipt. |
| `reviewSessionId` | `submitReview` only — adopts an existing pending draft explicitly.         |

Server behavior:

- Re-verifies identity (`viewer.login` + `viewer.databaseId`), repo permission
  (`repository.viewerPermission`), PR existence, thread→PR binding, head, and
  snapshot digest on every write.
- Writes are claimed, not just deduped. After authorization and caller-error
  gates (head drift, snapshot, pending-review, thread binding), the service
  atomically inserts a `prepared` claim row keyed by the full operation
  identity + payload digest — before any remote mutation runs. Only the
  claim winner dispatches; concurrent same-`operationId` callers read the
  in-flight or terminal claim and never re-dispatch, and a digest mismatch
  on an existing key is `OPERATION_CONFLICT` before any remote call. No
  database lock is held across the network call — progress is recorded via
  conditional status transitions (`prepared` → `dispatched` → `applied` /
  `outcome_unknown`).
- Claims persist in `pull_request_review_receipts`, keyed by
  `(userId, workspaceId, connectionId, repoId, pullRequestId, operation,
operationId)` — a single insert-on-conflict write, so they survive restarts
  and concurrent dupes converge on one row. A replayed `operationId`
  re-authorizes against the live context (permission + connection binding)
  before the stored outcome is returned; a binding change is
  `OPERATION_CONFLICT`. `operationId` is required on every write.
- `remote_id` records the known remote object for the operation as soon as
  it exists — the review node id for submits, the comment/thread id for
  comments. Blocked or crashed claims reconcile by reading exactly that
  object via `node(id)` (verified against the routed PR and viewer login),
  never by searching author+body+head, so identical empty approvals cannot
  cross-match. A crash between remote success and receipt persist leaves a
  `dispatched` row whose `remote_id` is reconciled on the next call — no
  new remote write.
- Head moved since `observedHeadSha` → `HEAD_DRIFTED`; snapshot digest
  mismatch → `STALE_SNAPSHOT`; a pending draft the client didn't adopt →
  `PENDING_REVIEW_CONFLICT`; same `operationId` with a different payload →
  `OPERATION_CONFLICT`.
- `submitReview` without a pending draft creates an Orvilo-owned pending
  review pinned to `commitOID: observedHeadSha` and submits exactly that
  review id — never whatever pending review happens to exist. The payload
  digest covers `reviewSessionId`, so adopting a different session under a
  reused id conflicts.
- Receipts only record head SHAs GitHub actually returned. When a mutation
  response omits `commit`, the server re-reads the review object via
  `node(id)`; when the remote outcome still cannot be verified, the claim
  row is persisted with status `outcome_unknown` and the call fails as
  `OUTCOME_UNKNOWN` — the client keeps its draft, and a replay reconciles
  the persisted `remote_id` (a still-PENDING adopted session is resumed on
  that exact review, not re-submitted) instead of re-applying the write.
- Receipts are `ReviewWriteReceipt<T>`: `{ appliedHeadSha, data, digest,
reconciled }` — the head the write actually landed on.

Client-side, every write's `operationId` is derived from the intent —
`reviewOperationId` hashes (workspace, PR, head, snapshot, viewer, session,
action, anchor, body) — so a retry of the same intent replays the same
operation across failures and refreshes, and a changed intent is a fresh
operation rather than a conflict. `OUTCOME_UNKNOWN` keeps the draft and
surfaces an explicit recoverable state that reconciles before resending.
Pagination tails live in a pager bound to `(workspace, PR, snapshotId, head,
viewer)`: a generation change clears tails + cursors synchronously and
in-flight responses from the old generation are dropped; writes stay
disabled until a complete new snapshot lands.

### Thread binding

`replyToThread` and `comments` paging resolve the thread via `node(id)` and
require `node.pullRequest.number` + `node.repository.nameWithOwner` to match
the routed pull request — a thread from another PR cannot be written under a
readable PR (`THREAD_MISMATCH`).

### Capability boundary

Reads authenticate with the caller's personal GitHub OAuth connection. Writes
additionally require an active workspace (`reviewWriteProcedure`) — review
publication is a workspace-capability operation, not a personal-mode action.
Host parsing is whitelisted to `github.com`; other hosts are rejected as
`INVALID_REVIEW_ID`.

## Error surface

Service error codes map to tRPC codes: `GITHUB_NOT_CONNECTED` →
`PRECONDITION_FAILED`, `NOT_FOUND` → `NOT_FOUND`, `INVALID_REVIEW_ID` /
`THREAD_MISMATCH` → `BAD_REQUEST`, `PERMISSION_DENIED` → `FORBIDDEN`,
`HEAD_DRIFTED` / `STALE_SNAPSHOT` / `PENDING_REVIEW_CONFLICT` /
`OPERATION_CONFLICT` / `OUTCOME_UNKNOWN` → `CONFLICT`, `REMOTE_EMPTY` /
`PROVIDER_ERROR` → `INTERNAL_SERVER_ERROR`. Domain codes are prefixed into the
message (`CODE: message`) so clients can react to conflicts without parsing
prose.

## GraphQL schema validity

Every document in `queries.ts` is validated at test time against the
committed GitHub schema fixture (`__fixtures__/github-schema.graphql`,
sha256-pinned — regenerate from `docs.github.com/public/fpt/schema.docs.graphql`
and update the hash together). CI never fetches the schema live.

## Verification

`bunx vitest run apps/server/src/services/pullRequestReview` covers the
schema contract, the four pending-review states, pagination completeness,
stale-head gating, claim replay/re-authorization/conflict, concurrent
same-operationId dispatch dedup (one remote write), digest-mismatch
rejection before any remote call, crash-restart reconciliation by persisted
`remote_id`, commit-absent remote re-read, outcome-unknown persistence
without head fabrication, host whitelisting, and thread binding.
`packages/database` model tests cover the claim store's atomicity and scope
isolation; `src/features/Reviews` covers the intent-derived operation ids
and the generation-bound pager.
