# ACP Judgment Closure (R08)

The in-process Lobe agent loop is retired. All retained machine judgments —
planning, Verify judges, reflection, routing classifiers — run as explicitly
authorized ACP operations. Deployment-level provider credentials
(`{PROVIDER}_API_KEY` / `{PROVIDER}_PROXY_URL` via
`initModelRuntimeFromDeploymentConfig`) are **never** an automatic fallback for
a judgment: a consumer with no resolvable binding receives an explicit block
(`AcpJudgmentBindingError`, code `ACP_JUDGMENT_NO_BINDING`) it must surface.

## The split contract — `AiGenerationService.generateObject`

`apps/server/src/services/aiGeneration/index.ts` exposes a discriminated
union:

- `kind: 'judgment'` — retained machine judgment. Requires
  `judgment: { binding, purpose, attempt?, fileIds?, maxSteps?,
parentOperationId?, taskId?, timeoutMs? }` and routes through
  `runAcpJudgment` (`services/aiGeneration/judgment.ts`). `input.tools` is
  rejected — judgment runs are tool-free.
- `kind: 'basic'` — an enumerated non-agent exception. `caller` must be one of
  `BASIC_GENERATION_CALLERS` (`asr`, `chunk`, `file`, `image`,
  `knowledgeBase`, `memory`, `ragEval`, `video`, `videoBackgroundPolling`);
  anything else throws before touching deployment config.

Adding a `basic` caller means updating `BASIC_GENERATION_CALLERS`, the
exception table below, and `apps/server/src/acpJudgmentGuards.test.ts`.

## The ACP judgment contract (`runAcpJudgment`)

1. **Binding** (`AcpJudgmentBinding`): `{ agentId? }` pins a user agent;
   `{ slug? }` names a builtin (BUILTIN\_AGENT\_SLUGS). Resolution order:
   `agentId` exists → `slug` resolves → `ACP_JUDGMENT_AGENT_ID` env (agent id
   or builtin slug) unless `allowEnvFallback: false` → `undefined`. `undefined`
   → `AcpJudgmentBindingError`. A pinned `agentId` that no longer exists is a
   hard boundary — `resolveAcpJudgmentAgent` throws
   `ACP_JUDGMENT_NO_BINDING` immediately and never falls through to slug/env,
   because running under a different identity than the caller authorized is a
   silent identity change, not a degrade. The env var is the operator-level
   fallback for consumers with no natural domain agent — it is an agent
   reference, never a key.
2. **Dispatch**: `AiAgentService.execAgent` with `autoStart: true`,
   `disableTools: true`, `trigger: 'acp_judgment'`,
   `userInterventionConfig.approvalMode: 'headless'`, `title:
'[judgment] <purpose>'`, and
   `appContext.judgment = { attempt, budget: { maxSteps, maxWaitMs }, purpose }`.
   `parentOperationId`/`taskId`/`fileIds` propagate to the operation row.
   Model/provider overrides apply only to slug-bound builtins — a pinned agent
   keeps its own runtime config.
3. **Wait**: the total budget deadline is established **before** `execAgent`
   dispatches, so slow dispatch latency counts against `timeoutMs` (default
   180s) — not just post-dispatch waiting. Callers then poll the durable
   `agent_operations` row (default every 1s) for a terminal status
   (`done`/`error`/`interrupted`/`abandoned`). Caller abort and budget expiry
   propagate cancel via `AiAgentService.interruptTask` and re-read the durable
   row to confirm: a confirmed interrupt may report `status: 'interrupted'`;
   an unconfirmed cancel reports `cancelResult: 'unknown'` and the last durable
   status — 'unknown' is never presented as stopped, so a caller cannot
   mistake it for safe-to-replace.
4. **Result**: the run's `assistantMessageId` (operation metadata) is read back
   and JSON is extracted (bare → fenced → embedded object), then validated
   **server-side** against the declared `schema` (ajv). `status !== 'done'`
   or unparseable output → `AcpJudgmentRunError`
   (`ACP_JUDGMENT_RUN_FAILED`, carries `operationId`/`status`/`cancelResult`);
   a schema mismatch on a `done` run → `AcpJudgmentValidationError`
   (`ACP_JUDGMENT_SCHEMA_MISMATCH`, carries `issues`/`operationId`) — the
   payload never reaches the consumer's planning/acceptance write.
5. **Trace**: every run — success or failure — writes an
   `llm_generation_tracing` row stamped with `metadata.operationId`, the
   operation's model/provider/cost/tokens, and `trigger: 'acp_judgment'`;
   `success` requires both a `done` operation AND schema conformance (a
   `done`-but-invalid reply is recorded `success: false` /
   `errorCode: 'schema_mismatch'`); caller `tracing.onPersisted` fires as
   before. Identity, cost, cancel, and evidence are therefore auditable from
   one operation row.

## Consumer classification

Judgment consumers (all `kind: 'judgment'`; binding → purpose):

