# P00 — 入口与符号清单（inventory）

> 处置词汇：`RETIRE`（退役删除）/ `RENAME`（第一方改名）/ `KEEP_SHARED`（共享能力保留）/
> `KEEP_HISTORY`（历史只读 /decoder）/ `REPLACE`（替代实现替换）/ `DEFER`（后续包再定）/
> `NEEDS_TRACE`（消费者未明，禁止删除）/ `THIRD_PARTY`（真实第三方，保留身份）。
> 「入口」= UI、API/tRPC、REST/OpenAPI、CLI、Hatchet/cron/worker、webhook、import/export、
> env 开关、深链。每条记录：真实调用方、是否生产打包、数据兼容、归属工作包、验证方式。

## A. `packages/agent-runtime` 剩余导出（P01）

> 包已是 P70d 后的残骸（types/transport/utils/audit），**不是可执行引擎**。
> 目标：通用契约迁入 `@orvilo/types/src/agentExecution`（已存在，611 行）或新中性子路径；
> 引擎私有类型删除；包本身待 P21 物理删除。

| 对象                                                                                                                                                 | 现状                           | 真实消费者（非测试）                                                               | 处置                                                                                                                                                                                                                                       | 备注                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `types/state.ts` `AgentState` 等                                                                                                                     | 引擎私有快照 + 运行事实混合    | 23 处（stateManager、CompletionLifecycle、responses.service、hooks、selectors 等） | **拆分**：运行事实（status/identity/origin/error/usage/intervention）→ 契约；引擎私有字段（stepCount/toolCallRepeatGuard/toolManifestMap/toolSourceMap/pendingToolsCalling/unresolvedToolFeedbackRounds 等）→ KEEP\_HISTORY decoder 或删除 | 禁止 `type AgentState = any` 或整体换名复制 |
| `types/{event,tool,usage,hooks,runtime,generalAgent,instruction}.ts`                                                                                 | 混杂                           | 同上                                                                               | 逐个导出建消费者表后 MOVE/RETIRE                                                                                                                                                                                                           | `generalAgent`/`instruction` 多为旧引擎字段 |
| `transport/*`（blob/compression/context/host/lifecycle/llm/message/operation/stream/subAgent/tool）                                                  | 传输契约                       | CLI runtime、agent-mock、desktop 等                                                | MOVE → 契约层；`llm.ts`/`host.ts` 逐项核对是否只服务旧循环                                                                                                                                                                                 |                                             |
| `utils/*`（status/replay/normalizeAgentState/messageSelectors/tokenCounter/llmErrorClassifier/runtimeRetry/toolCallRepeatGuard/stepContextComputer） | 纯工具                         | client selectors、work usage 汇总等                                                | MOVE 通用者（status/messageSelectors/tokenCounter 类）；RETIRE 引擎私有者（stepContextComputer/toolCallRepeatGuard/runtimeRetry 若只服务 step loop）                                                                                       | NEEDS\_TRACE 项标出                         |
| `audit/*`（InterventionChecker/defaultSecurityBlacklist/createSecurityBlacklistAudit/globalAudit）                                                   | 安全拦截（仍有消费者则须保留） | `SecurityBlacklistWarning.tsx`、state.securityBlacklist                            | MOVE → 中性执行策略层（`agentExecution` policy）                                                                                                                                                                                           | 不得连旧 loop 一起删                        |
| `isParkedStatus` 等状态谓词                                                                                                                          | 共享                           | AgentRuntimeService、selector                                                      | MOVE                                                                                                                                                                                                                                       | `waiting_for_*` 语义拆分见 §O               |

## B. `apps/server/src/services/agentRuntime/` 门面（P02）

