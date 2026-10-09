# Agent settings: truthful labels

Front-end copy fixes found by the execution-chain settings audit. No server, schema or default changes.

## Changed

- Service model `systemAgent.goal`: "Goal Creation" -> "Planning & acceptance" (zh-CN 规划与验收), with a description row. The model resolved by `resolveGoalModelConfig` drives acceptance-criteria drafting (`services/goal/criteriaGenerator.ts`), exploration planning (`services/goal/explorationPlanner.ts`), task intent analysis (`services/task/intent.ts`), and is the last fallback reviewer in `services/verify/goalReviewModelConfig.ts`.
- Agent detail, read-only "Agent" row -> "Runtime" (zh-CN 运行时); the unused duplicate `legacyLabel` key is removed.
- Access policies: "Model" / "Device switching" -> "Member model switching" / "Member device switching" (zh-CN 成员切换模型 / 成员切换设备). The options are "Can switch / Locked", so the label names the policy being chosen.
- The "Advanced" fold is gone; the diagnostics link is a plain row at the end of the page.
- Orchestrator copy says "projects" only. The preference is consumed by project creation (`routers/lambda/project.ts`) and Linear sync (`services/linearSync/worker.ts`) through `resolveOrchestratorRuntimeForCreation`; nothing creates agent groups from it.

## Left alone (evidence)

- "Isolate commands" (`localSandbox`) renders only for the built-in agent on desktop; ACP agents never see it.
- Memory settings "Interests" row: the stored value is read by daily-brief task-template recommendations (`useResolvedInterestKeys` -> `taskTemplate.listDailyRecommend` -> `TaskTemplateService`), shown on Home. Not removed.
- Memory settings scope note: injection is built-in only, but extraction jobs (`TopicModel.listTopicsForMemoryExtractor`) select every user topic without an agent-runtime filter, so a "built-in only" sentence would not be true.

## Backend follow-ups

- Make "planning & acceptance" follow the assigned agent's model: `resolveGoalModelConfig` (`apps/server/src/services/goal/modelConfig.ts`) takes only `(db, userId)` and reads `systemAgent.goal`. Its callers (`criteriaGenerator` x2, `explorationPlanner`, `task/intent` x2) would need an agent/task id and to resolve through `AgentModel.getAgentModelConfig` first, as `resolveGoalReviewModelConfig` already does.
- Make "agent self-evolution" (`systemAgent.expertise`) do the same: the resolver is `resolveExpertiseModelConfig` (`services/expertise/modelConfig.ts`), called from `services/expertise/ingestion.ts:275` and `domain.ts:89`; both would need the owning agent id and a per-agent model lookup before the global row.
