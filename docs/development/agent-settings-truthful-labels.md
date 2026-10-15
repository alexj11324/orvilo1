# Agent settings: truthful labels

Front-end copy fixes found by the execution-chain settings audit. No server, schema or default changes.

## Changed

- Service model `systemAgent.goal`: "Goal Creation" -> "Planning & acceptance" (zh-CN 规划与验收), with a description row. The model resolved by `resolveGoalModelConfig` drives acceptance-criteria drafting (`services/goal/criteriaGenerator.ts`), exploration planning (`services/goal/explorationPlanner.ts`), task intent analysis (`services/task/intent.ts`), and is the last fallback reviewer in `services/verify/goalReviewModelConfig.ts`.
- Agent detail, read-only "Agent" row -> "Runtime" (zh-CN 运行时); the unused duplicate `legacyLabel` key is removed.
- Access policies: "Model" / "Device switching" -> "Member model switching" / "Member device switching" (zh-CN 成员切换模型 / 成员切换设备). The options are "Can switch / Locked", so the label names the policy being chosen.
- The "Advanced" fold is gone. The diagnostics link is not on the settings page either: it led to usage statistics, which do not help configure an Agent. The Agent profile page still shows it.
- Orchestrator copy says "projects" only. The preference is consumed by project creation (`routers/lambda/project.ts`) and Linear sync (`services/linearSync/worker.ts`) through `resolveOrchestratorRuntimeForCreation`; nothing creates agent groups from it.

## Left alone (evidence)

- "Isolate commands" (`localSandbox`) renders only for the built-in agent on desktop; ACP agents never see it.
- Memory settings "Interests" row: the stored value is read by daily-brief task-template recommendations (`useResolvedInterestKeys` -> `taskTemplate.listDailyRecommend` -> `TaskTemplateService`), shown on Home. Not removed.
- Memory settings scope note: injection is built-in only, but extraction jobs (`TopicModel.listTopicsForMemoryExtractor`) select every user topic without an agent-runtime filter, so a "built-in only" sentence would not be true.

## Backend follow-ups

- Make "planning & acceptance" follow the assigned agent's model: `resolveGoalModelConfig` (`apps/server/src/services/goal/modelConfig.ts`) takes only `(db, userId)` and reads `systemAgent.goal`. Its callers (`criteriaGenerator` x2, `explorationPlanner`, `task/intent` x2) would need an agent/task id and to resolve through `AgentModel.getAgentModelConfig` first, as `resolveGoalReviewModelConfig` already does.
- Make "agent self-evolution" (`systemAgent.expertise`) do the same: the resolver is `resolveExpertiseModelConfig` (`services/expertise/modelConfig.ts`), called from `services/expertise/ingestion.ts:275` and `domain.ts:89`; both would need the owning agent id and a per-agent model lookup before the global row.

## Model names come from the CLI

The model picker for Claude Code and Codex used a bundled alias table
("Fable", "Opus", "Sonnet", "Haiku"; a fixed list of GPT names). The table
could not say which version an alias resolves to and went stale with each CLI
release. Both now use the same discovery as every other CLI Agent: a throwaway
ACP session whose `session/new` reply carries the model option, so the picker
shows what the installed CLI reports ("Opus 5.5", pinned versions, new models).

- The CLI's own `default` entry is dropped; the picker's "Default" already
  means "leave the CLI's setting alone".
- These two CLIs have no model-listing command, so a failed ACP probe reports
  an error instead of running an invented flag.
- While the probe runs (about 2 to 6 seconds) the dropdown shows a
  "Loading models…" row, so a short list is not mistaken for the full one.

## One flat form, no folds (2026/10/12)

The Agent settings page had two collapsible boxes, "Execution" and "Access".
Following how Multica lays out an agent (profile, execution, access as plain
rows), the page is now a single form:

- **Execution** is a normal section with the working directory and the
  permission modes the CLI reports. It is omitted when it would have no rows.
- **Connection** (command, sign-in, availability) follows it as its own section.
- **Members who can use this Agent** is the only access control.

Removed from this page:

- "Member model switching" and "Member device switching". An Agent's device
  and model are fixed in its settings (#748); the page no longer offers a
  choice. Until #748 lands the server still honours a stored `member` policy.
- "Topic sharing" and the "Manage permissions" link to the separate page.
- The isolation switch. Isolation is still chosen in the composer's device menu.
