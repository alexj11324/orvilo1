# Team Triage create slice

## Delivered contract

- The empty-state `Create triage issue` action opens the generic issue composer with the current `teamId` fixed in its create options.
- `TaskModel.create` already assigns `triageStatus: 'untriaged'` to a newly created team-owned task, so the resulting issue is selected by the Team Triage query.
- A successful create revalidates the current Triage queue.
- The Triage header now uses the current team identity and `Triage` title; the duplicate in-body title is removed.

## Regression evidence

- Red before implementation: `teamTriageCreateOptions is not a function` in the focused WorkTeams test.
- Green after implementation: `bun run check` on the changed WorkTeams files reported lint clean and 6 passing tests; the focused WorkTeams regression set passed 13 tests, and the database invariant test passed with 1 selected test (`204` unrelated tests skipped).
- Electron `:9222` at 1440×900 on 2026-09-22, branch `devin/v6-linear-polish` with this slice uncommitted: `/ws-useragenttes/teams/team_r6cxh0GBbfrI?tab=triage` rendered an empty queue. Clicking the exact `创建待分诊任务` CTA opened the generic composer; its visible controls included title, description, priority, assignee, visibility and `创建任务`. Closing with the dialog's X left the queue unchanged, and the shared tab was restored to `/ws-useragenttes/projects`.

## Remaining ORV-121 gaps

- The shared composer does not yet render the fixed team and Triage status as visible chips like Linear. The Electron check confirmed this visible gap.
- Linear's Add filter and Display options controls are not present; no inert controls were added.
- The reference queue was empty. Populated row actions, snooze, assignment, ordering, persistence, permissions, and failure recovery remain unverified and unimplemented.
- Successful creation, post-create queue refresh and deletion of a disposable issue remain unverified in Electron. The code path and regression test establish the team binding, but the observed runtime check covered opening and cancellation only.
