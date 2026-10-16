# #771 frontend handoff: Issue activity and execution history

Research date: 2026-10-13. This is a source-backed frontend proposal, not an implemented layout change or a live visual-parity certificate. The user owns frontend wording, layout, directories and behavior. Backend references already use the full orchestration workflow name.

## What the references actually do

**Multica** separates execution history into the Issue's right-panel `ExecutionLogSection`: active runs first, at most three recent past runs, and the full history in a Runs dialog. Its Issue header chip concerns current active work, not a badge for every terminal run. It also attaches Agent output to the input/comment thread: `buildCommentRunView` links replies by run identity, avoids showing invalidated queued inputs as new replies, and avoids a second failure notice that only repeats the run's error. Therefore “no Agent status appears in Activity” would be inaccurate: Agent replies can carry their associated run context, while the complete execution log remains separate.

Pinned Multica source, `7ab92d7622ecd81d179a8d83ae2dea74835a5069`:

- [Execution log placement, current/past partition and three-row limit](https://github.com/multica-ai/multica/blob/7ab92d7622ecd81d179a8d83ae2dea74835a5069/packages/views/issues/components/execution-log-section.tsx)
- [Current-work header chip](https://github.com/multica-ai/multica/blob/7ab92d7622ecd81d179a8d83ae2dea74835a5069/packages/views/issues/components/issue-agent-header-chip.tsx)
- [Replies, run association and duplicate failure-notice handling](https://github.com/multica-ai/multica/blob/7ab92d7622ecd81d179a8d83ae2dea74835a5069/packages/views/issues/components/comment-runs.ts)
- [Official run documentation](https://multica.ai/docs/tasks): one Issue can have many runs; a normally completed run does not prove the Issue is done.

**Plane** keeps human comments and immutable property-change activities in the work item's activity area. Its Community renderer has distinct components for creation, state, title/description, assignee, priority, dates, relations, labels, attachments and other Issue fields, with activity filtering. Its current **Pro Agent sessions documentation** also explicitly describes an Agent/status header on an Agent comment, with `Open sidecar` to inspect the session. Reasoning/actions collapse after completion; the final response or question remains readable. This is evidence that a compact status beside an Agent reply can be useful, not evidence for Orvilo's exact `Awaiting verification` badge or a permanently expanded execution transcript.

- [Plane comments and activity documentation](https://docs.plane.so/communication-and-collaboration/comments-and-activity)
- [Plane Agent sessions documentation (Pro)](https://docs.plane.so/ai/agents/agent-sessions)
- [Community activity renderer at `bab49bb978ccb56af1d78dec6c6d54dfe8d03c1c`](https://github.com/makeplane/plane/blob/bab49bb978ccb56af1d78dec6c6d54dfe8d03c1c/apps/web/components/issues/issue-detail/issue-activity/activity/activity-list.tsx)
- [Community activity filter](https://github.com/makeplane/plane/blob/bab49bb978ccb56af1d78dec6c6d54dfe8d03c1c/apps/web/components/issues/issue-detail/issue-activity/activity-filter.tsx)

The references were inspected through official documentation and pinned public source in this research run. Authenticated competitor interactions and responsive behavior were not exercised. The supplied Orvilo screenshot is the evidence for the current crowded activity area.

## Proposed information placement

| Information                                                                                                     | Proposed placement and rule                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Human comments, Agent answers, decisions and blocker explanations                                               | Main Activity; substantive text is readable. Group an Agent's reply with its triggering thread, rather than repeating the same output as another run card.                                                                                |
| Issue creation, meaningful state/assignee/reviewer/description/dependency changes                               | Compact Activity rows: who, what changed, time. Preserve audit records; presentation can group related edits from one sitting.                                                                                                            |
| Current work or a needed user reply                                                                             | One current status near the relevant Issue/Agent reply. Show the actual state and a useful reason; never treat a completed run as a completed Issue.                                                                                      |
| Every execution and retry                                                                                       | Separate Execution log or collapsible panel. Active executions and a few recent past runs are enough by default; full history remains accessible. Three recent past runs is Multica's observed limit, not an approved Orvilo requirement. |
| Child-Issue execution rounds on a parent Issue                                                                  | Parent shows child progress and links. Each child owns its detailed run history; do not expand every child's every retry into the parent's default Activity. A family-history view can be available when requested.                       |
| Tool calls, reasoning, model/token/cost data, trigger provenance, attempt numbers, raw errors and engine events | Run detail/sidecar. Surface a short actionable error in the main view only when it blocks progress or requires the person to act.                                                                                                         |
| Deliverables and verification evidence                                                                          | A result/attachment area and the run's acceptance detail. Main Activity may link to a delivery; do not duplicate the whole result/checklist there.                                                                                        |

These are Orvilo recommendations informed by the references. They do not mean blindly copying Plane Pro's approval controls: #771 confirmation remains the person's conversation reply, with no Start/confirm button.

## The two questioned labels

**`Goal loop`** is frontend-owned legacy provenance copy. `TopicCard.tsx` currently maps the canonical backend trigger `orchestrationWorkflow` back to the old `taskDetail.runTrigger.goal` translation key. The default/English value is `Goal loop`, and Chinese is `目标驱动`. Frontend cleanup should remove that adapter and use the complete new term where provenance is shown. The proposal is to keep provenance in run detail by default, rather than repeat a long orchestration workflow badge beside every historical run.

**`Awaiting verification`** comes from `RunVerifyTag.tsx` and `taskDetail.runVerify.pending`, using `activity.verify` (`TaskRunVerifySummary`). It means the verification session has no verdict yet. It does **not** establish that the worker has finished: a planned verification session can be pending while the worker still runs. The earlier conversational explanation “execution has ended” was too strong.

Frontend should combine `activity.status` with `activity.verify.status` when choosing the primary presentation:

| Observed backend state                            | Proposed user-facing interpretation                                                                                          |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Worker is active; verification is planned/pending | Execution is in progress. Do not also imply execution has finished and is awaiting acceptance.                               |
| Worker finished; verification is pending          | Execution finished, acceptance pending. This may be one compact run state.                                                   |
| Verification is running                           | Acceptance is in progress.                                                                                                   |
| Verification passed                               | Acceptance passed, retaining the distinction from the Issue's business status.                                               |
| Verification failed                               | Acceptance did not pass; expose the actionable finding.                                                                      |
| Verification errored/unavailable                  | Acceptance is blocked; expose its reason, such as an unbound reviewer device. Do not present this as normal waiting forever. |

The actual copy and layout remain frontend work. No translation or component behavior is changed by this backend PR.

## Backend contracts ready for the frontend

`orchestrationWorkflow.pause/resume`, `listDecisions/decide`, `listIssues`, and `getStatus` cover the conversation card. Reads are scoped and do not hydrate graph artifacts. `listIssues` includes parent, assignee/reviewer, dependencies and canonical Issue status; the reviewer comes from the current Acceptance policy. `getStatus` distinguishes awaiting reply, decisions, disabled dispatch, offline coordinator device, planning and pause. Per-run execution and verification are separate axes in the existing Issue activity payload and should not be inferred from the orchestration workflow's status alone.

On a revised split the server follows current parent/child Issue contracts, rebinds terminal acceptance criteria, reposts the full split, and resets the reply boundary. The pending split remains excluded from intake/dispatch. Ordinary Backlog intake remains unchanged.
