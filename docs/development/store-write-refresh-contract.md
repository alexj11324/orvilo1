# Store write → refresh contract

`src/store/project/store.ts` mutating methods (links, milestones) follow a
post-commit boundary pattern that callers must not regress:

1. The service write commits first (`projectService.*`).
2. The SWR refresh runs after, guarded by the cache scope captured _before_
   the write (`refreshLinksAfterWrite`, `refreshDetailAfterWrite`).
3. A refresh/readback failure is returned on the response envelope as
   `{ refreshError }` — it must **not** reject the call. Retrying a rejected
   create would duplicate an already-committed resource.

Callers that surface failures read `result.refreshError` and show a warning
(e.g. `ProjectLinkModal`, `ProjectMilestones.runMutation`,
`MilestoneFormModal`, `ProjectMilestonesPage`) via
`overview.milestoneRefreshError` — never an error toast, since the write
succeeded and only the view may be momentarily stale.

A scope switch mid-flight skips the refresh entirely (`{}`), so a retained
view keyed to another workspace is never overwritten by a late readback.

# Saved-view CSV export guarantees

`src/features/SavedViews/savedViewCsv.ts`:

- **Formula neutralization** — `csvCell` prefixes `'` when a value's first
  character is `=`, `+`, `-`, `@`, tab or CR, so workspace-controlled titles
  cannot execute when the export is opened in a spreadsheet client.
- **Truncation disclosure** — `fetchAllSavedViewRows` returns
  `{ rows, truncated }`. `truncated` is set when the export stops before
  every evaluated row was collected (the `SAVED_VIEW_CSV_MAX_ROWS` ceiling,
  a group that still reports `hasMore`, or a stalled flat cursor), and the
  exporter surfaces it with `savedViews.exportCsvTruncated` instead of
  reporting a complete export.
