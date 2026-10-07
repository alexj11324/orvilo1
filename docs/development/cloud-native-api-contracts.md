# Native client cloud API contracts

The native task board sends an attention group alongside ordinary workflow or legacy
status groups. `task.groupList` accepts the existing `TaskAttentionReason` vocabulary
in `groups[].attentionReasons`, in addition to `statuses` and `workflowCategories`.
Every group must supply at least one nonempty membership criterion.

An attention group matches its requested reasons. Ordinary groups exclude all
reasons requested by the attention groups in the same request, so a pending input
card is counted and rendered once. Counts and paginated rows use the same membership
and existing readable-task predicates. Owner privacy, workspace access and the
existing visibility projection continue to govern the query.

`attentionReason` is derived from durable current-run question obligations first,
then the existing execution parked reason, otherwise `none`. A resolved native
question remains `needs_input` until the producer acknowledges it. A runtime
question remains unresolved until its continuation starts. Historical topic or
execution-generation questions do not become obligations of the current run.
Terminal but unacknowledged current-run questions remain durable obligations until
producer acknowledgment, continuation, or current-run supersession.

## Migration and verification

The forward migration adds only `has_task_unresolved_input` with `CREATE OR REPLACE
FUNCTION`. It uses columns already present before this change. It does not change
completion triggers, executor ownership, tables or access policy.

The repository's Test Database GitHub Actions job runs the journal against a
disposable PostgreSQL service through the existing `getTestDB` migration path.
Focused model tests exercise actual task, topic, operation and question rows to
check acknowledgment, attention membership, exclusion, counts and pagination.
Local PGlite results prove those SQL outcomes in the test engine; PostgreSQL CI
results prove the delivered migration and query on PostgreSQL. Neither establishes
that a cloud deployment or native product interaction has occurred.

Deployment uses the existing GitHub Actions workflow at the delivered commit. The
workflow pins its image digest, waits for migration success, and then starts the
worker. Native acceptance must separately record the deployed backend revision
and the local renderer revision and exercise the affected populated cloud board.
