# P00 — 冻结基线（baseline）

> Orvilo 品牌统一、旧执行体系退役与 ACP/CAID 收口工程 — 工作包 P00 交付物之一。
> 本文件冻结实施基线、开放 PR 对账、文件所有权和用户可见行为基线。
> 依据：`01-implementation-plan.md`（P00–P21）与
> `Orvilo_ACP_Brand_Harness_Retirement_Plan_2026-09-19.md`（RB00–RB09 / Q0）。

## 1. 固定 SHA

| 对象     | SHA                                                      | 说明                                                     |
| -------- | -------------------------------------------------------- | -------------------------------------------------------- |
| 开发基线 | `origin/canary@e8d1d42853c78c12ae6cba4f78c2e82a6a85d8a4` | 与方案核对基线一致；所有新分支从此切出，PR 目标 `canary` |
| 发布对照 | `origin/main@855e6a508e99bb91ca4e9bc2b60ed4c33fd8faed`   | 只作祖先 / 语义对账，不从 main 复制已退役产品树          |
| 本包分支 | `chore/retirement-caid-baseline`                         | P00，仅文档，无产品行为变化                              |

**基线完整性声明**：本清单基于 `canary@e8d1d428` 整树读取，不使用 GitHub 默认分支（main）搜索计数代替 canary 审计。后续每个工作包开工时必须重新 `git rev-parse origin/canary` 并在 PR body 记录当时的 base/head SHA。

## 2. 已合并的语义锚点（不得回滚的成果）

| 合并       | PR   | 语义                                                                                                                                                                                        |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `5d3f0b8a` | #90  | P70a+P70b+P70c：`execAgent` 全量收敛到 `dispatchHeteroAgent`（ACP binding）；builtin tools 经 `AcpBuiltinToolSpec[]` 随 dispatch 下发，宿主挂 `orvilo_cc` MCP，回打 `heteroExecBuiltinTool` |
| `34b05cdc` | #107 | P70d：删除旧服务端引擎（`modules/AgentRuntime`、`agents/loop`、executors、step worker、Hatchet `agentStep`、`/api/agent/run`）。`AgentRuntimeService` 收缩为 ACP 兼容门面                   |
| `bc8ce2a5` | #111 | acceptance 无 Docker 环境技能文档                                                                                                                                                           |
| `e8d1d428` | #100 | 合并流水线审计与 Q0 验收计划文档                                                                                                                                                            |

### #107 明确遗留的三类行为缺口（本方案的独立验收目标，非 “纯重构”）

1. `startExecution` 不再调度 —— 当前为校验型 no-op（`{scheduled:false, success:true}`），`autoStart:false` 调用方（含 `packages/openapi` Responses API）运行时实质已断。
2. 专用 `scheduleGroupMemberTimeout` 随引擎删除 —— K=N 完成屏障仍在，但 “永不结束的组员” 只剩通用 inactivity watchdog；缺 per-child deadline 与 parent join deadline。
3. `packages/openapi/src/services/responses.service.ts` 需 ACP 语义收口 —— 非流式须等本 operation 终态；`findLastAssistantText(topicId)` 存在跨 operation 串扰风险；`tool-calling` 合规（ORVILO-5860）未恢复。

## 3. 开放 PR 对账（范围协调，不代表已审其 diff/CI）

| PR                                        | 状态                                            | 交叉范围                               | 本方案处理                                                                                                                                                        |
| ----------------------------------------- | ----------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #89 `codex/reconcile-main-canary`         | open **draft**，mergeable；CI 16/17（1 failed） | main↔canary 祖先、Hatchet 修复         | **必须 merge commit 合入**（保祖先）。P00/P13/P20 确认其调度语义已纳入；合入时不得带回已退役产品树。仍 draft 的原因（缺真实 Hatchet 验收）保持阻塞由其 owner 解决 |
| #95 `cursor/navigation-attention-v4-a544` | open **draft**，**有冲突**                      | 导航 / Workspace/Teams/ 共享 Kanban    | P03/P08/P17 的文件 owner 协调对象。**不私自 rebase / 合入**；共享组件复用，不建第二看板                                                                           |
| #99 `chore/retire-skill-store-residue`    | open，mergeable                                 | skill-store 提示 / 注入器 /locale 尾巴 | P05/P11 承接：**若它先合入，本计划删除同义工作不重复做**                                                                                                          |
| #78 `ci/lobehub-conventions`              | open，mergeable                                 | 发布分支、Desktop OTA、签名            | P03/P04/P20/P21 与之协调 identity/updater；不另造发布系统                                                                                                         |

