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

## Engine capability gating

Tiering picks _which_ agent is cheap enough; capability gating picks _which
kinds of work an agent may run at all_. The two layers compose: the tier
matcher only ever sees agents that pass the capability gate first.

An engine is **mount-capable** when its runtime actually delivers the
`session/new` `mcpServers` payload to the agent — the `orvilo_cc` MCP surface
that carries builtin _tools_ (acceptance evidence, the supervisor's
diagnostic tool, legacy agent-mode Brief). The capability model is split:

- `ACP_RUNTIME_AGENT_TYPES` — transport-capable: the runtime hosts ACP
  sessions. This set alone decides whether builtin tools can _try_ to mount.
- `ACP_MCP_MOUNT_AGENT_TYPES` — mount-capable: a strict subset of the
  transport set minus bridges that accept `mcpServers` and silently drop
  them. `pi` is the known silent-drop case: `pi-acp@0.0.33` stores the
  payload on the session object and never forwards it (pi has no built-in
  MCP support; the upstream wiring PR was closed unmerged), so builtin tools
  would vanish without error. `amp`/`claude-code`/`codex` bridges were
  audited to deliver the payload (CLI flag, SDK option, session config
  respectively); the `acpArgs` entries run the vendor's own ACP
  implementation, which owns `mcpServers` handling end to end.

The shared predicate is `canMountBuiltinToolSurface(binding)` in
`@orvilo/heterogeneous-agents`, lifted to agent records by
`agentCanMountBuiltinToolSurface(agentConfig, model)` in
`aiAgent/pipeline/resolveExecutionBinding` — the same helper that feeds
`resolveRunToolSurface`'s `supportsBuiltinToolMount` flag (which is what
drops builtin specs at dispatch admission). Gates at three loci, all
upstream of dispatch minting:

1. **Intake selection** — when the task's contract requires the surface
   (`taskRequiresBuiltinToolMount`: goal-bound tasks, acceptance-enabled
   tasks, legacy agent-mode briefs), `pickTieredAgent` treats
   mount-incapable roster rows as ineligible for _that_ task. Non-capable
   agents stay fully pickable for normal tasks — they are skipped per task,
   never excluded wholesale. When nothing satisfies, a kept assignee that is
   unusable or mount-incapable yields `blockedReason`
   (`assignee_agent_unusable` /
   `assignee_engine_cannot_mount_builtin_tool_surface`) instead of minting a
   dispatch that can only throw at admission.
2. **Goal binding** — `GoalService.create`/`setAgent`/`restart` reject a
   mount-incapable bound agent with `BAD_REQUEST` (the bound agent executes
   every Task the coordinator creates, and goal work always requires the
   surface). A goal bound _before_ the gate existed is caught at
   `dispatchWork`: the task is parked `paused` with the reason recorded and
   handed to the same manager-or-human gate every unresolvable failure uses
   — no dispatch minted, no admission throw.
3. **Goal supervisor** — its virtual agent is the builtin `orvilo` binding
   (mount-capable by construction), but a heterogeneous goal-model override
   retypes it, so the diagnostic dispatch checks the effective binding and
   escalates the incident immediately instead of parking on the diagnosis
   timeout.

Defense-in-depth stays: `requiredToolIds` still throws at dispatch
admission if a required builtin tool cannot mount. There is no UI picker
that binds a goal to an agent (the create modal forwards a page-context
`agentId`, and `goal.setAgent` is service/TRPC-only), so nothing is grayed
out yet — gating lives entirely at the service layer.

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
