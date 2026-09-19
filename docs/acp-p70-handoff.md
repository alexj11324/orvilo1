# ACP 迁移 P70 交接（2026-09-18）

> 交接给 cloud agent 继续推进。分支 `feat/acp-P70-cleanup`，PR **#90**（draft）。
> 工作区：`/private/tmp/orvilo-acp-wt/P70`（本地 worktree，cloud agent 可直接 checkout 分支）。

## 终态目标（不变）

> 机器 A 仍然能完整控制机器 B 上的 Agent；本地和远程都通过 ACP；Orvilo 不再提供
> 用户 LLM Provider 管理，也不再运行 Lobe 自有模型循环；任务、automation、协作和验收不受损。

## 已合并（权威）

| Phase | PR  | Merge commit                               |
| ----- | --- | ------------------------------------------ |
| P30   | #64 | `db8aebb194d678181c379b56aaca0eae9512c1`   |
| P40   | #72 | `d9c2da11bc63f9fbe1efa08150b944a5be5f1a8a` |
| P50   | #74 | `a90c4aea9a13b1ea5f91bc0b5b3bde4e887614e9` |

## 开放 PR 权威状态

### #90 `feat/acp-P70-cleanup`（本分支，draft）

- 已提交：P70a（`fb3fe193` 共享类型脱离垂死引擎树）+ P70b-core（`e3ba8a8e`
  execAgent 全量走 ACP 绑定）+ 本次推送的 P70c 系列 commit。
- CI：`Test Server (shard 1/2)` FAIL = **21 个未迁移的旧循环测试文件**（见下）；
  `Test Web App` FAIL = 无关滚动 E2E flake（`关闭流式自动滚动后…`），重跑即可。
- 分支 BEHIND canary，合并前需要 `gh update-branch`。
- ⚠️ 注意：同一 SHA 的 `pull_request` run 会被 `concurrent_skipping` 全部 skip
  （push run 拥有真实测试）——rollup 里的 `success` 是空跑，**以 push run 为准**。

### #82 `fix/audit-r0-quality-gate`（独立 PR，不是本分支）

- `e7afd2b7` 已含完整修复：`skip_reason` → `reason` 输出名修正 + check-runs API
  瞬时失败重试。
- **已知缺陷（分析完成，待修）**：`concurrent_skipping: 'same_content_newer'` 下，
  同 SHA 的 push run 先起跑拥有真实测试、PR run 被 skip；gate job 对
  `concurrent_skipping` fail-closed → PR run 的 `Required Quality Gate` 红。
  GitHub 按 check 名取**最新完成**的 run → PR run 的红盖掉 push run 的绿 →
  mergeable=BLOCKED。e7afd2b7 上实证：push gate success 17:59:47Z，PR gate
  failure 18:03:15Z，后者赢。
- **建议修法**：gate job 在 `should_skip && reason != skip_after_successful_duplicate`
  时不直接 `exit 1`，而是复用 `.github/actions/require-quality-gate` 的轮询逻辑
  （已存在，poll `commits/SHA/check-runs` 里最新完成的同名 check），等拥有 run 的
  gate 出结果后镜像。注意 pull\_request 事件 `github.sha` 是 merge ref，轮询目标
  要用 head SHA（`github.event.pull_request.head.sha`）。备选：PR 事件加入
  `do_not_skip`（正确但 push+PR 双跑浪费算力）。
- 处理 codex 的 P1 review thread 时说明此修复。

### #76 `feat/acp-P60-browser-use`（独立 PR，P60）

- 实质检查全绿。两个红项：`Documentation Required` FAIL（需看该 check 要求什么
  label / 文件）+ `Check all PR gates before Vercel` FAIL（Vercel 部署限流 24h，
  非实质）。mergeable=UNKNOWN，先 `gh update-branch` 再看。

## P70c 已完成实现（builtin tools over ACP 桥接）

设计：dispatch 时解析工具面 → server-executable builtin tools 序列化为
`AcpBuiltinToolSpec[]` 随 dispatch 下发 → 宿主（desktop/device/sandbox）在 per-run
MCP server（`orvilo_cc`）挂载 → 调用经 operation-scoped JWT 回打 tRPC →
`BuiltinToolsExecutor` + `serverRuntimes` 执行，deferred 编排（子代理 / 群成员）保留。

