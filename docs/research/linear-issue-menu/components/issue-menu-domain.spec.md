# Issue menu domain contract

## Evidence and scope

- Live inventory: `/private/tmp/orvilo-issue-ui-runtime/linear-issue-menu-live.json`.
- Documented behavior: `/private/tmp/orvilo-issue-ui-runtime/linear-issue-menu-official-research.md`.
- Exact Make a Copy / Convert child form layouts were not collected; backend uses explicit inputs rather than inferred hidden values.
- Existing Team, Due date, relation removal, clipboard, favorite, reminders and Delete retain their owning APIs.

## New persistence

- Add link and Add pull request attach independent resources to the issue; neither rewrites its description or execution delivery.
- URLs accept HTTP(S), no embedded credentials, no server fetch or GitHub mutation.
- Resource reads/mutations inherit the issue's current task ACL and workspace scope.
- Add document reuses task_documents with document ACL/scope checks at attachment and content reads; shared tasks cannot publish private document contents.
- Description history records exact instruction/editorData snapshots at TaskModel.update, in the same transaction as the edit.
- First edit captures its prior contents as a baseline at capture time. Older edit history is unavailable and not reconstructed.
- Restore reads a scoped historical row and writes through the same common boundary, with expectedDomainRevision CAS.
- Snapshot rows retain capture-time visibility, so sharing an issue cannot expose former private description history.

## Issue definition commands

- Same-workspace copy creates fresh identifiers and To Do workflow; preserves explicitly chosen issue definition fields and optionally sub-issue topology.
- Copy excludes execution context, operations, topics, scheduler/automation state, grants, review state and reservations. It never launches an Agent.
- Generic duplicate records the canonical issue and cancels the duplicate while retaining existing history; target must be readable and duplicate chains cannot cycle.
- Create related uses transaction-coupled creation and actual parent/relation mapping, with documented relationship direction.
- Convert to Project creates a real project and atomically maps the source/sub-issues as standalone project issues.
- Convert to Template must create a reusable issue definition with a real consume path; it is not a rename.
- Recurring conversion must persist cadence through the existing scheduler owning path and keep issue definition separate from runtime state.

## APIs and failure behavior

- New taskMenu router owns links, history, copy and conversion commands; existing task router remains source for ordinary edits.
- Reads allow task readers. Mutations require the same role gate as task edits, current task ACL and applicable revision CAS.
- Missing/foreign/private rows return NOT_FOUND without metadata leakage.
- Invalid URL, relation self-link/cycle, stale CAS, unavailable project/team and expired permissions produce actionable errors.
- Multi-row creation/conversion rollback leaves no partial project/task/link.

## Verification

- Focused database integration tests exercise ACL isolation, link reload/removal, exact description snapshots/restoration/CAS and copy reset/rollback.
- Generated migration 0207 follows strict migration 0206; apply only to the approved disposable loopback clone.
- Validate clone schema and rollback probes; never backfill historical descriptions or touch production.
- Scoped lint/tests and independent code review precede source freeze. Real click/reload acceptance belongs to the sole UI collector.
