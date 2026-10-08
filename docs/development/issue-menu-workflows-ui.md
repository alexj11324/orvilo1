# Issue menu workflows (UI)

The Issue detail header renders a favourite star and an overflow menu (`⋯`). This page
describes the commands that are backed by the `taskMenu` router
([issue-task-menu-backend.md](./issue-task-menu-backend.md)) and how they sit next to the
client-only commands from [issue-header-copy-remove-menus.md](./issue-header-copy-remove-menus.md).

Owner: `src/features/AgentTasks/AgentTaskDetail/TaskDetailHeaderActions.tsx`.

## Menu

```plaintext
[star]  [⋯]
Open in New Tab
──
Team ▸            search + team list (workspace only)
Properties…
Due date ▸        search · Custom… · Tomorrow · End of this week · In one week
Add link… · Add pull request… · Add document…
──
Create related ▸  Issue · Sub-issue · Parent issue · Blocked issue · Blocking issue
Mark as ▸         Parent of · Sub-issue of · Related to · Blocked by · Blocking · Duplicate of
Remove ▸          only what the issue has (hidden when empty)
──
Copy ▸            ID · link · title · title as link · Markdown · everything · [branch] · prompt
Convert to ▸      Project · Template · Recurring issue
Make a copy…
──
Favorite · Remind me ▸
──
Cancel issue ⇄ Reopen issue
──
Show description history · Delete
```

The list-row context menu is unchanged.

## Rules

- **Scope.** Every command reads the task from `TaskDetailScope`, so a routed detail and a
  portal detail mounted together act on their own issue.
- **Revision.** Commands that rewrite or derive from the issue (team move, copy, create
  related, convert, mark/clear duplicate, restore description) send the detail's
  `domainRevision` as `expectedDomainRevision` and stay disabled until the detail has one.
  `updateTask` writes the revision returned by the server back to every cached alias of the
  task, so an edit made a moment earlier (including a due-date change, which bumps the
  revision) does not make the next menu command stale.
- **Permissions.** Favourite, reminder, copy and description history stay available to
  readers. Everything else requires `create_content`; the server enforces its own checks.
- **Failures.** One menu write runs at a time. A failed write shows the server message and
  never reports success. Forms stay open with the error. When a create succeeded but the
  follow-up refresh failed, the refresh error is shown and the user is still taken to the
  created issue; the write is not repeated.
- **Favourite identity.** The star and the menu entry both key on the task UUID, the same id
  board cards use.

## Commands

| Command                 | Write path                                                      | Notes                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Team                    | `team.moveTaskToTeam`                                           | Linear-linked issues are rejected with a dedicated message.                                                                                                          |
| Properties…             | existing `updateTask`, project and milestone stores             | Reuses the rail pickers in one dialog.                                                                                                                               |
| Due date                | `updateTask({ dueDate })`                                       | The search field accepts `24h`, `7 days`, `Feb 9`, `4 pm`, `2026-10-09`.                                                                                             |
| Remind me               | `task.setReminder`                                              | The caller's own reminder; past times are rejected.                                                                                                                  |
| Add link / pull request | `taskMenu.addLink`                                              | http(s) only. The pull-request picker lists the caller's GitHub queue.                                                                                               |
| Add document            | `document.createDocument` + `task.pinDocument`                  | Starts as a creator-private draft. Attaching it does not inherit the Issue's Team audience; sharing is explicit. A failed pin keeps the document and offers a retry. |
| Create related          | `taskMenu.createRelated`                                        | Opens the new issue.                                                                                                                                                 |
| Mark as                 | `task.update` / `task.addDependency` / `taskMenu.markDuplicate` | The target is picked from an issue search.                                                                                                                           |
| Remove                  | per entry                                                       | Duplicate relationship, parent, sub-issues, relations, attached links, due date, reminder, pause/resume and remove recurrence.                                       |
| Convert to project      | `taskMenu.convertToProject`                                     | Identifier is 3–6 letters or digits.                                                                                                                                 |
| Convert to template     | `taskMenu.convertToTemplate`, then `createFromTemplate`         | The dialog offers "Create issue from template" after saving.                                                                                                         |
| Convert to recurring    | `taskMenu.convertToRecurring`                                   | First due date, cadence, interval, IANA time zone. No agent run is started.                                                                                          |
| Make a copy…            | `taskMenu.copyIssue`                                            | Choose sub-issues, labels, assignees (off by default), due date, project, team.                                                                                      |
| Description history     | `taskMenu.descriptionHistory` / `restoreDescription`            | Only captured versions are listed. Restoring updates every mounted editor for the task.                                                                              |

## Issue page additions

- `TaskDuplicateRelation` shows "Duplicate of ‹identifier› · ‹title›" under the title. The
  server names the target only when the caller can read it; otherwise the row says the issue
  is unavailable and exposes no id or title.
- `TaskIssueResources` lists attached links and pull requests above the activity feed. A URL
  becomes a link only when it is plain http(s) without embedded credentials.

## Clipboard

Copy ID and Copy link use the readable identifier even when the detail is mounted by UUID.
Titles and link labels go through `taskMarkdown.ts` (label escaping, URL percent-encoding) in
"title as link", "Markdown" and the link lines of "everything". Comment bodies are the
authors' own Markdown and are copied verbatim. "Copy as prompt" is plain text.

Client code in this area does not log URLs, titles or description bodies.
