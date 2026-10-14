# Issue detail sections

The body of the Issue detail page (`src/features/AgentTasks/AgentTaskDetail/`) follows Linear's
model: there is no mid-page add row — each "add" lives in its own section's header.

## Add affordances

- Sub-issues: the header "+" opens `AddSubIssueMenu` — create a new sub-issue inline
  (`CreateTaskInlineEntry`, owned by `TaskSubtasks`) or attach existing issues through the
  relation picker. The header stays on an empty issue for editors so the first sub-issue
  is reachable; a viewer with nothing to read gets no section.
- Attachments (`TaskIssueResources`): the header "+" menu adds a link, pull request or
  document via `openTaskIssueResourceModal`, the same picker the header "…" menu lists;
  the mutation stays in `useTaskIssueResourceMutation`. `ISSUE_RESOURCE_KINDS` is the one
  list of kinds, shared by the "…" menu and the section menu. The header likewise stays on
  an empty issue once the commands can run (the issue's database id and `domainRevision`
  exist — see `resolveIssueDetailCapabilities`).

## Sections

Sub-issues, Artifacts, Attachments (`TaskIssueResources`) and Activity use
`TaskDetailSectionHeader`: icon, title, muted count, a collapse toggle that is a real
`button` with `aria-expanded`, optional status/filters after it and trailing actions.

- Sub-issues and Attachments keep their header (and "+") for an editor on an empty issue;
  every other section renders only when it has content.
- Attachments has a count, collapses, and shows a trailing "+" menu (link / pull request /
  document) whenever the viewer may add.
- `TaskArtifacts` is also mounted in the task result Portal, which picks up the new header.

## Read-only viewers

`resolveIssueDetailCapabilities` (pure, tested) decides what a viewer can do; `useIssueDetailCapabilities`
feeds it the `create_content` permission and the loaded Issue.

- Title renders as plain text with the same type (`titleText`), not a disabled textarea.
- The property rail is dimmed (`opacity-60`) and `inert`, and "Add property" is hidden.
- No add affordance acts: Sub-issues shows a disabled "+" when it has rows, Attachments
  shows none, and an empty issue renders neither section for a viewer.

`usePermission` currently always allows in this repository, so the read-only branch is covered by the
helper's unit test only.

## Out of scope

Attachments (file) section, reactions, subscribe, field-name labels in the rail, shortcuts,
next/previous navigation.
