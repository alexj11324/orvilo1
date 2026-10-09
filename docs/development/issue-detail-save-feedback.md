# Issue detail save feedback and peek header

## Save status

Title and description share one per-task status, `taskSaveStatusMap[taskId]`. Every
`updateTask` goes through `runMutation`, which writes `saving` → `saved` / `failed`, so the
title queue (`taskTitleSaveQueue.ts`) and the description autosave both feed it without extra
plumbing. The title queue's draft stays on screen after automatic retries run out.

`IssueSaveStatus` is the single display of that status:

- `saving` shows "Saving…".
- `saved` shows "Saved" for `SAVED_VISIBLE_MS` (2s), then hides.
- `failed` stays until a new write starts or succeeds. Retry appears only while a title draft or a failed description write can actually be re-sent. Property/assignee failures retain the failure message without an inert Retry.

The transitions live in the pure `reduceSaveIndicator` (`saveIndicator.ts`). A `saved` left in
the store by an earlier visit is not replayed on mount (`initialSaveIndicator`); the status effect only dispatches subsequent store transitions.

## Retry

`retryFailedTaskSave(taskId, updateTask)` (`taskSaveRetry.ts`) flushes the title queue (which still
holds the failed draft) and re-sends the last failed description write. The description write is
re-sent as `source: 'external'`, because the failed write's rollback already replaced the editor
content. Retry availability subscribes to the title queue and description retries, including failures armed after the header renders. The description failure is no longer only `console.error`: it reaches the status via
`updateTask`, and arms the header Retry.

## Peek header

`IssuePeekActions` = `IssueSaveStatus` + `TaskDetailHeaderActions` (favourite star and "…" menu),
bound to the pane's issue through `TaskDetailScope`. Hosts keep their own header row and add it
before their open/close buttons: `MyWorkIssuePane`, `IssueDetailPane` (project issues) and the
inbox task pane in `WorkInboxPage`. `TaskDetailHeaderActions` takes an optional `onDeleted`; peek
hosts pass their close handler, the full page keeps navigating to `/tasks`.

## Known limits

- The status is one value per task. A later successful write by another surface (for example a
  property change) replaces a `failed` that came from the title or description.
- While the title queue auto-retries, each failed attempt briefly sets `failed` (and shows the
  existing save-failure toast) before the next attempt sets `saving`.
- Run/pause is not part of the peek header.