| 方法 / 成员                                                                                                                                                             | 当前实现                                                                 | 调用方                                                 | 处置                                                                         | 目标                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------- |
| `getOperationStatus`                                                                                                                                                    | 读 stateManager+`agent_operations`+remote admission ledger               | `aiAgent.ts` router、responses.service                 | **MOVE** → `OperationStatusService`                                          | 保留 remote ledger 语义 |
| `getPendingInterventions`                                                                                                                                               | durable `agent_interventions` 为主 + legacy snapshot merge               | router                                                 | **MOVE** → `InterventionService`                                             | snapshot merge 限期保留 |
| `processHumanIntervention`                                                                                                                                              | 转 `resolveAgentInterventionBySource`→`dispatchClaimedAgentIntervention` | router                                                 | **MOVE**                                                                     |                         |
| `interruptOperation`                                                                                                                                                    | sentinel+state write                                                     | InterventionController                                 | **MOVE**                                                                     |                         |
| `startExecution`                                                                                                                                                        | 校验型 no-op，恒 `{scheduled:false}`                                     | `aiAgent.startExecution` procedure、`apiKeyScope` 注册 | **REPLACE** → 明确 queued-intent 或退役错误；procedure 保留 shape 但语义收口 | E14 验收                |
| `completeSubAgentBridge`                                                                                                                                                | Hatchet onComplete 调用；锚点回填 + parent CAS                           | CompletionLifecycle hooks                              | **MOVE** → `ChildRunService`                                                 |                         |
| `completeGroupActionMember`                                                                                                                                             | 同上 + K=N barrier                                                       | 同上                                                   | **MOVE** → `ChildRunService`                                                 |                         |
| `tryResumeParentFromAsyncTool`                                                                                                                                          | 旧 snapshot resume；ACP 下恒 miss（无 `waiting_for_async_tool`）         | 上两桥                                                 | **KEEP\_HISTORY→RETIRE**：停止新 producer，排空后 P21 删                     |                         |
| `ensureInterventionContinuationStarted`/`loadInterventionContinuationState`                                                                                             | continuation 对账                                                        | v2 router crash-safe 探针                              | **MOVE**                                                                     |                         |
| `types.ts`（SubAgentBridgeParams/GroupActionMemberBridgeParams/ExecGroupMember\*/OperationStatusResult/PendingInterventionsResult/StartExecution\*/EvalRuntimeContext） | 门面参数类型                                                             | 同方法                                                 | **MOVE** 随职责；stepTypes 已 re-export 自 `agentExecution`                  |                         |

## C. `apps/server/src/services/aiAgent/` 业务入口（KEEP，逐项收口）

| 入口                                                                                                              | 现状                                                                           | 处置                                                                                  |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `execAgent`/`execAgents`/`execGroupAgent`/`execSubAgent`/`execVirtualSubAgent`/`execAgentMember`/`execAgentTasks` | 全部经 `dispatchHeteroAgent`                                                   | **KEEP\_SHARED**；清理死参数（`autoStart` 不透传）、旧注释                            |
| `pipeline/runToolSurface.ts`                                                                                      | 解析 builtin specs+skill 文本；MCP/market/custom plugin 记 log 丢弃            | **REPLACE 缺口**：P09 把装配结果改为显式 mounted/unsupported/unauthorized/failed 契约 |
| `pipeline/heteroDispatch.ts`                                                                                      | 统一派发；`_hooks` 序列化、`pruneRegeneratedBranch`、builtinTools 白名单持久化 | **KEEP\_SHARED**                                                                      |
| `pipeline/approvalResume.ts`、`approvalClaim` 守卫                                                                | ACP claim 链路                                                                 | **KEEP\_SHARED**                                                                      |
| `subAgentRuns.ts`+`hooks/threadRunHooks.ts`                                                                       | isolation thread、桥 hooks、trigger 继承                                       | **KEEP/RENAME** → ChildRun 语义（P10）                                                |
| `intervention/InterventionController.ts`                                                                          | 审批批次、continuation                                                         | **KEEP\_SHARED**                                                                      |
| `orchestrationRunners.ts`、`shareGate.ts`                                                                         | serverAgentMember/subAgent runner、share visitor 门控                          | **KEEP\_SHARED**                                                                      |
| `acpBuiltinToolExec.ts` + `heteroExecBuiltinTool`/`heteroAwaitBuiltinToolChildren`                                | 宿主侧 builtin MCP 回打                                                        | **KEEP\_SHARED**                                                                      |

