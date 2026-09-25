# Linear parity — Agent-domain controls

Strict two-way alignment with Linear keeps Orvilo's Agent-domain features
(Linear has no counterpart). Instead of deleting them, their controls are
placed and shaped per the installed design skills
(`.agents/skills/shadcn-ui`, `.agents/skills/web-design-guidelines`).

## Placement

- **Agent executor** (`assigneeAgentId`): a rail row named "Agent" inside the
  rail's Assignee group, directly after the human Assignee row and before
  Reviewer. It is disabled while the task is running. It is a distinct field
  from the human `assigneeUserId`, not a duplicate.
- **Under-title row**: the single primary-CTA cluster — Run/Stop plus the
  schedule split button. The agent selector no longer lives here.
- **Rail quick actions** (copy link / copy id / branch): unchanged visually;
  they are Linear's round icon-button pattern.

## Control semantics (web-design-guidelines)

- Icon-only buttons carry `aria-label` in addition to their tooltip (rail
  quick actions, sidebar search/new-task, subtask run-all/add).
- Ghost toggle/add rows (Acceptance header, Subtasks header, Add subtask,
  acceptance-state rail row) expose `role="button"`, `tabIndex`, Enter/Space
  activation, and `aria-expanded` on collapsibles — keyboard parity without a
  visual change.
- Labels use Title Case, specific names ("Agent", not an icon alone).
