# Plane Inbox (`/notifications/`) — Page Topology

Reference: makeplane/plane @ shallow clone `~/repos/plane` (`apps/web/components/workspace-notifications/`,
`apps/api/plane/app/views/notification/base.py`, `packages/constants/src/notification.ts`).
Target Orvilo surface: `src/features/WorkInbox/WorkInboxPage.tsx` behind SPA route `/inbox`.
User screenshot: `docs/design-references/plane/inbox/user-reference.png`.

## Layout

```text
WorkSurfaceSplit
├── list column  (Plane: md:w-3/12 ≈ 25 % of content; border-r on desktop)
│   ├── column header (h-header, border-b)
│   │   ├── left  : inbox icon + "Inbox" label
│   │   └── right : [✓✓ mark-all-read] [↻ refresh] [⏷ filter] [⋮ display menu]
│   ├── tab row (secondary header, border-b)
│   │   └── "All [count]" | "Mentions [count]"   — active tab: accent text + accent underline
│   ├── applied-filters row (ternary header — only while type filters active)
│   │   └── pill ×N (Assigned to me / Created by me / Subscribed by me) + "Clear all" pill
│   ├── scroll body
│   │   └── notification rows  |  skeleton loader  |  tab-specific empty state
│   └── footer: "Load more" when hasMore
└── detail pane (rest of width)
    ├── nothing selected → centered empty state
    │      ("No notification selected" / "Select a notification to view its details.")
    ├── issue notification → issue peek (Orvilo: shared IssueContent surface)
    └── other card → notification detail card
```

Interaction model: click-driven. List rows open the detail in the right pane and mark the
row read on selection. All mutations happen through row hover icons or header icons; there
are no scroll-driven behaviors. Mobile (`<md`): the list collapses to full width when no
selection; selecting a row covers the list with the detail surface (Orvilo keeps its
existing overlay).

## Inventory

| #   | Section                                          | File (Plane)                                                                 | Interaction                                  |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | Column header + icon controls                    | `sidebar/header/root.tsx`, `sidebar/header/options/root.tsx`                 | click                                        |
| 2   | Tabs (All / Mentions + counts)                   | `sidebar/root.tsx` + `NOTIFICATION_TABS`                                     | click, state underline                       |
| 3   | Applied filter pills                             | `sidebar/filters/applied-filter.tsx`                                         | click to remove / clear-all                  |
| 4   | Notification row + hover options                 | `sidebar/notification-card/item.tsx`, `options/*`                            | click row; hover reveals read/archive/snooze |
| 5   | Filter funnel menu (assigned/created/subscribed) | `sidebar/filters/menu/root.tsx`                                              | checkbox menu                                |
| 6   | Display menu (show unread/archived/snoozed)      | `sidebar/header/options/menu-option/root.tsx`                                | checkbox menu, archived ↔ snoozed exclusive  |
| 7   | Snooze option + presets + custom modal           | `options/snooze/root.tsx`, `snooze/modal.tsx`, `NOTIFICATION_SNOOZE_OPTIONS` | menu + modal                                 |
| 8   | Empty states (list, detail)                      | `sidebar/empty-state.tsx`, `root.tsx`                                        | static                                       |
| 9   | Feed query contract                              | `views/notification/base.py` list                                            | server                                       |

## Orvilo deviations kept on purpose

- Orvilo detail pane keeps the existing task peek (`IssueContent`) and decision buttons —
  Orvilo cards carry approve/decline/cancel/submit_input actions Plane does not have.
- Orvilo "unread" semantic stays unread-OR-unresolved-action, not bare `read_at IS NULL`.
- Copy uses Orvilo domain nouns (tasks) where Plane says "work items".