## D. `modules/AgentExecution/` + `services/agentExecution/`（KEEP，不另建第二套）

`AgentStateManager`/`InMemoryAgentStateManager`/`StreamEventManager`/`GatewayStreamNotifier`/`messagePersistence`/`gatewayVisitorRedaction`/`redis`/`factory`；`AbandonOperationService`/`CompletionLifecycle`/`OperationTraceRecorder`/`snapshotStore`/`hooks`/`stepTypes`/`abort`/`agentInterventionNotification` —— 全部 **KEEP\_SHARED**，作为 P02 归并目标。

## E. `packages/heterogeneous-agents` 注册表（P07：Live vs History 拆分）

| 注册项                                                                                                     | 现状                         | 处置                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `ACP_AGENT_RUNTIMES`（amp/claude-code/codebuddy/codex/kimi-code/opencode/pi/qoder，共享 `TraeAcpAdapter`） | 真实 ACP session             | **KEEP\_SHARED**（`LiveExecutionRegistry`）                                                        |
| `trae`/`cursor-acp`/`droid-acp`/`devin`/`grok-build` 独立适配器                                            | ACP 但非标 runtime spec      | **KEEP\_SHARED**；能力差异显式声明                                                                 |
| `cursor`（legacy `CursorAdapter`）、`claude-code-sdk`（`ClaudeCodeSdkAdapter`）                            | 仅历史解析导出               | **KEEP\_HISTORY** → `HistoricalTraceDecoderRegistry`；不得出现在 `listAgentTypes()` 新运行可选列表 |
| `spawn/*`、`builtinMcp/*`、`quota/snapshot.ts`                                                             | ACP 宿主 / 工具桥 / 额度采样 | **KEEP\_SHARED**                                                                                   |
| `standardAcpSession.ts:305` `clientInfo.title='LobeHub'`                                                   | ACP 握手向 Agent 自报旧品牌  | **RENAME** → Orvilo（P03/P07）                                                                     |

## F. Quota 与账号（P06：控制面退役、观测保留）

| 对象                                                                                             | 入口                                                                              | 处置                                                                      |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `createAccount`/`deleteAccount`/`listAccounts`/`updateAccount`                                   | `agentQuota` router（managed/referenced 凭据）                                    | **RETIRE** 产品面与写接口                                                 |
| `bindAccount`/`unbindAccount`/`listBindings`/`switchAccount`                                     | 同上 + `QuotaAccountSwitcher` UI                                                  | **RETIRE**                                                                |
| `resolveAccountLoads`/`selectAccountForAgent`/`resolveQuotaAccountEnv`（client）                 | router + `heterogeneousAgentExecutor.ts`                                          | **RETIRE**：移除 quota→`CLAUDE_CONFIG_DIR`/profile 注入执行依赖           |
| `QuotaAccountManagerModal`/`QuotaAccountSwitcher`/`ClaudeCodeQuotaMenu`                          | `ChatInput/ControlBar/HeteroControlBar/QuotaMenu/`                                | **REPLACE**：只读观测 UI（身份摘要 / 额度 / 重置 /unknown），不删         |
| `ingestSnapshot`/`recordUsage`/`getWindows`/`getLatestReadings`/`listSnapshots`/`listUsageTurns` | router + `device-control/claudeCodeQuota` + `heterogeneous-agents/quota/snapshot` | **KEEP\_SHARED**：绑定执行设备 + 原生 identity，unknown≠0                 |
| `agentQuota` schema/models/types                                                                 | `packages/database`                                                               | **DEFER→P09**：先去 credential/control 语义，字段收敛在审计 FK 后另行授权 |

