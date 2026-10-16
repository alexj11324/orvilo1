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

`startExecution` stays on the facade as an **ensure-started** assertion: under
ACP every op is dispatched synchronously by `execAgent`/`recordStart`, so there
is no queued step it could ever release. Live runs get an idempotent
`alreadyStarted` ack; terminal/never-dispatched/unknown operations are rejected
with typed errors. See [start-intent-contract.md](./start-intent-contract.md).

New code should depend on the `services/agentExecution` services (or their
types in `agentExecution/types.ts`) directly, not on the facade.

## Skill chips sent to an external CLI

The composer stores a picked skill as `<skill name="…" label="…" />`, which the
message list renders as a chip. An external CLI reads that markup as plain text
and loads nothing. `buildHeterogeneousPrompt`
(`packages/heterogeneous-agents/src/protocol/promptEngine.ts`), the one prompt
builder every heterogeneous transport goes through, rewrites each chip to
`/name` in the text sent to the CLI. The stored message is not changed.
Agent-document skills (`agent-skills:` names) are Orvilo's own and are left as
they are.

A CLI treats `/name` as a command only at the start of the message, so a chip
picked first invokes the skill; a chip later in the text reads as a mention.

For the same reason the `/` menu of an external CLI Agent lists only the skills
found on its device (`resolveSlashInstalledSkills`). Orvilo's installed skills
are not commands of that CLI.
