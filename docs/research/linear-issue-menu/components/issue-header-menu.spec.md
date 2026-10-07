# Issue header and ellipsis

Status: bounded implementation spec, based on user screenshot and source audit.
Reference submenu evidence is owned by the live-reference collector; unknown children
must not be guessed or rendered as inert actions.

## Observable result

- Breadcrumb, favorite star and ellipsis share a centered header row.
- Breadcrumb separators are sibling list items, never nested `li` elements.
- Star and ellipsis use the same icon button geometry.
- Rail retains copy link/ID/branch quick actions; ellipsis clipboard actions live
  under a single Copy submenu rather than repeated flat entries.
- Issue ellipsis removes Publish to workspace: the existing action only changes
  the audience in the current workspace and cannot implement Team movement.

## Frozen top-level order

Team; Due date; Add link; Add pull request; Add document;
separator; Create related; Mark as; Remove;
separator; Copy; Convert to; Make a copy;
separator; Favorite; Remind me;
separator; Show description history; Delete.

Only executable entries with confirmed reference children ship. Server-dependent
entries remain implementation work until persistence, API and real UI are present.

## Existing commands

- Team uses team.moveTaskToTeam with the current task UUID, expectedDomainRevision
  and chosen team UUID. It honors source/target permission and remote Linear guard.
- Due date uses existing date persistence and existing calendar dialog.
- Copy uses existing workspace-aware links and the readable issue identifier.
- Favorite uses task UUID in both star and ellipsis, matching board cards.
- Remind me uses existing per-user getReminder/setReminder persistence. Readers
  may remind themselves; due-date editing remains write-gated.
- Delete preserves existing confirmation, server cleanup and post-delete navigation.

## Invariants and failures

- Read task data from TaskDetailScope so concurrent routed and portal detail hosts
  cannot operate on the wrong task.
- Team, workspace, repository execution workspace and private audience stay distinct.
- Keep clipboard/reminder/favorite available to readable tasks without edit permission.
- Show mutation/load errors and disable pending writes; never claim success on failure.
- Empty or failed team directory must not create an inert selectable team item.
- Favorite checked state and toggle identity use the same UUID.
- Existing history cannot be invented from current description content.

## Verification

- Focused regressions: valid breadcrumb DOM; Copy group/no flat duplicates; no
  publish entry; canonical favorite identity; existing mutation/error boundaries.
- Scoped lint/tests only; Typecheck is remote CI only.
- Real product acceptance: measure header icon/text centers, open menu/submenus,
  execute actions, reload to confirm persistence, compare confirmed Linear states.
- Root owns final native browser/runtime evidence, review and final revision mapping.

## Captured children and implemented commands

- Due date: Custom, Tomorrow, End of this week, In one week. Separate reminder
  submenu: one hour, tomorrow, next week, one month, custom. Search accepts the
  advertised concrete date/time phrases; custom calendars save real values.
- Create related: Issue, Sub-issue, Parent issue, Blocked issue, Blocking issue.
  `taskMenu.createRelated` owns atomic fresh ToDo creation and relation direction.
- Mark as: Parent of, Sub-issue of, Related to, Blocked by, Blocking, Duplicate of.
  Parent/relation commands reuse task APIs; duplicate follows owning lifecycle.
- Copy: ID, URL, title, linked title, issue Markdown, all readable issue content,
  actual bound branch, prompt. UUID hosts use the readable identifier in URLs.
- Convert: Project (name/identifier/explicit original rename), Template (save and
  real create-from-template consume action), Recurring (first due date, cadence,
  interval, explicit IANA timezone). Definition APIs never start an Agent.
- Make a copy: explicit property/sub-issue choices, unassigned by default.
- Add link/PR/document: separate persisted attachments, real authorized PR queue,
  genuine document create/pin/open path; resource worker owns these components.
- History: ACL-scoped captured versions, current restore disabled, CAS restore
  updates every cached host snapshot through the existing external editor seam.
- Dynamic Remove reflects real relation/date/resource/recurrence state.
- Readback failures after successful creation do not resubmit the write: show the
  refresh error and continue to the created entity.
