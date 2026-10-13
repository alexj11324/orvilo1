# Orchestration workflow design

An **orchestration workflow (编排工作流)** is the internal engine behind a workspace Orchestrator delivering work through Issues. Users work in the conversation, Issues and the board. The Orchestrator decides whether a request needs an orchestration workflow; questions and quick replies stay in the conversation.

Never shorten this concept to `workflow`. Use `orchestrationWorkflow`, `OrchestrationWorkflow`, `orchestration_workflow` or `orchestration-workflow` according to the naming convention of the surface. The Issue status model's `workflowCategory` and `workflowState` and background-job directories keep their existing names.

## Start and human confirmation

The server mounts `orvilo-orchestration-workflow` automatically for a conversation with the scope's configured Orchestrator. An ordinary Agent, a child Task operation, and an exclusive judgment or supervisor run do not receive this start tool. A runtime that cannot mount the required surface is rejected with `ORCHESTRATOR_RUNTIME_UNSUPPORTED`.

The Orchestrator calls `startOrchestrationWorkflow` with the complete proposed deliverable, acceptance criteria, attempt budget, optional cost budget, deadline and parallelism. The tool's client intervention remains an editable plan. CLI/MCP calls use the existing durable tool-approval receipt: it binds the operation, tool call, complete arguments, schema and current approval window. Only a human-authenticated approval can satisfy it. The host shows the full orchestration plan, then retries the same call. Pending or denied approval creates no orchestration workflow or Issue.

The server stamps `config.planConfirmedAt` only on the confirmed creation path. The coordinator does not advance an unconfirmed row. After a confirmed start the conversation delegates execution to the coordinator instead of doing or duplicating the requested work.

There is no Orvilo slash-command contract for starting this engine. Codex's own `/goal` remains a Codex command.

## Ownership and inference

`AgentModel.getOrchestratorSourceAgentId()` resolves the acting user's configured Orchestrator in the active workspace, or their personal scope. New orchestration workflows are owned by that Agent even when a caller supplies a different current-agent id. Agent-authored creation is refused unless its author is the Orchestrator. Rebinding and restarting under another Agent require selecting that Agent as the scope's Orchestrator first.

`OrchestrationWorkflowService.createResponsibleTask` assigns each created Issue to the orchestration workflow's Agent. The coordinator does not currently choose separate workers per node. Parallelism remains a cap on independent Issue executions, with the existing isolated workspaces and merge-back path.

Criteria drafting, executable decomposition, graph exploration and task-intent analysis/synthesis all use `generateOrchestrationWorkflowObject`. It resolves the scope's Orchestrator and invokes an ACP judgment operation on its execution device with structured tool submission. There is no server-model fallback for these planning calls. Missing setup or an unavailable device is an explicit failure. Manager planning already runs through an Agent operation. The retained acceptance/reviewer engine is separate.

## Persistence and execution

The application stores the definition, lifecycle, budgets and confirmation marker in `orchestration_workflows`; its graph is in `orchestration_workflow_nodes`, `orchestration_workflow_edges`, `orchestration_workflow_node_decisions`, `orchestration_workflow_node_work_versions` and `orchestration_workflow_events`. Aggregate trace information lives in `orchestration_workflow_traces`.

The engine keeps its decomposition, dependency graph, bounded dispatch, decision gates, numeric criteria, retries, Task acceptance, isolated workspaces and merge-back behavior. `caid_dispatch` defaults to `true`; an explicit false override still prevents new orchestrated dispatches. Existing operations retain their settlement and cancellation paths.

Migration `0212_orchestration_workflow` renames SQL tables, columns, indexes and constraints in place. It retains row ids, foreign-key relationships and stored trace locations. It migrates technical keys only in the listed application-owned JSON columns, preserves prose and third-party schemas, and updates the historical acceptance/recovery discriminator strings. The new Drizzle snapshot records the final names for subsequent migrations. No compatibility router, package, tool or command alias is exposed.

## Conversation card contract

All procedures live under `orchestrationWorkflow`. The caller supplies the orchestration workflow id as `id`; no graph-page load is required.

| Procedure       | Input                                       | Result                                                                          |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| `pause`         | `{ id }`                                    | Paused orchestration workflow                                                   |
| `resume`        | `{ id }`                                    | Resumed orchestration workflow; schedules advancement                           |
| `listDecisions` | `{ id }`                                    | Open decisions, including their ids, questions and options                      |
| `decide`        | `{ id, decisionId, optionId, resolution? }` | Records the answer and schedules advancement                                    |
| `listIssues`    | `{ id }`                                    | Issue ids, identifiers, titles, canonical status category and status references |
| `getStatus`     | `{ id }`                                    | State, ownership/project, confirmation marker, admission and waiting reason     |

Waiting reasons distinguish `plan_not_confirmed`, `decision_pending`, `dispatch_not_admitted`, `device_offline`, `planning` and `paused`; terminal states have no waiting reason. Before creation the existing tool-approval card represents the pending proposal. Card reads query only their own rows and do not hydrate graph artifacts, trace history or Work versions.

The frontend owner removes the old pages and entry points and adds these controls to conversation cards. Backend changes follow renamed public references while preserving frontend-owned directories, copy, route parameter keys and persisted UI preferences.
