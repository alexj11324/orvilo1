# Model-Intelligence Tiered Orchestration

Tiered routing for backlog intake: every agent on a project roster declares a
capability band, every backlog task carries a required band derived from its
priority, and the intake matcher binds the cheapest band that satisfies the
requirement. A terminally failed orchestrated attempt escalates the next
attempt one band up (FrugalGPT-style cheap-first routing with
escalate-on-failure).

## Carriers

| Signal         | Column                                  | Domain                                                           |
| -------------- | --------------------------------------- | ---------------------------------------------------------------- |
| Agent band     | `project_agents.tier` (text, nullable)  | `'low' \| 'mid' \| 'high'` — `AGENT_TIERS` in `@orvilo/types`    |
| Attempted band | `task_dispatches.tier` (text, nullable) | snapshot of the bound agent's roster band at request/rebind time |
| Required band  | derived — `tasks.priority`              | see mapping below                                                |

`project_agents.role` stays free-form semantics (lead, implementer,
reviewer); it does not encode a capability order, so a dedicated `tier`
column carries the band instead. `task_dispatches.tier` is a snapshot, not a
join — a later roster edit cannot rewrite which band a finished attempt ran
at, which is what makes escalation durable across sweep passes and restarts.
A `NULL` tier means "no band recorded": unbanded roster rows satisfy no
requirement and unrecorded attempts never escalate.

## Required-tier mapping

`requiredAgentTierForPriority` resolves the baseline from the Linear-style
priority integer on the task:

| `tasks.priority` | Meaning | Required tier |
| ---------------- | ------- | ------------- |
| 1                | urgent  | `high`        |
| 2                | high    | `high`        |
| 3                | normal  | `mid`         |
| 4                | low     | `low`         |
| 0 / NULL         | none    | `low`         |

## Intake matching

`sweepTaskBacklogIntake` resolves `resolveBacklogIntakeAssignment` for every
eligible candidate before calling `runTask`:

1. `required = max(priority baseline, escalation)` (see below).
2. `pickTieredAgent` filters the enabled roster (`listProjectAgentRoster`)
   through the existing `orchestrationPolicy` gates — `allowedAgentIds`,
   `allowedRoles` — and keeps only rows whose band satisfies `required`
   (a higher band always satisfies a lower requirement; `low < mid < high`
   is a total order).
3. Among the survivors it picks the **lowest satisfying band** — cheap
   first. The incumbent assignee wins ties so the matcher does not churn
   assignments between equal-cost agents; remaining ties break on roster
   order (`sortOrder`, then `createdAt`).
4. The pick is persisted as `tasks.assignee_agent_id` via
   `updateWithLog(..., { executionTransfer: true })` — the assignee write IS
   the dispatch binding (`dispatch.agent_id` must equal
   `task.assignee_agent_id`), so reassigning is how an escalation actually
   moves the work to a stronger agent, and it lands in the task activity
   feed as an ordinary reassignment.
5. A `null` pick (no satisfying agent — untiered roster, policy gates)
   leaves the assignee untouched and the run proceeds on the pre-tiering
   path: `runTask` enforces the rest (participant enabled, allowed lists,
   budget, concurrency) and parks the durable intent `waiting` when it
   gates. An all-untiered roster therefore keeps today's behavior exactly —
   tiering is opt-in by data, not by flag.

## Escalate-on-failure

`TaskDispatchModel.request` snapshots `task_dispatches.tier` from the bound
agent's roster band at intent creation, at both `waiting → requested`
resume paths, and whenever `transition` rebinds `agent_id`. After a
dispatch settles `failed` or `abandoned` with `requestedBy` starting
`orchestrator:` (intake and other orchestrated dispatchers — manual runs
never escalate), the next intake pass raises the requirement to
`nextAgentTier(failed tier)`:

- `succeeded`/`canceled` verdicts, manual dispatches, and rows with no
  recorded tier do not escalate.
- A failed `high` attempt has no band above it: the requirement falls back
  to the priority baseline and the existing failure path owns the outcome —
  no silent unbounded escalation.
- The escalation signal reads `findLatestTerminalDispatch` (latest
  `canceled|failed|succeeded|abandoned` by `generation`), so `waiting`
  intents in flight never shadow the settled outcome being escalated from.

## Budget guardrail

Nothing new: escalated attempts are ordinary dispatches, so
`projectDispatchWaitingReason` counts them toward
`orchestrationPolicy.executionBudget.maxRuns` (and `maxCost`) exactly like
first attempts. When the budget is exhausted the escalated request parks
`waiting` with `project_run_budget_exhausted` / `project_cost_budget_exhausted`
— escalation can never spend past the project budget.

## Deliberately out of scope

No difficulty classifier or model router, no per-domain benchmarks, no
verifier agent, no UI changes, no new model providers. The `tier` roster
field is editable through `project.addAgent` for now; richer task-side
difficulty hints (planner-issued `requiredTier`) and evidence-driven band
tables are follow-ups once the carrier exists.
