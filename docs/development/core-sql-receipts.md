# SQL action receipt persistence

`SqlDurableReceiptStore` implements the existing `DurableReceiptStore` port used by `createActionGateway`. It is a trusted server-side persistence adapter, not action authority or a task runner.

A single PostgreSQL upsert reserves the gateway's namespaced key and returns the committed winner. Each reservation uses a new random ownership token; no `xmax` interpretation is required. Losing instances cannot save, and successful instances must match the durable token on every update. SQL compares all immutable receipt fields, including the full fence and request digest, and allows only progress from prepared to applied/failed/unknown or applied to verified/failed/unknown. Terminal receipts cannot be rewritten.

Ownership never expires. After a process dies, prepared, applied and outcome-unknown receipts remain blocked from automatic effect replay. A verified receipt can be returned through the gateway after a fresh authorization check. This is a historical verification receipt, not a claim that the file's current bytes still match after independent later edits. Operator reconciliation for ambiguous effects is not implemented by this adapter.

`ACTION_RECEIPT_SCHEMA_SQL` is proposed DDL, explicitly executed only in disposable tests. No numbered migration, production database installation, task authority mapping or production runtime registration is included. The application must supply its trusted PostgreSQL connection and canonical action admission before enabling the gateway in production; the database connection and ownership tokens must not be exposed to the kernel.

## Linux evidence

From `packages/agent-execution`, the owning-package command:

```
node ../../node_modules/vitest/vitest.mjs run src/controlPlane/sqlReceiptStore.test.ts --silent=passed-only
```

passed 7 tests in 6.56 seconds. These use actual disk-backed PGlite SQL, database close/reopen, eight concurrent reservation attempts, losing-instance and durable-token fences, immutable identity and invalid transition rejection, and retained ambiguous statuses. The integrated test executes `createActionGateway` with the concrete file executor and `ScopedFileWriter`, verifies actual file bytes, reopens the database and file capability, proves verified replay does not overwrite a later edit, and rejects replay after grant revocation.

The integrated test's authority and isolation snapshots are explicitly fixtures. These results prove SQL receipt persistence and real file effects; they do not prove canonical task authority, OS process-tree isolation, live Prime execution, or production deployment. ESLint passes for the adapter and test without warnings.
