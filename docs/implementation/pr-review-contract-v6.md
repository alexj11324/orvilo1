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

| Field             | Meaning                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `observedHeadSha` | Required. The head the reviewer actually saw — writes bind to it.   |
| `snapshotId`      | The detail snapshot being written against.                          |
| `operationId`     | Idempotency key. Same operation + same payload replays the receipt. |
| `reviewSessionId` | `submitReview` only — adopts an existing pending draft explicitly.  |

Server behavior:

- Re-verifies identity (`viewer.login`), repo permission
  (`repository.viewerPermission`), PR existence, thread→PR binding, head, and
  snapshot digest on every write.
- Head moved since `observedHeadSha` → `HEAD_DRIFTED`; snapshot digest
  mismatch → `STALE_SNAPSHOT`; a pending draft the client didn't adopt →
  `PENDING_REVIEW_CONFLICT`; same `operationId` with a different payload →
  `OPERATION_CONFLICT`.
- `submitReview` without a pending draft creates an Orvilo-owned pending
  review pinned to `commitOID: observedHeadSha` and submits exactly that
  review id — never whatever pending review happens to exist.
- A null/empty remote payload is `REMOTE_EMPTY`, not success: clients must
  not toast success or clear drafts. Before failing an adopted session the
  server reconciles the viewer's submitted reviews (`reviews(author:)` +
  `commit.oid`) — a matching landed review returns a `reconciled` receipt.
- Receipts are `ReviewWriteReceipt<T>`: `{ appliedHeadSha, data, digest,
reconciled }` — the head the write actually landed on.

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
`OPERATION_CONFLICT` → `CONFLICT`, `REMOTE_EMPTY` / `PROVIDER_ERROR` →
`INTERNAL_SERVER_ERROR`. Domain codes are prefixed into the message
(`CODE: message`) so clients can react to conflicts without parsing prose.

## GraphQL schema validity

Every document in `queries.ts` is validated at test time against the
committed GitHub schema fixture (`__fixtures__/github-schema.graphql`,
sha256-pinned — regenerate from `docs.github.com/public/fpt/schema.docs.graphql`
and update the hash together). CI never fetches the schema live.

## Verification

`bunx vitest run apps/server/src/services/pullRequestReview` covers the
schema contract, the four pending-review states, pagination completeness,
null-receipt rejection, stale-head gating, operation replay/conflict, host
whitelisting, and thread binding.
