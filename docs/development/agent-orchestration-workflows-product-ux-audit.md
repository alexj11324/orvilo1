# Agent Orchestration workflows product and UX audit

## Scope

Audited the complete implemented journey:

```text
Topic Orchestration workflow lab gate
  → Agent navigation
  → Orchestration workflow list
  → Orchestration workflow detail
  → Acceptance checks and latest result
  → Task execution plan
  → Agent runs / operations
```

Evidence sources: task and acceptance domain types, Task lifecycle/store behavior,
Orchestration workflow list/detail routes, Agent navigation, Acceptance bundle hooks, and browser
verification against representative local data.

## Product model

| Concept                | Business role                                                        | Terminal fact                                                                                  |
| ---------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Orchestration workflow | Stable result the Agent keeps pursuing                               | The user-visible objective remains stable while its plan and runs change                       |
| Acceptance             | Decision contract and evidence for whether the result is good enough | Human acceptance closes the delivery lifecycle; verifier output is supporting evidence         |
| Task                   | Current executable plan for pursuing the Orchestration workflow      | Task status describes execution, not Orchestration workflow success                            |
| Task execution         | One scheduled/manual/heartbeat attempt represented by a task topic   | Produces an execution outcome and may trigger verification or another round                    |
| Agent run              | Gateway operation actually executed by an Agent                      | Supplies execution provenance; it does not by itself mean the Orchestration workflow succeeded |

The UI therefore treats Orchestration workflow as the lookup object, Acceptance as attached proof,
and Task/Agent Run as drill-down execution evidence.

## User view model

When a user opens Orchestration workflows, the first scan must answer:

1. What outcomes is this Agent pursuing?
2. Which orchestration workflows need attention and how close are they to acceptance?
3. On a Orchestration workflow, what exactly is the target?
4. How much execution has happened (Task executions and Agent runs)?
5. What is the latest acceptance result, and what evidence supports it?

Chronology, task configuration, individual topics and operations are secondary
audit dimensions. They remain accessible through the execution-plan drill-down.

## Implemented corrections

- Orchestration workflow list defaults to a dense list for scanning and supports explicit List/Card switching.
- Orchestration workflow detail begins with the complete Orchestration workflow definition.
- The first screen then shows Acceptance progress, Task execution count, Agent run
  count, round budget, and the latest acceptance result.
- Acceptance checks are displayed as the proof attached to the Orchestration workflow, not as an
  unrelated report.
- Current execution plan is secondary and links to the existing Task Detail.
- Loading, transient error, not-found and lab-gated deep-link states are distinct.

## End-to-end audit

| Stage       | Expected behavior                                                                           | Result  |
| ----------- | ------------------------------------------------------------------------------------------- | ------- |
| Gate        | Disabled lab hides navigation and redirects Orchestration workflow deep links               | Covered |
| Entry       | Orchestration workflow is an Agent-level destination                                        | Covered |
| Browse      | Default list supports fast comparison; Card view remains available                          | Covered |
| Inspect     | Orchestration workflow definition and progress lead; execution internals are secondary      | Covered |
| Judge       | Acceptance checks and latest result are visible                                             | Covered |
| Investigate | User can open the underlying Task execution plan                                            | Covered |
| Recover     | Fetch errors offer retry; missing Orchestration workflow is not reported as a network error | Covered |

## Honest remaining boundaries

### Direct Orchestration workflow creation — not modeled as a management-page event

Orchestration workflows are currently created through the `/orchestration workflow` conversation flow, which creates
the orchestration-workflow-marked root Task and Acceptance contract. The Orchestration workflow page has no standalone
create event or form contract. Adding a decorative Create button would promise a
business event that does not yet exist. A future slice should first define whether
creation starts a conversation draft, creates a durable Orchestration workflow immediately, or opens
a structured contract editor.

### At-scale browsing — data capability required

The current Orchestration workflow query is capped at 100 records and has no cursor/search contract.
The view is suitable for the current Agent-level collection, but a 10k Orchestration workflow manager
requires server-side pagination, search, sort and status facets so counts and empty
results remain truthful across the full set.

### Dedicated Orchestration workflow lifecycle actions — intentionally delegated

Pause/resume/run controls currently belong to the underlying Task execution model.
Before adding Orchestration workflow-level controls, the controller must define their business event:
whether they pause scheduling only, suspend all external wakes, or terminate the
Orchestration workflow contract. Until then, Orchestration workflow Detail links to Task Detail rather than presenting
ambiguous controls.

## Coverage signal

- High confidence: navigation, gate, list/detail information architecture,
  Acceptance projection, Task drill-down, local loading/error behavior.
- Medium confidence: Agent run count is derived from persisted/running operation
  provenance in task activities; the future dedicated Orchestration workflow model should expose an
  explicit aggregate rather than relying on projection.
- Not covered by the current model: controller wake history, cost budget, deadline,
  lease ownership and Orchestration workflow-level pause/terminate semantics described in the broader
  architecture proposal.