| 层                                    | 文件                                                                                                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 共享类型                              | `packages/types/src/agent/acpExecution.ts`（`AcpBuiltinToolSpec`）                                                                                                            |
| 工具面解析                            | `apps/server/src/services/aiAgent/pipeline/runToolSurface.ts`                                                                                                                 |
| dispatch 携带 + 白名单 / 上下文持久化 | `apps/server/src/services/aiAgent/pipeline/heteroDispatch.ts`                                                                                                                 |
| 服务端回打桥                          | `apps/server/src/services/aiAgent/acpBuiltinToolExec.ts`                                                                                                                      |
| tRPC 端点                             | `apps/server/src/routers/lambda/aiAgent.ts`（`heteroExecBuiltinTool` / `heteroAwaitBuiltinToolChildren`）                                                                     |
| JWT capability                        | `packages/trpc/src/utils/internalJwt.ts`（`hetero:tool:exec`）                                                                                                                |
| MCP 挂载                              | `packages/heterogeneous-agents/src/builtinMcp/`（`OrviloBuiltinMcpServer` 加 `includeAskUserTool` 选项；`acpBuiltinToolExtras` API→extraTool 工厂；`jsonSchemaToZod` 转换器） |
| CLI 宿主                              | `apps/cli/src/commands/hetero.ts`（解 `ORVILO_BUILTIN_TOOLS`/`ORVILO_OPERATION_JWT`）                                                                                         |
| device daemon                         | `apps/cli/src/device/agentRun.ts` + `apps/cli/src/commands/connect.ts`                                                                                                        |
| desktop                               | `apps/desktop/src/main/controllers/GatewayConnectionCtr.ts` + `HeterogeneousAgentImpl.ts`                                                                                     |
| sandbox                               | `apps/server/src/services/heterogeneousAgent/sandboxRunner.ts`（`ORVILO_OPERATION_JWT` 双 JWT）                                                                               |
| gateway 协议                          | `packages/device-gateway-client/src/types.ts` + `http.ts`                                                                                                                     |

要点：

- 白名单持久化在 `agent_operations.metadata.builtinTools`（`{identifier: apiName[]}`），
  回打时重校验；`builtinToolContext`（activeDeviceId/scope/workingDirectory）同处
  持久化用于重建 `ToolExecutionContext`。
- `hetero:tool:exec` capability 只在运行确有挂载工具时签发。
- 沙箱：`ORVILO_JWT`= 用户域 token（不动），`ORVILO_OPERATION_JWT`= 窄 operation token
  （工具回打专用）。
- `OrviloBuiltinMcpServer` 默认仍注册 `ask_user_question`；标准 ACP 运行时
  （`ACP_RUNTIME_AGENT_TYPES`）builtin-only 挂载时传 `includeAskUserTool: false`。
- regenerate/resume：`heteroDispatch` 已接 `pruneRegeneratedBranch`（修了旧分支泄漏
  进 history 的真实回归）。
- `mecha/resolveAgentConfig`：userTimezone 经 `userSettings.general.timezone` →
  snapshot → systemRole 指令（与 userLocale 同路），修了 timezone 丢失回归。

### 同时完成的其他 P70c 项

- `AbandonOperationService`/`OperationTraceRecorder` + 共享 step 类型迁到
  `apps/server/src/services/agentExecution/`（旧 `agentRuntime/` 留 re-export 排空）。
- `userMemory`：`runMemoryActionAgent` 重写为「结构化决策（`generateObject`）+
  服务端 `MemoryExecutionRuntime` 直写 + 直投 receipt」，不再 spawn 旧 agent loop。
- 收窄 `buildServerAgentMemberRunner`/`buildSubAgentRunner`/`registerWorkFromIntent`
  参数类型供 ACP 桥复用。

### 测试现状

新增 / 迁移已绿：`acpBuiltinToolExec.test.ts`（8）、`runToolSurface.test.ts`（9）、
`acpBuiltinToolExtras.test.ts`、`userMemoryRunner.test.ts`（7）、迁移后的
`AbandonOperationService`/`OperationTraceRecorder`/`finalizeAbandoned` 测试、
`execAgent.files.test.ts`（已迁到 dispatch 边界）。

## P70c 剩余工作（首要任务）

### 1. 迁移剩余 21 个测试文件到 `dispatchHeteroAgent` 边界 ✅（2026-09-19 完成）