## G. Desktop 宿主 Provider/serverDefault 残留（P05/P06）

`apps/desktop/src/main/controllers/HeterogeneousAgentImpl.ts` 及 `modules/heterogeneousAgent/{types,providerBindingHost,providerBindingPort}.ts`：`prepareHostedServerDefaultBinding`/`beginServerDefaultOperation`/`settleServerDefaultOperation`/`getServerDefaultEndpoint`/`providerBinding`/`serverDefaultApiConfig`/`resumeBindingKey`。

- **处置**：若承担 Orvilo-owned LLM 接入（托管 provider relay）→ **RETIRE**（P05/P06）；纯历史 decoder → 精确例外。
- **状态**：`NEEDS_TRACE` —— 须追 `providerBinding` 的真实生产调用方（谁还会传入 `kind:'server-default'`）与 server 端 relay 端点存活度后再删。

## H. OpenAPI/Responses（消费者收口，方案 §9.1）

| 对象                                                                                  | 现状                                                                                                                         | 处置                                                                                                   |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `responses.service.ts` `createResponse`/`createStreamingResponse`                     | `execAgent(autoStart:false)` → `awaitRunCompletion` 轮询 durable status                                                      | **REPLACE**：非流式等本 operation 终态；流式用本 run 事件；function-tools / 模型代理语义执行前明确拒绝 |
| `findLastAssistantText(topicId)`/`extractAssistantContent(AgentState)`                | topic 级末条助手文本 → 跨 operation 串扰                                                                                     | **REPLACE**：绑定 operationId/generation 的输出归属                                                    |
| `agent.service`/`chat.service`/`eval*`/`api-key.service` 等其余 openapi 服务          | 正常业务 API                                                                                                                 | **KEEP\_SHARED**                                                                                       |
| 旧 `executeSync`/`createOperation`/`executeStep`/`GeneralChatAgent`/`GraphAgent` 符号 | 非测试代码仍有字面命中（多为 `createOperationMetadata`、context-engine 类型、CLI token 续期、tracing recorder 等同名不同物） | **禁止回流门禁**（P19）：逐命中核消歧                                                                  |

## I. 品牌残余（P03）

| 位置                                                                                                                                                               | 命中                         | 处置                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `standardAcpSession.ts:305`                                                                                                                                        | `clientInfo.title='LobeHub'` | **RENAME**→`Orvilo`（协议自报，非 UI 文案）                                                                 |
| `src/components/Branding/ProductLogo/index.tsx` `ProductLogoProps extends LobeHubProps`；`Custom.tsx` `memo<LobeChatProps>`                                        | 第一方类型依附第三方品牌类型 | **RENAME**→`OrviloLogoProps`/`ProductLogoProps` 自有定义                                                    |
| `src/components/BrandWatermark/index.tsx` `import { LobeHub as Orvilo }`、`Loading/BrandTextLoading` `LobeHubText`                                                 | 第三方组件渲染               | **KEEP/RENAME 评估**：底层是 `@lobehub/ui/brand` 真实组件；要么自有实现，要么保留真实依赖并在品牌白名单登记 |
| `packages/const/src/version.ts` `BRANDING_NAME !== 'LobeHub'` 等 white-label 判定                                                                                  | 字面哨兵                     | **KEEP**（语义正确）；P04 如有更稳判定可 REPLACE                                                            |
| `global.d.ts` `LobeCustomToken`/`LobeCustomStylish` 接口继承                                                                                                       | 第三方主题类型               | **THIRD\_PARTY** 保留                                                                                       |
| `apps/desktop/stubs/business-const`、drivers/{qoder,amp,opencode,codeBuddy}、`shareGate.ts` 注释、`resolveExecutionBinding.ts` 注释、`execAgent.clientIds.test.ts` | 注释 / 测试提及              | RENAME 注释；测试数据保留                                                                                   |
| `docs/*`（task-first-rollout、desktop-dev-html-routing、acp-p70-handoff）                                                                                          | 历史文档                     | **KEEP\_HISTORY**（不改写历史记录）                                                                         |
| `plugins/vite/customBrandingLoadingScreen.ts` `n=='LobeHub'`                                                                                                       | 构建插件哨兵                 | RENAME→`Orvilo` 或品牌常量（核对其判定对象是否为上游 HTML）                                                 |

