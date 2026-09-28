# Views detail behavior inventory

## Observed reference states

- Add filter opens a 208px dialog containing AI filter, Advanced filter, Team,
  Status, Assignee, Agent, Agent Session, Creator, Priority, Labels, Relations,
  Suggested label, Dates, Project, Project properties, Subscribers, External
  source, Auto-closed, Content, Links, and Template.
- Display options opens a 302 x 568 popover. It exposes List/Board,
  Grouping=Status, Sub-grouping=No grouping, Ordering=Priority, completed issue
  ordering, completed visibility, sub-issues, triage issues, nesting, empty groups,
  and property toggles.
- Issue view options opens a 329 x 306 menu: Edit, Duplicate, Move to, Subscribe,
  Slack notifications, Copy link, CSV export, Delete. Destructive or mutating choices
  were inventoried and not exercised.
- Close view details removes the aside and expands the first row from 775px to
  1175px. The same 28px button becomes Open view details; reopening restores the pane.
- Details tabs are read-only summaries. Observed values:
  - Assignees: Alex Jiang 124; No assignee 112.
  - Labels: claude code 103; Feature 61; Bug 59; Improvement 17.
  - Projects: seven named/no-project buckets with counts.
  - Teams: orvilo 148; Daymark 88.

## Candidate behavior before this slice

- `SavedViewPage` already persists filters, layout, grouping, sorting, sharing, and
  optimistic definition-version conflicts through one inline edit panel.
- Owner-only controls are hidden until Edit view is clicked. Built-in views are
  system-owned and therefore cannot prove the owner editing states.
- Work-query group headers already collapse locally; rows use live task data.

## Unknown / remaining

- Linear group-collapse animation and virtualized post-collapse ordering were not
  accepted: the visible reference has three virtualized groups and the first semantic
  click did not produce an unambiguous post-state.
- Reference property toggles, board mode, and filter selection were not chosen because
  this personal view may persist edits immediately.
- Candidate facet summaries do not yet expose the server-side Assignee/Label facet
  contract. This slice uses available live evaluation metadata and status-group totals.
