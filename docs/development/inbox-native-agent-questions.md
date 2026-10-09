# Inbox native Agent questions and Issue updates

Inbox is a projection of existing sources. It never owns a second question queue, a second answer
transport or a second notification store.

## Native Agent questions

A local ACP Agent that asks the user a question persists a tool message whose plugin is
`askUserQuestion` with `intervention.status = 'pending'`. The persisted intervention now also
carries the `operationId` of the run that asked.

`NotificationModel.syncNativeInterventions` turns that message into one Inbox action card:

- `type = 'native_intervention'`, `actionKind = 'acp_intervention'`, `actionRequestId` is the tool
  message ID, `resourceType/resourceId` point at the linked Issue.
- `metadata.nativeIntervention` stores only correlation IDs: Agent, message, operation, tool call,
  topic and thread. The card content is the question text; answers are never copied into the
  notification.
- It runs when the message service writes an intervention and when the Inbox loads its pending
  action sources, so a card missed by one path is repaired by the other.

Who receives the card is decided in that one query. The message, its plugin row and the Issue run
(`task_topics`) must all belong to the current user, in the current workspace scope, and the Issue
must pass the same live task ACL that `resourceReadable` applies to every Inbox row. A card is only
kept open while the intervention is pending and the run is `running`; otherwise it is resolved.

Inbox detail mounts `InboxNativeIntervention`, which renders the original tool message with the
existing conversation `Intervention` form inside the original Agent/topic/thread context. The answer
goes through the existing `submitHeteroIntervention` action:

- Local desktop runs reply over IPC to the bridge of the original operation and tool call.
- Remote runs call `aiAgent.submitHeteroIntervention` with the operation ID stored on the question.

The message stays `pending` (`resolving: true`) until the producer accepts the reply. A missing
message, tool call, operation or bridge slot is an error, not a silent success: the desktop
controller and `AskUserBridge.resolve` report whether the tool call was actually consumed, the
pending state is restored, and the user sees `inbox.question.replyFailed`. Native question cards
expose no generic approve/decline verbs.

## Issue updates

Comment and run-completion notifications reuse the event outbox and notification tables.

- `TaskModel` writes `task.comment.created|updated` for human comments; `TaskTopicModel` writes
  `task.run.completed|failed` when a run changes to a terminal status.
- `NotificationProjectionService.resolveIssueTargets` selects recipients from the Issue creator,
  assignee and active subscribers, plus members newly mentioned in the persisted comment. The actor
  is excluded. Each candidate must be an active workspace member, must be able to read the Issue
  through `TaskModel.findById`, and never receives another user's private comment.

## Read, snooze and delete

Read/unread and snooze keep their existing persisted writes. The row action is now
"Delete notification": `notification.dismiss` deletes the row under the caller's scope with an
`activityVersion` compare-and-swap, and records a `notification-dismissal` receipt so source repair
does not recreate a deleted action card. Deleting a notification does not answer or cancel the
underlying question.
