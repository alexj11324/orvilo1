# Title autosave task identity

## Observed failure

`TaskDetailTitleInput` debounced `updateTask` for 300ms with a closure that
read the _current_ `taskId` at fire time — so typing into task A and switching
to task B within the window wrote A's value under B's id. The same closure was
also cancelled on unmount, dropping the last keystrokes when the user left
right after typing.

## Design

Every keystroke now captures `{ taskId, value, editSequence }` at input time
into a module-scoped `TaskTitleSaveQueue` keyed by task. Saves are serialized
per task (one request on the wire at a time, matching server last-writer-wins
with the user's edit order); an edit scheduled while another save is in flight
stays pending and flushes when the stale sequence settles. Because the queue
owns the timers, the scheduled save survives the input's unmount — the
component only ever _flushes_ (never cancels) on blur, task switch, and
unmount.

Failure keeps the draft: the rejected edit stays `pending` for automatic
retries (bounded) and every later flush, and `hasPending` tells the title
input not to overwrite the visible draft with the store's `name` while an edit
is unsent — which also stops a concurrent remote title change (or the
optimistic rollback after a failure) from clobbering what the user sees.

## Verification

`taskTitleSaveQueue.test.ts` + `useTaskTitleAutosave.test.ts` run under fake
timers: A→cached-B and A→uncached-B switches assert every mutation targets the
input-time task; A/B/A round trips, leave-after-last-char, mid-flight edit
supersession, failure retry, retry budget, and per-task failure isolation are
covered. The queue only reads `updateTask` by injection — no store or editor
state is involved, so the body autosave's `contentRevision` flow is untouched.