> 展示面全量清单（title/manifest/PWA/onboarding/ 默认 Agent / 通知 / 分享 / 导出 / CLI help / 安装器 / 托盘 / 更新提示）由 P03 按本表规则逐面核对；规则：**第一方面零残留，第三方 / 归属 / 历史例外精确登记**。

## J. 第三方 `@lobehub/*` 依赖（THIRD\_PARTY 为主）

| 包                                                                 | 用途判断                        | 处置                                                                    |
| ------------------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------- |
| `@lobehub/ui` `@lobehub/icons` `@lobehub/editor` `@lobehub/charts` | 通用 UI / 图标 / 编辑器         | **THIRD\_PARTY** 保留真实包名；可选薄 facade（不伪造 `@orvilo/*` 包）   |
| `@lobehub/tts` `@lobehub/analytics`                                | 媒体 / 遥测                     | **NEEDS\_TRACE**：找生产调用方；只服务已退役面者 RETIRE 依赖            |
| `@lobehub/market-sdk` `@lobehub/market-types`                      | 市场 / 账号集成（产品面已退役） | **NEEDS\_TRACE→RETIRE**：追 `MarketService` 真实消费者后迁走 / 删除依赖 |
| `@lobehub/i18n-cli` `@lobehub/lint` `@lobehub/seo-cli`             | 构建工具链                      | **THIRD\_PARTY** 保留                                                   |
| 模型 SDK（openai/anthropic 等，若在 deps）                         | 找生产调用方                    | **NEEDS\_TRACE**：只服务退役 Provider/loop 者删；独立基础服务逐项论证   |

## K. CLI 与协议身份（P03/P04）

| 对象                                | 现状                                 | 处置                                                                                                   |
| ----------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `apps/cli` bin                      | `lh`+`orvilo` 双名                   | **KEEP/RENAME**：`orvilo` 为规范名；`lh` 限期转发 wrapper（只转发受支持命令；退役命令返回明确错误）    |
| MCP server 名 `lobe_cc`/`orvilo_cc` | 宿主 per-run MCP；`orvilo_cc` 已存在 | **RENAME/KEEP\_COMPAT**：统一 `orvilo_cc`；`lobe_cc` 已存 session 工具名兼容限期映射，不得两名同时注册 |
| ACP `clientInfo`                    | 见 §I                                | RENAME                                                                                                 |
| `ORVILO_*` env                      | 已是第一方前缀                       | KEEP                                                                                                   |

## L. 异步子运行与生命周期（P10/P16）

| 对象                                                                                                                    | 处置                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `subAgentRuns.ts`（isolation thread、hooks、trigger 继承、subAgentProgress）                                            | **KEEP/RENAME** → `ChildRunService`                                                                                 |
| `threadRunHooks.ts`、`ClientSubAgentTransport`（3s 轮询 + 30min 超时）                                                  | **REPLACE 补强**：结果投递改服务端持久化 mailbox+receipt 去重；客户端关闭不再是 child 唯一存活条件                  |
| `router-hono` callbacks（subAgent/groupMember/threadRun/bot）+ `finalizeAbandoned` + Hatchet `delivery:'hatchet'` hooks | **KEEP\_SHARED**（P70d 确认存活路径）                                                                               |
| `waiting_for_async_tool` 状态 /`tryResumeParentFromAsyncTool`                                                           | **KEEP\_HISTORY→P21 RETIRE**：新旧状态三分（业务运行 / 等待原因 / ACP 会话）；不再统一替换为 `waiting_for_children` |
| `scheduleGroupMemberTimeout`（已删）                                                                                    | **REPLACE**：恢复 per-child deadline 与 parent join deadline（通用 watchdog 不是唯一保证）                          |

