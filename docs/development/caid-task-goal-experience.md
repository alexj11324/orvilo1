# P17 — CAID task and goal experience

Verification record for the plan item `feat/caid-task-goal-experience` (deps:
P08 `docs/unified-execution-targets`, P12 `feat/caid-plan-revisions`, P15
`feat/caid-verified-integration`, P16 `feat/caid-recovery-and-human-gates`).
The item asks for a coordinated-execution surface a person can understand and
control — not a new analytics dashboard or a second kanban — with every UI
operation mapping to an already permission-gated service and no placeholder
controls.

## Existing surface (audited, unchanged)

- **Plan approval.** Goal creation is a two-step review (acceptance criteria
  are drafted, then edited or approved) and every agent-proposed `createGoal`
  goes through the always-on human intervention card.
- **Pause / stop / resume.** `GoalDetailPage` exposes pause/resume gated by
  `create_content`; P16 fences dispatches behind the owning goal's status so a
  pause cannot be overwritten by a stray tick, and goal delete drains running
  work before removing the graph.
- **Decision gates.** Frontier rows expand into the full case — the gate
  question, per-option descriptions, and the attempt ledger — and `decide`
  resolves through the permissioned router.
- **Retry, PR, artifacts, evidence.** `RunIntegrationTag` already gives each
  run's branch the state chip + evidence tooltip + retry (`publish_failed` /
  `verification_pending`) + PR link on the task detail; deliverables are
  `produces` edges on the graph, opened from the node and the goal-level
  artifacts list.
- **Not-finished reads.** `acceptances`, `deliveredAt` and `runHeartbeats` on
  the snapshot already distinguish "delivered, being verified" from running
  and from lost.

## Changes in this PR

### Every node shows where its delivery stands

`GoalGraphSnapshot` gains `integrations`: the newest run's
`task_topics.integration` record per task node (with its `topicId`, so retry
and PR links can address the run row). `GoalService.collectIntegrations` joins
the same `findWithHandoffByTaskIds` query the delivered-at collector uses —
newest run wins, `skipped` rows are dropped (they mean "nothing to
integrate"), and a goal with no provisioned runs ships no field.

The read model lifts it onto `GoalNodeView.integration`, and the existing
`RunIntegrationTag` renders it — unchanged — in three places a person already
looks: the frontier row's right-hand cluster, the graph card's metric strip,
and the goal-metric Tasks list. The chip carries the states a reader acts on:
`pending` (awaiting merge), `merging`, `verification_pending`, `conflict`,
`publish_failed`, `blocked`, `integrated` — with branch→base, conflicts, the
recorded error, and the PR link in the tooltip. A child task finishing and its
work landing are now visibly different states.

### Parallelism is an editable budget

`GoalConfig.maxConcurrentTasks` existed server-side (`resolveMaxConcurrentTasks`,
default 3, ceiling 10, enforced at dispatch selection) but had no write path
outside goal creation. It is now a first-class control:

- `goal.setBudget` accepts `maxConcurrentTasks` (1–10, null clears to the
  default) alongside cost/rounds/deadline; the service merges it into
  `config` under the same "omitted means untouched" contract.
- The goal-metric Budget panel gains a third field — in-flight tasks /
  parallelism cap — reusing the commit-on-blur `BudgetField`, now keyed by a
  `field` prop whose bounds mirror the router's zod contract.
- The create-goal review step offers the same knob (blank = coordinator
  default), as does the `createGoal` intervention card, and the tool's
  manifest documents the parameter so an agent can set it; both client and
  server executors clamp through the shared `resolveGoalConcurrency`.

## Explicit non-changes (per the item's boundary)

- **No merge-authorization knob.** Merge authority remains CI + review +
  `verification_pending` evidence from P15; no new config pretends to grant
  it. The plan's "合并授权" is answered by the real gate, not a switch.
- **No "collaboration mode" switch.** Dispatch fan-out is the parallelism cap
  above plus the existing goal model; there is no second mode to fake.
- **No new CAID menu, no standalone Acceptance page, no second kanban.**
  Every addition lands on the existing goal surface (frontier, graph, budget
  drill-down, create modal, intervention card).
- **No placeholder actions.** Retry routes through the permissioned
  `task.retryIntegration`; every other visible control was already wired.
