# P21 — 旧执行体系物理删除收口（finish legacy retirement）

本文档记录旧 in-process Lobe 执行尾部代码的物理删除范围、删除前的活跃性证明、迁移映射与回滚边界。前置：P02（facade 拆分）、P05/P06（provider/quota 退役）、P19（防复活门禁）、P20（实机验收）。

## 1. 删除前的活跃性证明

计划要求：「证明没有仍需旧执行的活跃 worker、排队任务、客户端与可恢复 operation」。

| 检查项                              | 证据                                                                                                                                                                                                           | 结论                                                                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/agent-runtime` 消费者     | 全仓 `rg "@orvilo/agent-runtime"`（排除 node\_modules / 守卫测试自身的规则字面量）零命中；包内仅剩自引用 package.json、根 dep 条目、vite coverage glob                                                         | 无活跃 import，可整包删除                                                                                                             |
| 服务端 `services/agentRuntime` 目录 | `AgentRuntimeService` 是 `agentExecution/*` 子服务的组合 facade（P02 已拆）；59 处 `@/server/services/agentRuntime` 引用全部为类型 / 构造导入，无绕过 facade 直取旧引擎                                        | 目录迁移为 `services/agentExecution/AgentRuntimeService.ts`                                                                           |
| 客户端 `src/services/agentRuntime`  | 仅 SSE 流客户端 + 类型 + `handleHumanIntervention` 包装；无独立执行循环                                                                                                                                        | 迁移为 `src/services/agentExecution/`（`agentStreamClient`），intervention 包装内联为 `lambdaClient.aiAgent.processHumanIntervention` |
| 活跃 worker / 排队任务              | P20 实机证据：`startExecution` 对旧 operation 显式报错（documented no-op，`scheduled:false`）；goal 创建后停在 `waiting_external`；无绑定设备时 hetero dispatch 显式拒绝（`No bound device for hetero agent`） | 不存在仍在旧引擎内推进的运行时；旧状态已显式结算，重启路径为 ACP                                                                      |
| 可恢复 operation                    | `resumeAgentTrajectory` 委托至 live `execAgent` 路径（P02 拆分后无独立旧 snapshot resume 入口）                                                                                                                | 历史轨迹读取继续，恢复执行走 ACP                                                                                                      |
| OTel `modules/agent-runtime`        | 唯一 importer 为 `agentExecution/ChildRunService.ts`                                                                                                                                                           | 重命名 `modules/agent-execution`，tracer/meter 名同步                                                                                 |

## 2. 物理删除与迁移清单

### 整包删除

- `packages/agent-runtime/`（39 文件）：根提交即残留的旧 in-process agent loop 包。删除根 `package.json` 的 `"@orvilo/agent-runtime": "workspace:*"` 与 `vite.config.ts` coverage glob。`pnpm-workspace.yaml` / `tsconfig.json` 无残留引用。
- 保留不动：`packages/types/src/agentRuntime.ts`（`IOrviloAgentRuntimeErrorType` 错误分类，同名不同物）、`packages/model-runtime`（deployment-config 模型客户端，P05 已收口）、`agent-manager-runtime` / `agent-gateway-client` / `agent-mock` / `agent-tracing` / `agent-templates`（现役或测试基础设施）。

### 目录迁移（改路径不改标识符）

| 旧路径                                                         | 新路径                                                           | 说明                                                                                                                                                                                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/server/src/services/agentRuntime/AgentRuntimeService.ts` | `apps/server/src/services/agentExecution/AgentRuntimeService.ts` | facade 本体；`AgentRuntimeService` 类名与 `ctx.agentRuntimeService` 键名保留，控制 diff 面                                                                                                                                     |
| `src/services/agentRuntime/`                                   | `src/services/agentExecution/`                                   | `client.ts` 导出改名 `agentStreamClient`（类 `AgentExecutionStreamClient`）；`type.ts` 平移；`agentRuntimeService.handleHumanIntervention` 包装删除，`runAgent.ts` 内联 `lambdaClient.aiAgent.processHumanIntervention.mutate` |
| `packages/observability-otel/src/modules/agent-runtime/`       | `modules/agent-execution/`                                       | tracer `@orvilo/agent-execution`，meter `server-services-agent-execution`；`package.json` exports key 同步                                                                                                                     |

### 消费者迁移

59 个文件 import 路径 `@/server/services/agentRuntime` → `@/server/services/agentExecution`（含 `aiAgent/index.ts` 合并重复 import）；客户端 5 个文件改 `@/services/agentExecution` + `agentStreamClient`；`apps/cli/vitest.config.mts` 注释与 `heterogeneousAgentExecutor.test.ts` fixture 栈路径同步更新。

## 3. 旧状态结算与历史读取

- **旧状态明确结算**：`startExecution` 对 terminal/missing operation 返回显式错误而非静默丢弃；设备未绑定、目标缺失均以显式错误终止，不存在悬挂推进。
- **历史读取继续**：`packages/types/src/agentRuntime.ts` 错误类型、decoder 白名单（P07）、历史 trace/operation 记录均保留；P19 parity 守卫（`retirementParity.test.ts` 等三层）继续扫描并禁止 `@orvilo/agent-runtime` 重新入图。
- **ACP 重启路径**：任何仍需执行的历史意图经 hetero dispatch → 绑定设备 → ACP adapter 重启，与 P08 审计的统一执行目标路径一致。

## 4. 不可逆操作的授权边界

按计划「不可逆凭据销毁 /schema drop 另经授权」：

- 本次**不** drop 任何表 / 列、不销毁凭据。P05/P06 退役的 provider binding 与 managed quota 数据行原样保留（只读 / 历史读取）。
- 回滚只回「最后可用 ACP 版本」—— 本 PR 删除的全部是被替代实现覆盖且已验证零活跃消费者的代码；若需回滚，git revert 本 PR 即可恢复代码形态，但旧引擎在运行时本就无入口（P05–P20 已切断路由 / 注册 / 派发），回滚不应被理解为恢复执行能力。

## 5. 验证记录

| 门禁                                                                                       | 结果                                                                                                                                              |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run check`（76 文件变更集）                                                           | 通过（lint 2 warning 为既有测试未用变量；autofix 5 文件 import 排序已复核入库）                                                                   |
| `packages/openapi` 2 个 responses 测试套件                                                 | 失败为**基线既有**：stash 本 PR 全部改动后同命令同样 `Cannot find '@/const/documentHistory'`（包独立 vitest 配置的 alias 解析问题，与本变更无关） |
| `aiAgent.operationReadGuard` 超时                                                          | 宽并行批次下 DB hook flaky，单跑 7/7 通过                                                                                                         |
| `pnpm type-check`（apps/server，workspace-wide）                                           | 302 errors ≤ 309 基线，本变更触及路径零新增                                                                                                       |
| 客户端 vitest `src/services/agentExecution`、`agentGroup`/`runAgent`/`conversationControl` | 122 tests 通过                                                                                                                                    |
| 服务端 agentExecution + aiAgent 相关 vitest                                                | 95 tests 通过                                                                                                                                     |
| 实机冒烟（P20 dockerless 栈，迁移后重启）                                                  | auth 200、`agentQuota.listAccounts` → `[]`、退役 `/api/v1/chat` 仍 404 —— facade 迁移后产品行为不变                                               |
