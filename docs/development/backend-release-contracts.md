# Backend release contracts

This handoff records the backend contracts delivered for [#715](https://github.com/alexj11324/orvilo1/issues/715). The launch uses ACP runtimes; builtin Harness execution and provider bindings remain available on the server. Frontend presentation and real Electron acceptance are separate work.

## Login, invitations, and workspaces

- Desktop OIDC failure redirects contain only `reason=invalid_request` or `reason=internal_error`. Exception details stay in server logs; clients must not expect `errorMessage` in the URL.
- `workspace.create` and `workspace.update` report slug conflicts as tRPC `CONFLICT` with `message=WORKSPACE_SLUG_TAKEN`. Attach this error to the slug field.
- Successful `invitation.accept` persists `onboarding.finishedAt` as an ISO timestamp and the current onboarding version. The response remains `{ alreadyMember, workspaceId }`. Refresh user state after acceptance. Existing completion timestamps remain intact; retries repair missing completion.
- Desktop `authorizationFailed` carries `{ code, error }`. `auth.requestAuthorization` returns `{ success: false, code, error }` on failure across IPC. `connectRemoteServer` rejects an Error carrying `.code`, and `remoteServerSyncError.code` retains it. Consumers must handle the rejection.
- Authorization codes are `timeout`, `network`, `invalid_url`, `denied`, and `server_error`. Pending handoff expiry is `timeout`; HTTP 401/403 and state mismatch are `denied`. Do not parse localized messages for classification.
- Successful authorization foregrounds the main window. The stable protocol remains `orvilo://`; existing channel-specific schemes remain unchanged.

**Client status.** Workspace settings and the onboarding wizard attach `WORKSPACE_SLUG_TAKEN` to the URL field. The invitation page refreshes user state and the workspace list before navigating. The desktop sign-in failure page maps `reason` to a localized explanation and renders no URL text. The login step, the session-expired dialog and the local device status choose their message from the authorization `code`. Invitation failures still show the server's English sentence because no code is sent for them.

## ACP planning and optional model work

Pass optional `agentId: string` to `verify.generateOrchestrationWorkflowCriteria`, `verify.generateOrchestrationWorkflowPlan`, `task.analyzeIntent`, and `task.synthesizeInstruction`. Criteria, decomposition, and exploration for ACP use one tracked ACP round. The CLI must submit the validated result; prose alone is not accepted.

`orvilo orchestration-workflow submit-draft --token <turn> --file <json> [--operation <id>]` defaults the operation ID from `ORVILO_OPERATION_ID`. `orchestrationWorkflow.submitOperationDraft` and `orchestrationWorkflow.submitDraft` accept `{ operationId, token, result }` and return `{ success: true }`. Submission requires the exact actor/workspace, current token, running operation, and declared planning schema. The operation endpoint also requires its operation-bound ingest credential.

| Condition                                                 | tRPC code             | Message                             |
| --------------------------------------------------------- | --------------------- | ----------------------------------- |
| Submission authorization fails                            | `FORBIDDEN`           | `ACP_PLANNING_SUBMISSION_FORBIDDEN` |
| Planning turn ended                                       | `CONFLICT`            | `ACP_PLANNING_TURN_ENDED`           |
| Result already submitted                                  | `CONFLICT`            | `ACP_PLANNING_ALREADY_SUBMITTED`    |
| Invalid planning result                                   | `BAD_REQUEST`         | `ACP_PLANNING_SCHEMA_MISMATCH`      |
| Optional intent/instruction lacks usable builtin provider | `PRECONDITION_FAILED` | `TASK_INTENT_UNAVAILABLE`           |
| Optional expertise drafting lacks usable builtin provider | `PRECONDITION_FAILED` | `EXPERTISE_UNAVAILABLE`             |

Expertise ingestion instead returns `{ ingested: 0, reason: 'EXPERTISE_UNAVAILABLE' }` without calling a model. Preserve the user's input when optional work is unavailable. Builtin owners retain their model bindings; ACP optional work only uses an explicitly available builtin fallback.

Orvilo automatic memory extraction is limited to builtin-runtime topics, including direct/forced extraction. ACP/native session memory belongs to the selected CLI. Historical memory is retained; no CLI instruction/configuration files are rewritten. Skipped extraction retains `{ extracted: false, layers: {}, memoryIds: [] }` and the existing trace ID. Builtin memory UI is withheld independently of provider-settings flags: desktop/mobile settings, command-menu memory results, `/memory` pages, and `/settings/memory` are unavailable. Existing storage, APIs, and CLI-native memory remain intact; this is a presentation boundary, not deletion or an authorization boundary.

**Client status.** The inline Issue composer sends its assignee as `agentId` to intent analysis and instruction synthesis, and the orchestration workflow modal forwards its agent to `verify.generateOrchestrationWorkflowPlan`. Expertise drafting shows a neutral notice for `EXPERTISE_UNAVAILABLE` and keeps the description.

## Orchestration and delivery

| Response                                                                | Field                          | Meaning                                                              |
| ----------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------- |
| `orchestrationWorkflow.graph.data`, `task.detail.data`                  | `orchestrationAdmission`       | `enabled` or `disabled` for the requesting user and active workspace |
| Same                                                                    | `orchestrationAdmissionReason` | `null` or `caid_dispatch_disabled`                                   |
| `task.detail.data`                                                      | `dispatchWaitingReason`        | Active dispatch's persisted reason, or `null`                        |
| `orchestrationWorkflow.tick.data`, `orchestrationWorkflow.advance.data` | Optional `reason`              | `caid_dispatch_disabled` when admission prevents dispatch            |

Admission describes permission for new dispatches, not interruption of existing runs or proof that every graph node is blocked. A persisted waiting reason can remain after admission opens. Shared additions are optional for older payloads. The `caid_dispatch` default is unchanged and must not be flipped until orchestration acceptance is complete.

Repository-bound ACP/device and sandbox completion enter existing `verification_pending` delivery review. The server owns PR establishment, CI/review checks, accepted-head validation, merge-intent compare-and-set, and reconciliation. Agents no longer receive instructions to merge/push the base. A changed accepted head waits with `task.error`; exhausted verification retains `blocked` and `integration.lastErrorCode=remote_verification_unavailable`. Local-only conflict correction stays in its isolated integration worktree. Unknown merge outcomes must be reconciled before retrying a mutation.

**Client status.** A orchestration workflow shows one line under its current tasks while admission is `disabled`. An Issue explains execution in one place, the Execution area of its properties, and shows a dispatch notice there only while its dispatch is requested or waiting. One line is shown: the dispatch's own waiting reason when it has one (`no_eligible_agent`, `execution_agent_missing` and `orchestration_workflow_paused` are localized; any other reason is shown as its raw code), otherwise the admission line while admission is `disabled`. A dispatch that is `waiting` with `caid_dispatch_disabled` while the payload reads `enabled` is still explained (admission in the payload is computed for the viewer, automatic intake is admitted under another identity), worded as what held the run rather than as the current gate. Admission never hides a run action. The Issue header offers Stop while a run is in progress and the schedule control while the Issue is scheduled, and never a start: an Issue starts when it is assigned to an agent and moved to In Progress. The Execution area offers Resume after a stop and Retry after a failure (the server parks both, and automatic intake skips parked Issues), and Start for an Issue that is In Progress with an agent and has no run; the overflow menu offers Run again after a run succeeded. The only state with no action is an active dispatch (requested, claimed, waiting, or running), which the server protects by refusing a second start. Every one of these actions, and the run a move to In Progress starts, takes the contract-checked run path: pending constraint edits are confirmed first and the run is sent as `repair`. The Automations list's "Run now" does not take that path. A closed Issue (Done or Canceled) offers no run action and says to reopen it. When the viewer may not run the assigned agent, the action is disabled and the reason is shown next to it.

## Issue hierarchy and relations

`task.setParentBatch` takes `{ parentTaskId, taskIds }` (1–50 Issues) and needs the same permission as `task.update`. It validates the selection as a set and writes it in one transaction; one refusal rolls the whole batch back. `task.update` with a parent and `task.setParentBatch` both re-validate in the writing transaction under the graph lock of the request's scope and of each linked Issue's own scope (its workspace, or its owner when it has none), taken in sorted order; an assignee's membership row is locked before any graph lock. A parent chain that does not reach a root within 200 levels is refused with `BROKEN_PARENT_CHAIN`.

A new parent link must stay inside one scope: both Issues in the same workspace, or both unfiled and owned by the same person. `task.update`, `task.setParentBatch` and `task.create` with a `parentTaskId` refuse anything else with `CROSS_SCOPE`. Links that already cross scopes are not rewritten; removing such a parent, or replacing it with a same-scope one, works. If an Issue in the write changed scope or was deleted between the read and the lock, the write is refused with `CONFLICT`.

`workAttention.search` accepts optional `eligibleFor: { taskId, relation }` with `relation` of `child`, `parent` or `dependency`. Task hits are then limited to the anchor Issue's project and to Issues that can take that link; for `child` and `parent` they are also limited to the anchor's scope. Task hits also carry `parentIdentifier`, which is `null` when there is no parent or the caller cannot read it.

Refused parent and relation writes carry a stable `code` in the error data: `CYCLE`, `CROSS_PROJECT`, `UNFINISHED_PREREQUISITE`, `SELF`, `ALREADY_BLOCKING`, `UNAVAILABLE`, `BROKEN_PARENT_CHAIN` or `CROSS_SCOPE`. Clients word the refusal from the code, not from the message text. An Issue the caller cannot read and an Issue that does not exist both return `NOT_FOUND`.

Deleting a parent Issue does not delete its sub-issues; they become top-level Issues.

**Starts that fail before dispatch.** A start that cannot reach a runtime is a known failure, not an unknown outcome: the run result carries `success: false`, `status: 'error'` and an error code, the dispatch settles as `failed`, and the Issue offers Retry. This includes a failure to sign the token a device or sandbox run reports back with (`OPERATION_TOKEN_SIGNING_FAILED`; the cause stays in the server log because it can name server configuration). `outcome_unknown` is reserved for a start whose request may have reached a runtime.

**Changing the agent of an executing Issue.** `task.update` refuses it with `CONFLICT` and a message that begins `HANDOFF_REQUIRED`; clients match that prefix, not the sentence after it. An Issue is executing while it has an active dispatch, which includes `outcome_unknown`, so the Issue's `status` alone does not predict the refusal. The client answers the refusal by offering the transfer (`task.handoff`) in place of Retry. `task.handoff` normally requires the caller's Use on the agent that is executing as well as on the successor. The Issue's creator and the workspace's owners and admins are exempt from the first: they may take the Issue away from an agent they cannot run, so a withheld or private agent cannot hold an Issue. The successor always needs the caller's Use. The same callers may stop a run (`task.cancelTopic`) without Use on its agent; stopping settles the run's dispatch as canceled whatever live phase it was in, `outcome_unknown` included, so it is the user's way out of an unconfirmed run. When the runtime does not acknowledge the stop, the answer is `CONFLICT` with a message that begins `STOP_UNCONFIRMED`: the dispatch is already `cancel_requested`, the cancellation sweep abandons it after at most five attempts or ten minutes, and the client reports a stop in progress, not a failure. `task.handoff` fences a running execution; when the Issue's dispatch is live but not running (an `outcome_unknown` the recovery sweep has yet to confirm) there is no process to fence, so it answers `CONFLICT` with a message that begins `EXECUTION_UNSETTLED`, and the client says the last run is still being confirmed. The sweep frees the Issue when it settles or abandons that dispatch.

## Issue activity

`task.detail.data.activities` now carries a `type: 'property'` row for every kind of change to an Issue, not only status, priority and automation. A row is written when:

- the Issue moves between workflow categories or team workflow states, by any path: the rail picker, a board drop, triage, a legacy status write, a parent cascade, run settlement or acceptance;
- the title, the description or the acceptance criteria are edited;
- the due date, the project, the milestone or the team changes;
- the parent changes, or a sub-issue is added or removed (the parent gets its own row);
- a relation is added or removed (both Issues get a row), or the Issue is marked or unmarked as a duplicate;
- a label is added or removed, or a link or pull request is attached or removed.

| `propertyChange.field`         | Other fields                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `workflow`                     | `from`, `to`: `{ category, name }`; `name` is the team state name or `null`                        |
| `title`, `dueDate`             | `from`, `to`: string or `null`                                                                     |
| `description`, `verify`        | none; the text is not copied into the feed                                                         |
| `project`, `milestone`, `team` | `from`, `to`: name, `''` when there was one but it cannot be named, `null` when there was none     |
| `parent`, `duplicate`          | `from`, `to`: Issue reference or `null`                                                            |
| `relation`                     | `action`, `relation` (`blocking`, `blocked_by`, `related`, `sub_issue`), `target`: Issue reference |
| `label`                        | `action`, `name`                                                                                   |
| `resource`                     | `action`, `kind` (`link` or `pull_request`), `title`, `url`                                        |

`status`, `priority` and `automation` are unchanged. Clients must ignore a `field` they do not know.

An Issue reference is `{ identifier, name }` when the reader can read that Issue. One that is deleted or outside the reader's access comes back as `{ unavailable: true }`, never `null`: `null` means there was none. Project, milestone, team and team workflow state names follow the same rule. They are shown only when the reader can read that container; otherwise the name is `''`, or `null` for a workflow state, which then reads by category. `project.activityFeed` applies the same check to workflow state names. A container that has since been deleted is treated as unreadable.

Description and acceptance criteria edits by one actor are kept as one row per 30-minute sitting, whose time moves to the latest save. Agent prompts receive only status, priority, automation, workflow category and due date changes; rows that carry typed text are left out of prompts.

`completedAt` is set once when an Issue enters `done` or `canceled`, kept while it stays there, and cleared when it is reopened, whoever made the move. Run settlement still supplies its own instant.

The feed is not an audit log. Rows credited to the system and rows written after the main write (run settlement, cascades, acceptance criteria) are best effort: a failure to record one is logged and does not fail the change. Label and link changes are written together with their row.

## Inbox and external alerts

Relevant Inbox work/action records are durable. Recipient selection, subscriptions, actor exclusion, authorization, and deduplication still apply. This follows the separation documented by [Linear](https://linear.app/docs/notifications) and [Plane](https://docs.plane.so/communication-and-collaboration/notifications).

Legacy `user_settings.notification.inbox` and `workspace_user_settings.preference.notification` remain accepted, stored, and readable, but do not suppress Inbox or override personal external delivery. Remove misleading Inbox opt-outs and workspace notification controls.

Personal `notification.push.enabled` and `notification.push.items.work[event]` control existing external push/desktop callers; missing values default enabled. Event names remain `task_assigned`, `task_review`, `task_status_changed`, `agent_run_completed`, `agent_run_failed`, and `acp_permission`. Expo delivery requires a registered token; desktop run/approval callers exist. This does not promise external delivery for every Inbox event. Email settings are persisted, but the OSS Issue pipeline has no email delivery adapter; do not expose email controls as functioning delivery.

**Client status.** Settings → Notifications shows only the personal push/desktop switches. The Inbox column, the workspace notification page and the settings-search entries for Inbox, email and push anchors are removed; the stored legacy fields are untouched.

`task.detail.data.isSubscribed` reports whether the requesting member follows the Issue. A member is subscribed when they comment, are mentioned, are assigned or are set as reviewer; the subscription keeps its first reason. The Issue's creator and human assignee follow it without a stored subscription; `isSubscribed` is `true` for them and notifications reach them until they unsubscribe, which stores their opt-out. An explicit unsubscribe is never undone by a later automatic subscription, and it stops notifications for the creator and assignee too. Subscriptions move with an Issue that changes workspace. Agents are never subscribed. Recipients are still de-duplicated per member and the actor is excluded, so a subscription does not add a second notification.

Comment activities left on a run carry `replyToRun: { topicId, seq }`; `seq` is `null` when the run is outside the loaded window. `taskMenu.updateLink` takes `{ id, linkId, title }` with a title of 1–255 characters, needs the same permission as `addLink`, never changes the URL and returns `NOT_FOUND` for an unknown link.

## Optional services and topic titles

- Unconfigured Market: tRPC `data.code=SERVICE_UNAVAILABLE`, `data.errorData.code=MARKET_UNAVAILABLE`; skill execution returns `success: false`, `error.code=MARKET_UNAVAILABLE`. Missing/blank `MARKET_BASE_URL` does not contact a hosted fallback.
- Unconfigured Device Gateway: `device.status` adds `errorCode=GATEWAY_NOT_CONFIGURED` while preserving `online: false`, `deviceCount: 0`. Configured but offline remains distinct.
- `AgentStreamEvent` adds `type=session_title`, `data: { title: string }`; its operation/step/timestamp envelope is unchanged. `aiAgent.heteroIngest` accepts it under existing operation/generation authorization. Titles are sanitized; atomic persistence sets `topics.metadata.titleSource=agent` and preserves user-authored titles (`titleSource=user`). Child sessions cannot rename the parent topic. External titles are escaped in server prompts.
- Deploy event acceptance before upgrading standalone CLI producers: older servers reject unknown event types. Consumers may refresh topics on `session_title`; persisted titles survive reload.

## Retired backend compatibility

`followUpAction.extract` keeps its authenticated input contract but returns `PRECONDITION_FAILED` / `FEATURE_RETIRED`, without generation. `UserPreference.lab` is no longer writable/typed/defaulted; legacy input parses and strips the unknown field, without destructive stored-data migration.

Retired system-agent keys are `promptRewrite`, `generationTopic`, `historyCompress`, `translation`, `topicAutoSummary`, `followUpAction`, `inputCompletion`, `topic`, and `agentMeta`. Environment assignments ignore them; active settings retain their permissive compatibility reader. Model selection for title/metadata/handoff/brief work uses the Agent runtime. `orchestration workflow` and `expertise` remain.

Agent-label CRUD/home/transfer paths, translation/TTS APIs and historical import/export/copy/transfer remain supported. Optional per-Agent opening metadata remains. There is no label/translation table deletion or migration. Removing the unused `@lobehub/tts` dependency does not remove persisted TTS compatibility.

## Release and acceptance boundaries

Public stable/beta/canary desktop release assembly admits only macOS ARM64/Intel DMG, ZIP, and `latest-mac.yml` assets. Beta/canary retain Windows/Linux build artifacts for acceptance. macOS signing/notarization and renderer-integrity checks remain required. OSS desktop CI rejects business-mode constants, cloud mode, and external Vite configuration overrides.

Linux has not passed clean-machine installation/start/login/update acceptance in this batch and must not yet be advertised as preview. Windows requires signing configuration and acceptance before official downloads. Historical public assets require human review; these changes do not remove them. No release, deployment, production configuration, or Secrets change is part of this patch.

Unit/integration tests are not Electron acceptance. Claude must verify real browser-to-app login, ACP planning/tool submission and memory ownership, renderer-free topic titles, Inbox controls, unavailable-service explanations, and two-task integration isolation/merge recovery against the final revision. #709 remains open. #566 covers only requested items 1–3; #707 excludes the default flag flip; #568 covers only unconfigured services and OSS desktop build enforcement. #109 and #110 were already fixed on the baseline and receive no speculative patch here.
