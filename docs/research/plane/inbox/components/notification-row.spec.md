# NotificationRow Specification

## Overview

- **Target file:** new `src/features/WorkInbox/InboxListRow.tsx` (row + hover options +
  snooze menu); rendered by `WorkInboxPage` list body
- **Plane source:** `sidebar/notification-card/item.tsx`, `content.tsx`,
  `options/{root,read,archive,snooze/*,button}.tsx`
- **Interaction model:** click selects+marks read+opens detail; hover reveals 3 option
  icon buttons (each stopPropagation)

## DOM Structure

```text
button.row (w-full, relative, group, border-b, py-4/16px, flex, gap-2, cursor-pointer)
├── [unread] absolute dot: left-2, top-50%, 6px round, accent color
├── div (flex, w-full, gap-2)
│   ├── avatar disc: h-12 w-12 rounded-full bg-fill, centered
│   │   └── <Avatar size≈40-48> actor/agent — fallback: type glyph icon
│   └── text column (flex-1, min-w-0, space-y-1)
│       ├── line1 row (flex items-center gap-3)
│       │   ├── p (truncate, body-xs-medium ≈12px/500)
│       │   │   <span font-medium>ActorName</span>{' '}
│       │   │   <span text-tertiary>content</span>{'.'}
│       │   └── options (hidden group-hover:flex, gap-2, shrink-0)
│       │       ├── IconButton h-5 w-5 — read toggle (Mail/MailOpen)
│       │       ├── IconButton h-5 w-5 — archive toggle (Archive/ArchiveRestore)
│       │       └── IconButton h-5 w-5 — snooze menu trigger (Clock)
│       └── line2 row (flex items-center gap-3, caption ≈12px secondary)
│           ├── span truncate: `{resourceIdentifier} {title}` (identifier omitted when
│           │   the card has none; title is the live-overlaid resource name)
│           └── right span (shrink-0):
│               ├── snoozed → Clock icon + "Till {date}, {time}" (tertiary)
│               └── else    → relative age (tertiary)
```

## States

- Unread row: `bg` = accent at \~5% (token `colorPrimaryBg`) + left dot.
- Selected row: `bg` = `colorFillTertiary`-equivalent layer tint.
- Read row: transparent bg, no dot.
- Hover: options appear (row still shows `data-active` state unchanged).

## Hover option behavior (all stopPropagation + preventDefault)

| Button  | Action                                                                                                                                                                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| read    | `markReadObserved(id, activityVersion)` when unread; `markUnread(id, expectedVersion)` when read — local `pager.updateCard` + refresh                                                                                                               |
| archive | `archive(id, activityVersion)`; in archived view `unarchive(id, activityVersion)` — row leaves current view via `pager.removeCard`                                                                                                                  |
| snooze  | DropdownMenu: `Un snooze` (only when `snoozedUntil` set — new `unsnooze` proc), then `1 day / 3 days / 5 days / 1 week / 2 weeks / Custom` (days presets = now + n·24h; Custom opens datetime modal via `createModal` with DatePicker + time input) |

- Success toasts for each mutation (Plane parity): marked read/unread/archived/unarchived/
  snoozed/unsnoozed. Failure → existing `inbox.organizeFailed`.

## Copy constants (new i18n)

`inbox.snoozeUntil` `Till {{date}}, {{time}}` · `inbox.markRead` Mark as read ·
`inbox.unarchive` Un archive · `inbox.unsnooze` Un snooze ·
`inbox.snoozePreset.1day|3days|5days|1week|2weeks` · `inbox.snoozePreset.custom` Custom ·
`inbox.snoozeModal.title` `Snooze until` · `inbox.toast.{read,unread,archived,unarchived,snoozed,unsnoozed}`
