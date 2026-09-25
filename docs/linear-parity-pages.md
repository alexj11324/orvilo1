# Linear parity — page-level surfaces

Follow-up wave to the feed parity work (`linear-parity-feed.md`): alignment
fixes across the projects list, inbox, drafts, and project surfaces, verified
live in Electron against the Linear reference workspace.

## Projects list (`/projects`)

- **Status column**: Linear's five-glyph project-status set — backlog dashed
  ring, planned hollow ring, active yellow ring, completed purple check,
  canceled ⊗ — replaces the generic dot. Orvilo's agent-domain extras
  (paused / reviewing / archived) keep their existing marks.
- **Progress sparkline**: the flat fill bar becomes Linear's two-segment
  stroke (completed + in-progress).
- **Lead column**: avatar-only, matching the reference row shape.

## Inbox (`/inbox`)

- **Sidebar badge**: `useInboxUnreadCount` was gated behind
  `ENABLE_BUSINESS_FEATURES` (hardcoded `false`), so the unread badge never
  fetched. It is now gated on login only; the inbox page already issues the
  same `feedSummary` key unconditionally, so this adds no extra requests.
- **Compact times**: row and detail timestamps use `compactInboxTime`
  (`src/utils/compactRelativeTime.ts`) — shortest unit `4h`, `16d`, `7w`,
  matching the reference instead of `fromNow()`'s "24 minutes ago".
- **List footer**: `N unread notifications` renders at the bottom of the
  list column when the feed has no more pages.

## Drafts (`/drafts`)

- Draft rows use the same `compactInboxTime` format; the absolute date stays
  in the tooltip.

## Project detail

- Rail milestone row order matches the reference: name → `N% of M` → date,
  with current-year dates shortened to `MMM D`.
- Workspace milestone card right-cluster reordered to
  `DatePicker · N issues · N% · ⋯`.

## Seed data

`seedParityVolume.data.ts` task ids renamed `taskpvNNNN` → `task_pvNNNN` to
match `taskModel.resolve()`'s `task_` prefix convention. Before this, seeded
task ids resolved as identifiers and returned `TASK_NOT_FOUND`, which broke
the inbox detail pane and `/task/:id` on seeded data.
