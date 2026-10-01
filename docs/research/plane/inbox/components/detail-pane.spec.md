# DetailPane + EmptyStates Specification

## Overview

- **Target file:** `src/features/WorkInbox/WorkInboxPage.tsx` (right pane + list empty state)
- **Plane source:** `root.tsx`, `sidebar/empty-state.tsx`
- **Interaction model:** passive — renders selection state

## Detail pane

- `selected == null` → centered empty state, two-line copy:
  - title: "No notification selected"
  - description: "Select a notification to view its details."
- Task-backed card → existing pane: sticky header (identifier + favorite + open) +
  `LazyIssueContent` peek. Kept — this is the Orvilo equivalent of Plane's
  `PeekOverviewComponent`. Orvilo additionally keeps the decision verb buttons
  (approve/decline/cancel/submit_input + input draft) — Orvilo domain capability.
- Non-task card → existing title/meta/content + decision actions.
- The former `⋯` overflow menu in the pane header is REMOVED — Plane carries organize
  actions on the row hover buttons, not in the detail pane.
- Mobile `surface === 'detail'` overlay + back button preserved.

## List empty states

- All tab empty → `inbox.emptyAll`: "Updates for your subscribed tasks will appear here"
  (Orvilo noun: tasks).
- Mentions tab empty → `inbox.emptyMentions`: "Mentions for your tasks will appear here"
  (Plane: "Mentions for your work items will appear here").
- Filtered/archived/snoozed/unread empty keeps `inbox.empty` fallback.
- Loading → existing skeleton list; feed error → existing `AsyncError` block.

## i18n keys (new)

`inbox.emptyAll` · `inbox.emptyMentions` · `inbox.detailEmptyTitle` "No notification
selected" · `inbox.detailEmptyDescription` "Select a notification to view its details."
