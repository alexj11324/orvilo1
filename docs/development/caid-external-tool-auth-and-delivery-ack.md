# External tool authorization & child-result delivery ACK (SA02/SA04)

Follow-up remediation for findings F04/F05 (external tool authorization
contract) and F06 (child-result delivery semantics) on the ACP path.

## SA02 — tool authorization gate (F04)

Every external call through `execAcpExternalTool` now passes a unified
authorization step before `ToolExecutionService.executeTool` runs:

- **One-time approval receipt.** `needs_approval` connectors (and
  manifest-declared `humanIntervention` on installed plugins) look up or
  create a receipt event on `event_outbox` keyed by
  `tool-approval:{operationId}:{toolCallId}` and bound to
  principal/workspace/operation/generation/toolCallId/connectorId/argsHash/
  deadline. `authorizeToolApprovalReceipt` consume-marks the receipt exactly
  once; absent/denied/expired/args-mismatched receipts refuse with zero
  network side effects (`mcp.callTool` never runs). Decision payloads write
  via `recordToolApprovalDecision` with a `decision IS NULL` CAS so a second
  submit can never flip a settled receipt; expiry renews into a fresh pending
  window rather than silently reopening.
- **Canonical approval scope.** The receipt payload stores `scopeHash` =
  `toolApprovalScopeHash` — a sha256 over a canonical `ToolApprovalScope`
  (principal/workspace/operation/generation/toolCallId/tool
  identifier+apiName/pinned connectorId/authRevision/schemaDigest/argsHash/
  windowId). The consume `UPDATE … WHERE` matches the full hash, so two
  mounted tools sharing `toolCallId` + args can never cross-consume: tool B
  cannot spend tool A's approval. Execution also dedupes on the stable
  `invocationId` (`consumedInvocationId`) — not just on approval
  consumption. Receipts persisted before this contract (no `scopeHash`/
  `windowId`) fail closed: the caller re-pends a fresh window instead of
  upgrading a weak record.
- **Consume-CAS is the only authorization.** `authorizeToolApprovalReceipt`
  is a bounded CAS loop: read-back states (pending/denied/expired/consumed)
  produce refusal/wait/retry reasons only; an observed `approved` row
  re-enters the consume CAS, and only the caller that wins it returns
  executable authorization. An approval that lands between a failed CAS and
  a read-back can no longer leak through unconsumed.
- **Window rotation + grant epoch.** Every renew mints a new `windowId` and
  bumps `windowVersion`; decision submits carry `expectedWindowId` and
  CAS-match it (windowless submits decide only legacy windowless receipts),
  so an expired-window card never decides a new window, and
  denied/consumed receipts cannot be resurrected. Connectors carry
  `metadata.grantEpoch` rotated on OAuth callback / credential update /
  create — token refresh keeps it, so re-auth to a different account or
  scope refuses the old pin even when URL/clientId are unchanged. All
  approval entries (`submitHeteroIntervention`, conversation control, CLI)
  write the same receipt decision before notifying the host; a critical
  receipt write failure no longer reports success.
- **Headless is not auto-approve.** When `appContext.interventionApprovalMode`
  is `headless` (or no intervention path exists), the gate returns
  `acp_tool_approval_unavailable` — the call refuses/pends instead of
  executing.
- **Connector identity pinning.** `resolveExternalToolSurface` records pins on
  `metadata.externalTools[identifier].pins`: `connectorId`,
  `authRevision` (hash of the connection's auth-bearing fields), per-api
  `schemaDigests`, and for plugins an install-generation fingerprint
  (`pluginInstallId` = sha256 over the row's `createdAt`/`updatedAt`, since
  `user_installed_plugins` has a composite PK and no `id`). At exec time the
  pinned `connectorId` loads via `findById`; `resolveByIdentifiers` is a
  legacy fallback only when no pin exists. Disabled/drifted/re-substituted
  identities refuse — a same-identifier row never replaces the authorized
  connection.
- Host-facing surface: `heteroSubmitIntervention` records approve/deny onto
  the receipt; the CLI/extras caller exposes `requestApproval`
  (permission card) and retries once after a `acp_tool_approval_pending`.

## SA02 — exclusive surface is a ceiling (F05)

`resolveRunToolSurface` models `allowed` (exclusive set when present),
`required` (explicit `requiredToolIds`), and `requested` (allowed ∪
default set) separately:

- `required ⊄ allowed` → contract conflict thrown before any mount — the
  exclusive list is never widened to satisfy a requirement.
- Exclusive entries are a ceiling, not a must-have list: an exclusive
  identifier that fails to mount only fails the task when it is also
  required.
- Required tools must reach a mounted/callable state before dispatch —
  specPrepared is not hostConfirmed; a required tool resolving to
  `unsupported`/`unauthorized`/`failed` aborts the task.

## SA04 — child-result delivery ACK (F06)

- **Delivery ledger states.** `persistChildResultDelivery` writes an
  `event_outbox` receipt with `deliveryState` transitions
  `received → offered → acked` (`superseded` on revocation). The write
  carries a fixed `deadlineAt` (`nextAttemptAt`); a failed outbox write
  propagates instead of reporting reliable delivery (D03).
- **Parent-side durable ACK.** The v2 await contract returns `deliveries[]`
  (eventId + child result handle); only `heteroAckChildResultDeliveries`
  → `ackDeliveryReceiptByEventId({aggregateId: parentOperationId})` marks a
  result consumed, so a committed result is re-playable after a parent crash
  or a lost response (D02). Scoping acks by the parent's aggregate id blocks
  cross-operation backfill (D06). The settle reports each delivery's true
  receipt state via `getDeliveryReceiptState`, and the host treats a
  CAS-missed already-`acked` row as idempotent success — `superseded`,
  foreign and missing rows stay `ignored`.
- **Inbox before ACK, stable invocation.** The host settles under a stable
  toolCallId — the adapter's `claudecode/toolUseId` `_meta` when present,
  else `mcp_<sha256(stableStringify({apiName,args,identifier,operationId}))>`
  — so a crash reuses the original invocation instead of minting a new id.
  Before ACKing, `persistChildResultInbox` durably records the results
  (CLI: `~/.orvilo/inbox/<operationId>.jsonl`, deduped by eventId, carrying
  a `resultHash`); an inbox write failure aborts with an error — nothing is
  acked. ACK drops and `ignored` responses re-poll until the host deadline
  rather than claiming reliable consumption.
- **One authoritative deadline.** First admission CAS-writes a single
  `await-anchor:{op}:{toolCallId}` receipt carrying `awaitDeadlineAt`; the
  message anchor (`pluginState.awaitDeadlineAt`) is only a projection of
  it. A reconnect or a newly-appearing anchor reads the same deadline — a
  no-anchor accept followed by a late anchor never re-initializes from
  `now + budget`. Read/write failure on the authority row is an explicit
  error, not unbounded pending. `serverNow >= deadlineAt` is the only
  expiry. Child deadline and parent wait budget are independent.
- **Version negotiation.** `contractVersion` is negotiated by capability:
  the host sends `2` only when it implements `ackChildResults`, else `1`.
  A v2 settle on a host without ack capability fails explicitly; a
  v1-shaped settle is never treated as v2. The server normalizes unknown
  versions to v1 — no breaking change is claimed from optionality alone.
