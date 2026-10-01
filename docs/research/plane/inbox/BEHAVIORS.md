# Plane Inbox — Behavior Bible

Evidence: Plane source (`~/repos/plane`, AGPL reference clone) + user screenshot.
All behavior below is taken verbatim from Plane's implementation, not inferred.

## Tabs

- `NOTIFICATION_TABS`: `all` and `mentions`. Each renders label + `CountChip` with that
  tab's unread total (`total_unread_notifications_count` for All,
  `mention_unread_notifications_count` for Mentions); chip hidden at 0.
- Active tab: `text-accent-primary` label + `border-accent-strong` underline pinned to the
  tab strip bottom edge. Inactive: `text-primary`, hover `text-secondary`.
- Tab is a request parameter: Mentions tab sends `mentioned=true`; **All tab sends
  `mentioned` absent/false and the API EXCLUDES mention rows** (`sender__icontains='mentioned'`).
  So All = non-mention notifications, Mentions = mention notifications only.

## Header icons (left→right)

1. **✓✓ mark-all-read** — `markAllNotificationsAsRead`; disabled while any loader runs,
   shows spinner while `MARK_ALL_AS_READY` loader active. Marks ALL notifications read.
2. **↻ refresh** — refetches current page query (`MUTATION_LOADER`); spinner while active.
3. **⏷ filter funnel** — dropdown of `MenuCheckboxItem`s, `FILTER_TYPE_OPTIONS`:
   `assigned` → "Assigned to me", `created` → "Created by me", `subscribed` → "Subscribed by me".
   Multi-select; each checked key lands in `filters.type` and is sent as comma-joined `type`.
   - API semantics (`base.py` list): values are OR'd. `subscribed` = subscriber rows AND
     NOT (created ∨ assigned) — the exclusion is unconditional. Guest-role guard on
     `created` returns empty (not applicable to Orvilo).
4. **⋮ display menu** — `MenuCheckboxItem`s:
   - "Show unread" → `filters.read` → `read=false` param.
   - "Show archived" → bulk `{archived: !x, snoozed: false}` — unchecks snoozed.
   - "Show snoozed" → bulk `{snoozed: !x, archived: false}` — unchecks archived.
     Archived and snoozed are therefore mutually exclusive; unread combines with either.

## Applied filter pills

- Rendered only while ≥1 type filter is active (`Header TERNARY` row under the tab row).
- One outlined pill per active type (label = same i18n as menu), `✕` end-icon removes it.
- Trailing "Clear all" pill resets all three to false.

## Notification row

- Container: `relative flex cursor-pointer items-center gap-2 border-b border-subtle py-4`.
- Unread: `bg-accent-primary/5` + absolute dot `top-[50%] left-2 h-1.5 w-1.5 rounded-full
bg-accent-primary`. Selected: `bg-layer-1/30`.
- Avatar: `h-12 w-12 rounded-full bg-layer-1` disc containing the trigger user's avatar.
- Line 1 (`text-body-xs-medium`, clamp-1): `Name` (primary, medium) + `action` (tertiary)
  - `value.` (primary). Orvilo equivalent: `actor/agent name` + `card.content`.
- Line 2 (`text-caption-sm-regular` secondary, clamp-1): `IDENT-seqId` + `issue name`;
  right side timestamp — snoozed rows render `⌚ Till {date}, {time}`, else relative age.
- Hover: options row `hidden group-hover:block` at line-1 right, three `h-5 w-5 rounded-xs
bg-layer-1 hover:bg-surface-2` icon buttons (`stopPropagation` + `preventDefault`):
  - **read toggle** (ChatOutline) — read→mark unread, unread→mark read; success toast.
  - **archive toggle** (ArchiveOutline ↔ RestoreOutline) — toast on both directions.
  - **snooze menu** (ClockOutline) — dropdown:
    `[un-snooze]` only while snoozed, then 1 day / 3 days / 5 days / 1 week /
    2 weeks / Custom (date+time modal). Toasts on snooze/unsnooze.
- Row click: `setCurrentSelectedNotificationId` + `markNotificationAsRead` if unread +
  open issue peek (notifications stay inside the inbox).

## Feed API contract (mapped)

| Plane param  | Orvilo `notification.feed` input                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `mentioned`  | `mentioned: boolean` (true=mention rows only, false=exclude them)                                              |
| `type` (csv) | `types: ('assigned'\|'created'\|'subscribed')[]`, OR'd EXISTS joins on the task resource                       |
| `read=false` | `filter='unread'` (Orvilo unread-OR-pending-action clause) or `unreadOnly` when combined with archived/snoozed |
| `archived`   | `filter='archived'`                                                                                            |
| `snoozed`    | `filter='snoozed'`                                                                                             |
| —            | `cursor`, `limit` unchanged                                                                                    |

## Loading / empty

- `init-loader` → skeleton rows.
- List empty → compact empty state, per-tab copy:
  All: "Updates for your subscribed work items will appear here"
  Mentions: "Mentions for your work items will appear here"
- Detail empty → centered "No notification selected — Select a notification to view its
  details." (Orvilo localized equivalent.)

## Orvilo-local deltas

- Mark-all-read uses Orvilo's existing `markAllAsRead` (statement-snapshot cutoff) — same
  "everything" scope as Plane.
- `unarchive`/`unsnooze` are new endpoints (Plane has both; Orvilo lacked inverse ops).
- Orvilo mention detection = `type='mention' OR category='mention'` — live projection rows
  stamp `category='workspace'`, seed rows `category='mention'`; either must count.
- `read+archived`/`read+snoozed` combos send `unreadOnly=true` on top of the base filter.