## M. builtin-skills 残留（P11）

`packages/builtin-skills/src/{agent-browser,artifacts,orvilo,task}`：**KEEP\_SHARED 收敛** —— 承载任务 / 产物约束的文本迁为 `TaskExecutionContract`/`RunInstructions`；迁移后窄接口保留，无 “技能商店” 产品包装。

## N. 隐藏产品面（承 hidden-surface-retirement.md，P05/P07 收尾）

- 已退役面不再重列；**剩余 NEEDS\_TRACE**：HS-42（ragEval 前端死链）、HS-53/53b（Plans/Credits/Billing/Usage 空壳与工作区业务插槽 —— 私有 overlay 注入点）、HS-29 公网 `public/acceptance/skill.md`（核查是否仍在）。
- `apps/workbench`：保留（移动端 agent doc reader），rewrite 已 device-gated。
- `apps/share`：保留。
- \#99 未合时其范围并入 P05；合则划掉同义项。

## O. 状态语义（P05/P10 横切）

| 旧语义                                | 目标                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `waiting_for_async_tool`              | 拆：业务运行 status（queued/running/waiting/…）× 等待原因（child\_runs/human\_input/external\_action）× ACP session state。历史快照按证据分流，不可判者 `legacy_wait`/`unknown` |
| `parked` 状态族（`isParkedStatus`）   | 保留谓词；底层语义迁契约层                                                                                                                                                      |
| wire 事件名（`agent_runtime_end` 等） | **KEEP\_COMPAT**：先保 wire 字符串，生产者迁统一执行层后版本化改名                                                                                                              |

## P. 准入与错误合同（RB01，跨包）

- `AgentExecutionErrorCode` 已有：`ACP_UNAVAILABLE`/`ACP_VERSION_UNSUPPORTED`/`AUTH_REQUIRED`/`CAPABILITY_UNSUPPORTED`/`DEVICE_OFFLINE`/`OUTCOME_UNKNOWN`/`RUNTIME_MIGRATION_REQUIRED`/`STALE_RUN`。
- 如确需新增：`LEGACY_RUNTIME_RETIRED`/`PROVIDER_CONFIGURATION_RETIRED`，并建 HTTP/tRPC/IPC/CLI 同义映射。错误须**执行前**抛出，禁假成功。
- `autoStart:false` 旧调用：转 queued intent 或明确退役错误（E14）。

## Q. CAID 复用锚点（存在性已核对，P11–P16 复用不新建）

`services/goal/**`（manager/supervisor/policy/advanceGoal/decideNextMove/explorationPlanner）、`taskRunner/**`（buildTaskPrompt/idempotency/scheduleTick/heartbeatTick/cascade/delegation）、`taskDispatch/index.ts`+`models/taskDispatch.ts`、`taskIntegration/index.ts`、`taskWorkspace/index.ts`、`taskLifecycle/**`、`taskDispatchRecovery`、`verify/**`（67 文件门控）、`hatchet/workflowTasks.ts`。

**禁止**：新建 `workflow_tasks` 平行真相、绕开 `TaskDispatchModel` 的第二派发器、内存 Promise.all 式异步。

## R. 认证不误删白名单（KEEP\_SHARED）

Orvilo 登录 / OIDC（better-auth）、GitHub/Linear OAuth、设备 enrollment、Gateway token、MCP 授权、`TRPC_NAMESPACE_API_KEY_RULES`、应用凭据加密 vault、外部 CLI 原生登录（Claude/Codex auth.json、Keychain）。退役对象是 `LlmProviderCredential` 一类，不是任何含 token/provider 字样的东西。