其他 main 侧旧 PR 按最新 canary 等价实现逐项对账：open ≠ 功能缺失；已存在相似代码 ≠ 修复已承接。

## 4. 单一 Owner 写集（冲突防火墙）

以下文件任一时刻只允许一个写方；其他包需要改动时以 patch / 接口请求方式提交给 owner：

| 写集                                                                                                | Owner               | 说明                         |
| --------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------- |
| 根 `package.json`、workspace manifests、pnpm workspace、`tsconfig` paths、TS alias                  | C0（协调器）        | P01/P03 的包名与路径映射变更 |
| `packages/database/migrations/**`、schema journal、共享 `packages/types` 顶层 barrel                | C0                  | 迁移编号唯一分配             |
| `apps/server/src/routers/lambda/index.ts` 等根 router registry、`packages/const/src/apiKeyScope.ts` | C0                  | procedure 增删统一收口       |
| `.github/workflows/**`、构建 / 发布脚本、Docker 清单                                                | C0 + #78 owner 协调 | 发布身份改动另需授权         |
| `docs/development/product-scope.md`、`hidden-surface-retirement.md`                                 | C0                  | 判据文档不被实施包改写       |

注意：仓库当前 **不提交 lockfile**（#78 的 size-gate 评论证实每次 install 重新解析），锁文件竞态风险低于常规 monorepo，但 workspace manifest 仍归 C0。

## 5. 冻结的用户可见行为基线（回归检测基准）

以下能力在 `canary@e8d1d428` 上被视为**既有行为**；任何后续 PR 不得在未声明的情况下削弱：

- **聊天**：流式输出、工具卡片渲染、审批 / 取消 / 重连、线程、群聊 supervisor/member、附件（图片 / 文件）下发执行目标。
- **任务**：Task 手动执行、重试、claim / 依赖 /worktree/ 完成门控（`taskRunner`/`taskDispatch`/`taskIntegration`/`taskLifecycle`）、Verify/CI/Review/Repair、证据提交（`orvilo-acceptance-evidence` 是 run-scoped KEEP\_SHARED）。
- **编排**：`execAgent`/`execAgents`/`execGroupAgent`/`execSubAgent`/`execVirtualSubAgent`/`execAgentMember`/`execAgentTasks` 全部经 `dispatchHeteroAgent`；Hatchet `delivery:'hatchet'` 钩子（subAgent/groupMember/threadRun/bot callback + `finalizeAbandoned`）存活。
- **异步**：独立 child operation、K=N member barrier、父子关系、完成桥（`completeSubAgentBridge`/`completeGroupActionMember`）保留；`waiting_for_async_tool`/`tryResumeParentFromAsyncTool` 只对历史遗留快照有效（ACP 父 run 阻塞在宿主 MCP 工具调用内，不写该快照）。
- **automation**：服务端调度、时区、立即运行、历史；不依赖 renderer 常驻。
- **设备 / 远程**：Web/Desktop 经 Gateway 控制已授权执行设备；`resolveExecutionPlan` 无隐式 cloud-sandbox 回退（canary `902ce0e8` 契约：`none`→pending、`sandbox` 显式、`local`+bound→device、`auto`→`device-unrouted` 恒失败）。
- **额度**：quota 观测读数（ingestSnapshot/recordUsage/getLatestReadings/listSnapshots/listUsageTurns/getWindows）；账号池面（createAccount/bind/switch/selectAccountForAgent/resolveAccountLoads）标记为**待退役**（P06）。
- **集成**：GitHub/Linear OAuth、设备注册、MCP/Connector、`TRPC_NAMESPACE_API_KEY_RULES` 签名 API key（≠模型凭据）。

