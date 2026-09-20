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
  cross-operation backfill (D06).
- **Fixed deadline.** At first accept the server stamps
  `pluginState.awaitDeadlineAt` (+ owner/started markers) once; later polls
  read, never extend or shorten it, and `serverNow >= deadlineAt` is the only
  expiry. Hosts awaiting before a placeholder anchor exists get a keyed
  `await-anchor:{op}:{toolCallId}` receipt so the wait still cannot pend
  forever. Child deadline and parent wait budget are independent.
- **Version negotiation.** `contractVersion: 1` preserves legacy
  `delivered: true` semantics for old hosts; `contractVersion: 2` enables the
  receipt/ack flow. The server normalizes unknown versions to v1 — no
  breaking change is claimed from optionality alone.
