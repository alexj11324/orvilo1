# ListColumnHeader Specification

## Overview

- **Target file:** `src/features/WorkInbox/WorkInboxPage.tsx` (list column, first row)
- **Screenshot:** `docs/design-references/plane/inbox/user-reference.png`
- **Interaction model:** click-driven (icons + two dropdown menus)
- **Plane source:** `sidebar/header/root.tsx` + `sidebar/header/options/root.tsx`

## DOM Structure

```text
Row (h-header ≈ 48px, flex, border-b border-subtle, bg surface)
├── left:  <InboxIcon 16px> + "Inbox" (font-medium, ~13-14px)
└── right: icon row, gap ~8px
    ├── IconButton sm ghost — CheckDoneOutline  (mark all as read)
    ├── IconButton sm ghost — RefreshOutline    (refresh)
    ├── IconButton sm ghost — FilterOutline     (filter funnel menu)
    └── IconButton sm ghost — MoreVerticalOutline (display options menu)
```

## Behavior

- mark-all-read → `notificationService.markAllAsRead()` (Orvilo snapshot-cutoff bulk);
  spinner inside the button while in-flight; ⌥U hotkey preserved.
- refresh → revalidate feed + feedSummary + unreadCount SWR keys; spinner while running.
- filter funnel → `DropdownMenuCheckboxItem`s: "Assigned to me", "Created by me",
  "Subscribed by me". Independent multi-select; writes `types` URL param (comma list).
- display menu → `DropdownMenuCheckboxItem`s: "Show unread", "Show archived",
  "Show snoozed" (closeOnClick=false).
  - Show unread ↔ URL `filter=unread` (or `unread=1` overlay when archived/snoozed active).
  - Show archived ↔ `filter=archived`; toggling on clears snoozed (single param → automatic).
  - Show snoozed ↔ `filter=snoozed`; toggling on clears archived.

## Icons (lucide, matching Plane glyph roles)

- CheckDoneOutline → `CheckCheckIcon`; RefreshOutline → `RefreshCwIcon`;
  FilterOutline → `ListFilterIcon`; MoreVerticalOutline → `MoreVerticalIcon`; Inbox → `InboxIcon`.

## Styles (measured from Plane source)

- Header row height = Plane `h-header` (48px), `border-b`, items centered.
- Icon buttons: `size-sm` ghost, \~28px square, icon 16px.
- Title text primary, medium weight.

## Responsive

- Desktop/tablet/mobile identical structure; the column header stays inside the list column
  (mobile detail overlay covers the whole list pane including this header).