全部迁移完毕并推送到 `feat/acp-P70-cleanup`（含 canary merge `902ce0e8`）。
原清单（全部已处理）：

```
execAgent.builtinRuntime.test.ts      execAgent.clientIds.test.ts
execAgent.connectorOverlap.test.ts    execAgent.device.test.ts
execAgent.deviceToolPipeline.test.ts  execAgent.disableTools.test.ts
execAgent.headlessDefault.test.ts     execAgent.heteroFiles.test.ts
execAgent.modelOverride.test.ts       execAgent.newThread.test.ts
execAgent.pinnedSkillContent.test.ts  execAgent.pluginTriState.test.ts
execAgent.resume.test.ts              execAgent.resumeApproval.test.ts
execAgent.resumeToolResult.test.ts    execAgent.spineAnchor.test.ts
execAgent.threadId.test.ts            execAgent.topicHistory.test.ts
execAgent.topicWorkingDirectory.test.ts
execAgent.userTimezone.test.ts        execSubAgent.test.ts
```

迁移模式（以 `execAgent.files.test.ts` 为模板）：

- **A 档**（多数文件）：`vi.mock` `pipeline/heteroDispatch` 的
  `dispatchHeteroAgent`，断言迁移到其入参（`ExecRunContext`：prompt/topic/thread/
  history/files/device/systemContext/snapshot 等）。operation 字段断言改为断言
  `operationPersisted` 写入或 dispatch 入参。
- **B 档**（`heteroFiles`/`device`/`deviceToolPipeline` 等需要真路由断言的）：
  沿用深 mock 但边界改到 `resolveExecutionPlan`/device gateway 调用。
- `userTimezone.test.ts`：断言改为 `resolveRunAgentConfig` 产出的 systemRole
  指令含 timezone 行（或 snapshot.userTimezone 透传）。
- `resume*` 系列：断言 `parentMessageId` → `pruneRegeneratedBranch` 剪枝 +
  dispatch resume 参数。
- `execSubAgent.test.ts`：mock `dispatchHeteroAgent` 断言 `isSubAgent`/ 父 op 字段。

接手期间落地的新事项：

- **真回归修复** `94aacfad`：legacy（非 `approvalResolutionRequestId`）approval
  claim 在退役 createOperation 不再接收 `approvalClaim` 后无人置
  `continuationPrepared` → execAgent 成功后 finally 守卫把已 claim 的审批行回滚
  成 pending。修法：dispatch resolve 即标记（index.ts \~1113）。回归测试在
  resumeApproval（'leaves parked-operation retirement to the caller'）。
- **canary 执行目标契约（merge `902ce0e8` 起生效）**：`resolveExecutionPlan`
  无隐式 cloud-sandbox fallback —— `none`/ 未设置 → `{kind:'none'}` pending；
  `sandbox` 显式 → sandbox；`local`+bound → device，unbound → `none`；
  `auto` 需要 onlineDeviceIds（heteroDispatch 不传 → 恒 `device-unrouted`）。
  unrouted → dispatch 返回 `{success:false, autoStarted:false, error:'No bound
device'}`。denied-sender（`!canUseDevice`）与 sandboxFallback/share-visitor
  仍可达 sandbox。device.test.ts 三个测试已改为断言 fail-loud；深 harness 文件
  （resume/topicHistory 等跑真 dispatch 的）需在 agencyConfig 声明
  `executionTarget: 'sandbox'`（同 canary 对 heteroFiles 的改法）。
- **语义收窄（PR body 需标注）**：`memory.enabled` 只剩后台提取闸门；
  orvilo-agent 媒体缺口自动注入已退役（host 自带工具面）；pinned-skill body
  不再 inline（lazy skills runtime）；SELF\_FEEDBACK\_INTENT 改为 caller-pinned
  - `!disableSelfFeedbackIntentTool` 挂载（workflows/agentSignal/run.ts:530）。

### 2. 排空旧入口 ✅（2026-09-19 审计结论）

- **execAgent 调用方全部收敛到 dispatch**：`execAgent`/`execSubAgent`/
  `execAgentMember`/`execAgentTasks`/`execVirtualSubAgent` 内部统一走
  `dispatchHeteroAgent`。调用方清单：routers/lambda/aiAgent.ts
  （execAgent/execAgents/agentTasks/composer 桥）、agentNotify.ts（notify/resume
  唤醒）、approvalResume.ts（审批 resume）、shareChat.ts（visitor 拒跑）、
  verify/{agentVerifier,repairService,evidenceSubmission}、goal/supervisor、
  taskResultBridge、bot/AgentBridgeService + messenger、agentEvalRun、
  task/index.ts、agentSignal workflows —— 无一绕过门面。