| Consumer                                                             | File                                      | Binding                                             | Purpose                                                           |
| -------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| Verify llm-item judge                                                | `services/verify/executor.ts`             | `verifierAgentId` → `verify-agent` slug             | `verify.judge`                                                    |
| Verify narrative report                                              | `services/verify/reporter.ts`             | `verifierAgentId` → `verify-agent`                  | `verify.report`                                                   |
| Review predictor                                                     | `services/verify/reviewPredictor.ts`      | `judgmentAgentId` → `verify-agent`                  | `verify.reviewPredict`                                            |
| Criteria/plan generator                                              | `services/verify/planGenerator.ts`        | `verifierAgentId` → `verify-agent`                  | `verify.planGen`                                                  |
| Goal criteria draft                                                  | `services/goal/criteriaGenerator.ts`      | `agentId` → `verify-agent`                          | `goal.criteriaDraft`                                              |
| Goal decompose                                                       | `services/goal/criteriaGenerator.ts`      | goal `agentId`                                      | `goal.decompose`                                                  |
| Goal exploration planner                                             | `services/goal/explorationPlanner.ts`     | goal `agentId`                                      | `goal.explore`                                                    |
| Task intent/instruction                                              | `services/task/intent.ts`                 | `taskAgent` slug                                    | `task.intent` / `task.instruction`                                |
| Task review judge                                                    | `services/taskReview/index.ts`            | `judgeAgentId` (task assignee)                      | `task.review`                                                     |
| Task lifecycle (handoff/brief)                                       | `services/taskLifecycle/index.ts`         | `task.assigneeAgentId`                              | `task.handoff` / `task.briefJudge` / `task.brief`                 |
| Linear coordinator planning                                          | `services/linearSync/coordinator.ts`      | `project.coordinatorAgentId`                        | `linearSync.coordinatorPlan`                                      |
| Follow-up extraction                                                 | `services/followUpAction/index.ts`        | `topic.agentId`                                     | `followUp.extract`                                                |
| Task recommendation writer                                           | `services/taskRecommendation/writer.ts`   | `writerAgent.id`                                    | `onboarding.taskRecommendation`                                   |
| Understanding writer                                                 | `services/understanding/service.ts`       | `writerAgent.id`                                    | `understanding.detailedPersona` / `understanding.personaAnalysis` |
| Topic title / skill meta                                             | `services/systemAgent/index.ts`           | `topic.agentId` / `params.agentId`                  | `topic.title` / `skill.meta`                                      |
| Topic auto-summary                                                   | `services/topicAutoSummary/index.ts`      | `topic.agentId`                                     | `topic.autoSummary`                                               |
| Expertise domain draft                                               | `services/expertise/domain.ts`            | `input.agentId`                                     | `expertise.domainDraft`                                           |
| Expertise topic ingestion                                            | `services/expertise/ingestion.ts`         | `input.agentId`                                     | `expertise.topicIngestion`                                        |
| Signal satisfaction judge                                            | `agentSignal/.../feedbackSatisfaction.ts` | `signal.payload.agentId`                            | `agentSignal.feedbackSatisfaction`                                |
| Signal domain router                                                 | `agentSignal/.../feedbackDomainAgent.ts`  | `signal.payload.agentId`                            | `agentSignal.feedbackDomain`                                      |
| Skill-intent classifier                                              | `agentSignal/.../skillIntent.ts`          | `signal.payload.agentId`                            | `agentSignal.skillIntent`                                         |
| Memory-write decision                                                | `agentSignal/.../actions/userMemory.ts`   | `action.payload.agentId`                            | `agentSignal.memoryWriteDecision`                                 |
| outputJSON (builder suggestions, input completion, group supervisor) | `routers/lambda/aiChat.ts`                | `tracing.agentId` → `tracing.topicId`'s agent → env | `outputJSON.<scenario>`                                           |

### Surfacing the no-binding block

- Routers (`verify.ts`, `task.ts`, `aiChat.ts` via TRPC error mapping,
  `acceptance.ts`) translate `ACP_JUDGMENT_NO_BINDING` → `PRECONDITION_FAILED`.
- The verify executor marks llm check items `status: 'failed'`,
  `verdict: 'uncertain'` — a blocked judgment gates delivery instead of
  degrading to `errored`.
- `taskLifecycle` persists a brief decision with `reason:
'acp_judgment_no_binding'`; goal/followUp callers rethrow to their callers.
- Agent-signal pipelines let it propagate as an explicit executor failure.

## Non-agent exceptions (kind: 'basic' / direct deployment runtime)

These remain on `initModelRuntimeFromDeploymentConfig` — they are perception /
transform base services, not judgments:

| Consumer                                                 | File                                                                       | Caller id                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------- |
| ASR transcription                                        | `routers/lambda/asr.ts`                                                    | `asr`                               |
| Chunk/embed pipeline                                     | `routers/lambda/chunk.ts`                                                  | `chunk`                             |
| File processing                                          | `routers/async/file.ts`                                                    | `file`                              |
| Image understanding                                      | `routers/async/image.ts`                                                   | `image`                             |
| Knowledge-base retrieval                                 | `services/knowledgeBase/index.ts`                                          | `knowledgeBase`                     |
| Memory embeddings                                        | `toolExecution/serverRuntimes/memory.ts`, `routers/lambda/userMemories.ts` | `memory`                            |
| RAG eval                                                 | `routers/async/ragEval.ts`                                                 | `ragEval`                           |
| Video processing                                         | `routers/async/video.ts`, `routers/lambda/video/index.ts`                  | `video`                             |
| Video background polling                                 | `services/generation/videoBackgroundPolling.ts`                            | `videoBackgroundPolling`            |
| Media understanding inside the orvilo-agent tool runtime | `toolExecution/serverRuntimes/orviloAgent.ts`                              | (direct — perception, not judgment) |

The textual allowlist is enforced by `apps/server/src/acpJudgmentGuards.test.ts`.

## Rollback boundary

Judgment disablement is **not** "unset `ACP_JUDGMENT_AGENT_ID`" — explicit
domain bindings still authorize runs. Disabling judgments requires the shared
admission boundary (the `caid_dispatch` gate for CAID-originated work, plus
consumer-level `allowEnvFallback: false`); unsetting the env var only narrows
resolution to explicit bindings. Reverting the R08 commit restores the
pre-R08 judgment call graph but does NOT restore a deployment-key fallback —
that capability was retired upstream (P05/P08) and stays retired. The
`agent_operations`/`llm_generation_tracing` rows written by judgment runs are
ordinary rows of tables that already existed; they remain valid after a
rollback.
