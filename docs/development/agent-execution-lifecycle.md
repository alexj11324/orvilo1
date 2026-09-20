# Agent Execution lifecycle services

The public lifecycle duties that used to live inside
`apps/server/src/services/agentRuntime/AgentRuntimeService` now live in
dedicated services under `apps/server/src/services/agentExecution/`:

| Service                              | Duty                                                      | Entry points                                                                                            |
| ------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `OperationStatusService`             | Status queries and state-snapshot reads                   | `getOperationStatus`, `loadAgentState`                                                                  |
| `InterventionService`                | Human-intervention (approval) surface                     | `getPendingInterventions`, `ensureInterventionContinuationStarted`, `loadInterventionContinuationState` |
| `OperationInterruptService`          | Cancel bookkeeping (sentinel-first interrupt)             | `interruptOperation`                                                                                    |
| `ChildRunService`                    | Child-run completion bridges and async-tool parent resume | `completeSubAgentBridge`, `completeGroupActionMember`, `tryResumeParentFromAsyncTool`                   |
| `CompletionLifecycle` (pre-existing) | Terminal settlement and completion hooks                  | `complete*`                                                                                             |

All four services share one `AgentExecutionServiceDeps` (state manager,
stream manager, scoped `AgentOperationModel`/`MessageModel`, `userId` and
`workspaceId`), so workspace/visitor ownership checks behave identically to
the old facade.

## Compatibility facade

`AgentRuntimeService` is retained as a thin forwarding shell so the existing
trpc procedures (`aiAgent.getOperationStatus`, `getPendingInterventions`,
`interruptTask`, `startExecution`), the hono completion callbacks
(`subAgentCallback`, `groupMemberCallback`, `finalizeAbandoned`), and the
`aiAgent` service delegation keep working unchanged. It builds the shared
deps once and forwards each call exactly once — no duplicated side-effects.

`startExecution` stays on the facade: under ACP every op is dispatched
synchronously by `execAgent`/`recordStart`, so the lobehub-era queued start
is already a validate-only compat surface (`scheduled: false`); retiring or
replacing it belongs to the queued-intent PRs.

New code should depend on the `services/agentExecution` services (or their
types in `agentExecution/types.ts`) directly, not on the facade.
