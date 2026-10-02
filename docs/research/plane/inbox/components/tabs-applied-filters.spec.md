# InboxTabs + AppliedFilters Specification

## Overview

- **Target file:** `src/features/WorkInbox/WorkInboxPage.tsx` (second and third rows of the
  list column)
- **Plane source:** `sidebar/root.tsx` (Header SECONDARY map over `NOTIFICATION_TABS`),
  `sidebar/filters/applied-filter.tsx` (Header TERNARY)
- **Interaction model:** click-driven tabs; click-to-dismiss pills

## DOM Structure — tab row

```text
div (secondary header, border-b, h ~36-40px)
├── tab "All"      px-3, h-full, cursor-pointer
│   └── label (body-xs-medium ~12px/500) + CountChip(count) when >0
└── tab "Mentions" px-3 — same anatomy
```

- Active tab label `text-accent-primary`; inactive `text-primary`, hover `text-secondary`.
- Active underline: `absolute bottom-0 left-0 right-0 border border-accent-strong rounded-t-md`
  — i.e. a 2px accent underline pinned to the row's bottom edge.

## Behavior

- `tab=all` → feed `mentioned=false`; `tab=mentions` → feed `mentioned=true`.
- Counts from `feedSummary`: All chip = `unreadBadgeCount` (Orvilo badge-worthy total,
  unread-or-pending), Mentions chip = `unreadMentionCount` (widened mention predicate).
- URL: `tab` param (`all` omitted as default); legacy `priority|other|action|activity`
  values resolve to `all`, `mentions` to `mentions`.

## DOM Structure — applied filters row (conditional)

```text
div (ternary header, gap, border-b)
├── Pill "Assigned to me"  [✕]   ← per active type filter
├── Pill "Created by me"   [✕]
├── Pill "Subscribed by me"[✕]
└── Pill "Clear all"       [✕]
```

- Renders only when ≥1 of `types` is set. Each pill click removes that filter;
  "Clear all" removes the whole `types` param.
- Pill = outlined, rounded-full, \~12px label + ✕ end icon.

## i18n keys (new)

`inbox.tab.all` All · `inbox.tab.mentions` Mentions ·
`inbox.filterType.assigned` Assigned to me · `inbox.filterType.created` Created by me ·
`inbox.filterType.subscribed` Subscribed by me · `inbox.clearFilters` Clear all
