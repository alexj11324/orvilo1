# Inbox parity plan

- Reference: `https://linear.app/bdiverifier/inbox/priority`
- Candidate: `app://renderer/ws-useragenttes/inbox`
- App root: `/Users/alexjiang/Desktop/vibe/orvilo-linear-parity`
- Site key: `linear`
- Page key: `inbox-page`
- Feature owner: `src/features/WorkInbox/WorkInboxPage.tsx`
- Artifact root: `docs/research/linear/inbox-page/`
- Route owner changes: none
- Shared shell/sidebar changes: none

## Bounded delivery

Align the Inbox-owned master-detail frame and row selection behavior:

1. Desktop keeps a 400px list beside a persistent detail pane, including before selection.
2. The unselected detail pane shows a centered Inbox placeholder with the current unread count.
3. Empty/loading/error list content fills the available list pane height.
4. Populated rows are compact, keyboard-focusable selection controls; clicking one keeps the list visible, highlights the row, and renders the detail pane. If the read receipt removes that notification from the active bucket, the selected row stays at its prior position until the user leaves it.
5. Tablet/mobile remain list-first, with the existing detail overlay after selection.

## Observable success

- At 1440x900, no-selection state has a 400px list and a visible detail placeholder.
- With a controlled local synthetic feed, selecting an unread row preserves that row and the list column while changing the right pane to that row's detail.
- At narrow widths, the list uses the available width and detail opens as the existing overlay.
- Existing feed error, partial, loading, pagination, bulk action, decision, and URL state behavior remains intact.

## Failure conditions

- Empty desktop state expands the list across the whole surface.
- Empty content ends near the header instead of filling the pane.
- Selection navigates away from the Inbox or hides the desktop list.
- Verification relies only on the empty fixture.

## Evidence boundary

The local fixture is synthetic and proves the rendered row/selection transition only. It does not prove production notification projection, actor hydration, permissions, persistence, or every Linear row/detail variant.

Reproduce the maintained local fixture with:

```bash
ORVILO_PARITY_SEED_TARGET=local bun scripts/seedLinearParity/seedInboxNotifications.ts
```

The helper refuses every database except the verified local parity target at
`localhost:5432/orvilo_linear_parity_20260922`, and it deletes only the
synthetic user's `linear-parity-inbox:*` rows before recreating six stable IDs.
The sixth row (`linear-parity-inbox:task-link`) is an unread mention whose
`resourceType: 'task'` / `resourceId: 'taskpv0011'` open target resolves to a
seeded APX-11 issue, exercising the task-linked detail pane and — because a
read mention leaves the Priority bucket — the read-receipt retention path.