- **工具面验证**：goalSupervisor /skillManagement/agentSignal {Review,
  Reflection,SkillManagement,FeedbackIntent} / AcceptanceEvidence 等
  server-run builtin 全部注册于 `toolExecution/serverRuntimes`，ACP 下经
  `builtinToolSpecs` 序列化下发宿主、回打 `heteroExecBuiltinTool` 执行；
  deferred 编排（orvilo-agent callSubAgent /orvilo-group-management）走
  `heteroAwaitBuiltinToolChildren` 宿主侧轮询，**父 run 不再 server-side
  park** —— `waiting_for_async_tool`/`tryResumeParentFromAsyncTool` 是旧
  引擎专属状态，ACP 父 run 阻塞在宿主 MCP 工具调用内。
- **queue 唤醒路径**：Hatchet `agentStep` task → `runStep` handler →
  `AgentRuntimeService.executeStep`。`/api/agent/run` 无 HTTP 路由注册，
  agentStep 消息的唯一生产者在 `AgentRuntimeService` 内部（下一步调度 /
  scheduleContinuation /parked-resume CAS）——**纯旧引擎自产自销**，ACP
  run 永不产生。保留至 P70d 随引擎删除（legacy in-flight ops 兜底）。
- **callback 唤醒路径**：`webhooks/{subagent,group-member,thread-run,
bot}-callback` 经 Hatchet workflow task → `invokeHonoHandler`。ACP 子 op
  settle 仍经 CompletionLifecycle.onComplete 触发（锚点消息回填 + 用量归属
  保留）；父 resume CAS 对 ACP 父必然 miss（非 waiting\_for\_async\_tool）→
  verify watchdog 有限次重试后耗尽，无害但可在 P70d 一并清理。
- **cron**：gatewayCron /agentSignalNightlySchedule/memory cron 跑自己的
  workflow，不经 agentStep。

### 3. P70d 删除引擎

`modules/AgentRuntime`、`services/agentRuntime` 剩余文件、agent-runtime 包
core/executors。删前全仓 grep 确认无 import（`agentRuntime/types.ts` re-export
是排空期兼容，消费者已指 `agentExecution/stepTypes.ts`）。

### 4. P80 dry-run 迁移 + 回滚演练

## 验证命令

```bash
cd /private/tmp/orvilo-acp-wt/P70
bun run check <changed-files>          # 钦定质量门（lint + 相关测试）
# 单测从仓库根跑（apps/server 无独立 vitest config）：
bunx vitest run --silent='passed-only' 'apps/server/src/services/aiAgent/__tests__/execAgent.files.test.ts'
cd packages/heterogeneous-agents && bunx vitest run src/builtinMcp/
# scoped 类型检查：
cd apps/server && pnpm type-check 2>&1 | grep -E "aiAgent|agentExecution|acpBuiltin"
```

## 环境 / 陷阱

- **worktree tsc 噪音**：本 worktree 缺 `next-env.d.ts` 生成物和部分包依赖
  （`apps/cli/node_modules` 空），`pnpm type-check` 输出大量无关 TS2307/TS7006——
  按「我改的文件路径」过滤判断，别看总量。
- `bun run check --type` 本地必挂（CI-only，全仓 tsgo OOM），用包内 `pnpm type-check`。
- CI rollup 会混入旧 run 的状态，**以 push 事件最新 run 为准**；
  `pull_request` run 常被 duplicate-checker 全 skip。
- 提交规范：gitmoji 前缀，PR 目标 `canary`。
- 行为变更需要 acceptance（`.agents/skills/acceptance`），PR body 带已发布
  `https://orvilo.aspectlylabs.com/acceptance/<id>` 链接；纯重构 / 测试迁移可豁免
  但要在 PR 说明理由。
- 不要推断 PR 已合并 —— 以 `gh pr view` 权威状态为准。

## 待处理 review comments

- \#82 codex P1 thread：`concurrent_skipping` fail-closed 缺陷（上文有修法）。
- \#90 push 后关注 codex 新评论。
