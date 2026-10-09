# Issue detail sections

The body of the Issue detail page (`src/features/AgentTasks/AgentTaskDetail/`) follows Plane's
issue-detail widgets: one add row, sections that exist only when they have content, one header shape.

## Add row

`TaskDetailAddActions` sits directly under the description: add sub-issue, add link, add pull
request, add document (local `Button`, `sm`, `secondary`, wrapping). It is always visible for users who
can edit and absent for users who cannot.

- Sub-issue opens the existing `CreateTaskInlineEntry`. The composer state lives in
  `TaskDetailSections` and is shared with `TaskSubtasks` (`composerOpen` / `onComposerOpenChange`),
  so an empty Issue has no second "+ Add sub-issue" button.
- Link / pull request / document call `openTaskIssueResourceModal`, the same picker the header "…"
  menu uses; the mutation stays in `useTaskIssueResourceMutation`. `ISSUE_RESOURCE_KINDS` is the one
  list of kinds, shared by the header menu, the row and the Attachments "+" menu.
- Resource buttons are disabled with a title until the Issue has its database id and
  `domainRevision` (the commands need both).

## Sections

Sub-issues, Artifacts, Attachments (`TaskIssueResources`) and Activity use
`TaskDetailSectionHeader`: icon, title, muted count, a collapse toggle that is a real `button` with
`aria-expanded`, optional status/filters after it and trailing actions.

- A section renders only when it has content (Sub-issues also while its composer is open).
- Attachments has a count, collapses, and shows a trailing "+" menu (link / pull request / document)
  while open and editable.
- `TaskArtifacts` is also mounted in the task result Portal, which picks up the new header.

## Read-only viewers

`resolveIssueDetailCapabilities` (pure, tested) decides what a viewer can do; `useIssueDetailCapabilities`
feeds it the `create_content` permission and the loaded Issue.

- Title renders as plain text with the same type (`titleText`), not a disabled textarea.
- The property rail is dimmed (`opacity-60`) and `inert`, and "Add property" is hidden.
- The add row is not rendered.

`usePermission` currently always allows in this repository, so the read-only branch is covered by the
helper's unit test only.

## Out of scope

Attachments (file) section, reactions, subscribe, field-name labels in the rail, shortcuts,
next/previous navigation.
