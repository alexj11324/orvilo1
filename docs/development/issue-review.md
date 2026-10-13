# Issue review

Acceptance criteria belong in the editable Issue description. The description is
stored in `tasks.instruction`; `tasks.description` is a short summary. The
Orchestrator writes criteria into the description when it creates an Issue.

```text
Assignee delivers → In Review → Reviewer Agent
                              ├─ pass → Done
                              └─ fail + comment → In Progress → Assignee repairs
```

The Issue shows its status, description, reviewer, comments and activity. A
reviewer comment is an ordinary Issue comment authored by that Agent.

## Reviewer assignment

The reviewer property holds one Agent. `workflow_category = 'in_review'`
requires `reviewer_agent_id` at the database boundary, including custom states
in that category. Entering review from the UI without a reviewer opens the Agent
picker. Deleting an assigned reviewer is blocked with the affected Issue names.

If the assignee delivers without a reviewer, the Issue stays In Progress and the
workspace Orchestrator is asked to name one. It then enters In Review. There is
no default reviewer or fallback to a different Agent. A person can assign the
reviewer before delivery or while assignment is waiting.

## Review and repair

Each review starts a fresh ACP session using the reviewer's saved device, model
and user-authored instructions. The request contains the Issue title and
description, delivered final reply and working directory when available. It
asks for one `submitTaskReview` call: `pass`, or `fail` with a comment explaining
what is missing. Orvilo does not add a reviewer persona.

A pass moves the Issue to Done. A failure posts the comment, moves the Issue to
In Progress and automatically starts its assignee with that feedback. After
`MAX_CONSECUTIVE_REVIEW_FAILURES` (three), automatic repair stops. The Issue
remains In Progress, receives a stop comment, and notifies its human assignee's
Inbox, falling back to the creator when no human assignee is set.

Workflow nodes finish when their Issue reaches Done. They do not read a
separate acceptance decision. A person can override the outcome by changing
the Issue status; late reviewer results cannot overwrite that change.

## Waiting and retry

An offline reviewer uses the ordinary device queue. The Issue remains In Review
and records a plain activity with the waiting reason. Reconnect launches the
queued operation. A timeout, crash or reply without a verdict leaves the Issue
In Review and eligible for the next retry sweep.

Recovery checks the desktop run registry before replacing an unresponsive run.
A quiet active session continues; an offline or uncertain host retains its
operation binding. Only a confirmed ended run can be retried.

The picker disables runtimes that cannot mount the verdict tool and explains
why. The current `pi-acp` adapter does not forward managed MCP servers to `pi`,
so it cannot be selected as reviewer. The CLI write-back path is postponed.

## Development verification

Use the real local Electron app and two saved OpenCode Agents on
`opencode/mimo-v2.6-flash-free`. Capture the automatic fail → repair → pass
sequence, offline waiting and reconnect, and the three-failure stop. Attach
screenshots or transcripts to the PR with the tested source revision. Local
evidence does not prove a cloud deployment.

[The post-removal Electron and migration receipt](./issue-review-evidence/cd7c40d33/README.md)
records the source revision, automatic review loop and its observed delays.
