# Inbox behavior inventory

## Observed reference behavior

- Desktop initial state preserves both panes. The detail pane shows an Inbox illustration and `29 unread notifications` during the captured run.
- Selecting an already-read issue row keeps the 400px list visible and replaces the placeholder with issue detail.
- The selected row receives a subtle filled background.
- Priority/Other are route-backed segments.
- Rows are links in Linear. Read and unread states show distinct metadata and an unread dot.
- At 768px and 390px, the unselected surface is list-only and full width.

## Observed candidate behavior before this slice

- At 1440x900 with an empty feed, the list consumes the full 1186px surface width.
- The list scroll region is 780px tall, but the list column content ends after a 210px empty block at `y=352`, leaving the remainder blank.
- No persistent desktop detail placeholder is mounted without a selection.
- Candidate data is empty, so pre-change evidence cannot establish row height, selected styling, or the clicked-result state.

## Safe reference actions

- Opened a dedicated Linear tab.
- Selected one already-read issue notification to inspect detail composition.
- Did not click unread rows, onboarding actions, archive/delete, filters, mutation menus, or editable issue controls.

## Required candidate replay

Seed local synthetic notification rows with:

```bash
ORVILO_PARITY_SEED_TARGET=local bun scripts/seedLinearParity/seedInboxNotifications.ts
```

Then capture:

1. Populated list before selection.
2. The same list after clicking one unread row, including the retained active row and right-side detail after its read receipt lands.
3. The URL selection parameter proving the Inbox route remains active.

The replay proves only this bounded transition.

The six-row fixture does not prove Linear's count semantics. Orvilo's default Priority placeholder intentionally uses its authoritative global unread/pending badge contract, while Linear's observed Priority placeholder matched that bucket's unread count. This remains a product-semantic difference, not a visual completion claim.

The `linear-parity-inbox:task-link` row is an unread mention linked to seeded task `taskpv0011` (APX-11, deliberately without the `task_` id prefix). Selecting it mounts the shared issue surface via `task.detail`, so it also proves `TaskModel.resolve` reaches non-`task_` primary keys.

## Runtime finding resolved during this slice

The first populated replay exposed a selection continuity bug: an unread mention left the Priority server bucket as soon as its read receipt landed, so the selected row disappeared while its detail remained open. The Inbox now retains only the active card at its previous list index, armed only for that read-receipt transition and bound to the user/workspace/tab/filter feed scope. Selection departure, scope changes, archive, bulk archive, and completed decisions clear the retention. The server query remains authoritative; the retained row also disappears when the by-id lookup confirms the card is gone.