**基线期已知失败 / 受限**（记为 BLOCKED，不算本工程回归）：

- Responses API：`autoStart:false` 语义断、topic 级末条助手文本串扰、function tools 无 ACP 等价物（ORVILO-5860）。
- group-member 专用 timeout：被通用 inactivity watchdog 替代，per-child deadline 语义缺口。
- 本地环境：无 Docker；migrations 0090/0093 需 pg\_search/bm25 stub 变通（见 environment knowledge）。

## 6. 并行与重型验证约束（沿用方案）

- 同时写入 ≤3 个实现 lane；本 session 以单写方顺序推进，波次仍按依赖表。
- 重型构建 / 全仓测试交给 GitHub CI；本机只跑 `bun run check <files>`、`pnpm type-check`（包内）、scoped `bunx vitest run`。
- 不允许为 “全绿” 而删测试、catch 吞错、放宽全局 allowlist 或把类型改成 `any`。
- `NEEDS_TRACE` 项在消费者证据未明前不进删除列表。

## 7. 当前快照的关键事实（来自 canary 整树读取）

| 事实                                                                                                                                                                                                                                       | 证据                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `execAgent` 尾部唯一出口为 `dispatchHeteroAgent`；`builtinToolSpecs`/`capabilityContext` 由 `runToolSurface` 解析                                                                                                                          | `apps/server/src/services/aiAgent/index.ts:972-1045`                                         |
| `AgentRuntimeService` = ACP 兼容门面：status/interventions 读 `agent_operations`/`agent_interventions`+remote admission ledger；`startExecution` 校验型 no-op；completeSubAgentBridge/completeGroupActionMember 为 Hatchet onComplete 调用 | `apps/server/src/services/agentRuntime/AgentRuntimeService.ts`                               |
| `@orvilo/agent-runtime` 仅剩 types/transport/utils/audit 四组导出；生产消费者 33 个非测试文件（+5 测试侧）                                                                                                                                 | `packages/agent-runtime/src/index.ts` + 引用扫描                                             |
| `@orvilo/types/src/agentExecution/index.ts` 已存在（Exec\* 契约 611 行）—— **P01 扩充它，不新建包**                                                                                                                                        | `packages/types/src/agentExecution/index.ts`                                                 |
| Live ACP registry：`ACP_AGENT_RUNTIMES`（amp/claude-code/codebuddy/codex/kimi-code/opencode/pi/qoder）+ 独立适配器（trae/cursor-acp/droid-acp/devin/grok-build）；`cursor`/legacy 适配器仅历史解析                                         | `packages/heterogeneous-agents/src/registry.ts`、`spawn/acpRuntime.ts`                       |
| `agentQuota` router 仍注册账号 CRUD+bind/switch/select/resolveAccountLoads                                                                                                                                                                 | `apps/server/src/routers/lambda/agentQuota.ts`                                               |
| Desktop 宿主仍含 `providerBindingHost/providerBindingPort`/`serverDefault*` 辅助                                                                                                                                                           | `apps/desktop/src/main/controllers/HeterogeneousAgentImpl.ts`、`modules/heterogeneousAgent/` |
| ACP `clientInfo` 仍发送 `title: 'LobeHub'`                                                                                                                                                                                                 | `packages/heterogeneous-agents/src/spawn/standardAcpSession.ts:305`                          |
| 品牌常量已就位（`BRANDING_NAME='Orvilo'`）；残余 `Lobe*` 命中 ≈21 文件，多为 `@lobehub/*` 第三方真实标识或历史文档                                                                                                                         | `packages/business/const/src/branding.ts` + 全仓扫描                                         |
| CLI bin 已双名 `lh` + `orvilo`                                                                                                                                                                                                             | `apps/cli/package.json`                                                                      |
| builtin-skills 仅剩 4 项：agent-browser/artifacts/orvilo/task                                                                                                                                                                              | `packages/builtin-skills/src/index.ts`                                                       |
