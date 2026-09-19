# 任务执行契约（TaskExecutionContract）

> 对应 P11（执行约束与任务上下文装配）：把任务目标 / 禁止项 / 依赖 / 验证冻结为
> 版本化运行约定，持久化到运行行，重试 / 续聊 / 纠偏合并重新绑定同一契约。

## 契约内容

`TaskExecutionContract`（`packages/types/src/task/index.ts`）在运行注册时由
`buildTaskExecutionContract`（纯装配器）从权威输入组装，写入
`task_topics.contract`（jsonb，`0176_task_topics_contract.sql`）：

| 字段                                                                     | 来源                                                                  |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `versions`（task/requirement/policy/planRevision + executionGeneration） | `task_dispatches` 行在 claim 时的快照                                 |
| `environment`（repo/branch/workdir/device）                              | 与 `environment_snapshot` 同一来源（provisioned workspace /override） |
| `integration`（base/branch/expectedBaseSha/expectedHeadSha/repo）        | `TaskTopicIntegration` 关键字段钉选                                   |
| `tools`                                                                  | 本轮挂载的 required builtin tool 集合（`pluginIds`）                  |
| `acceptance.enabled`                                                     | `resolveTaskAcceptance`（与提示词同一判定）                           |
| `budget`（round/maxRounds）                                              | `buildTaskPrompt` 的 goalLoop —— 与提示词渲染的是同一个值             |
| `delegation.grantId`                                                     | 委托执行的授权凭证（仅 delegated run）                                |
| `schemaVersion`                                                          | 契约 schema 版本（当前 `1`）                                          |

## 装配语义

- **版本钉选**来自 dispatch 快照而非 `tasks` 当前值 —— 任务运行期间用户
  修改需求不会改写已注册运行的契约。
- **预算与提示词同源**：`buildTaskPrompt` 返回 `goalLoop`，契约冻结的
  `maxRounds`/`round` 即渲染给 agent 的预算，不存在提示词说一套、契约
  记另一套的漂移。
- **工具集合**即本轮实际挂载的 `pluginIds`（task + 按需 brief/acceptance
  evidence），副本写入防止挂载方后续修改扩大契约。
- **未授权不伪造**：无 goal 的任务 `budget.maxRounds=null`（不设上限），
  无 delegation/integration 时字段缺省，不为补齐形状而编造来源。

## 分角色最小上下文（现状核对）

`buildTaskPrompt` 的上下文全部来自任务图本身（本任务 topics/handoffs、
comments、subtasks、依赖、verify 准则、goalLoop 失败项）—— 不拉取跨用户
历史；`resolveGoalLoopContext` 只注入上一轮的未通过检查与用户拒收意见
（有来源的参考），历史相似失败不会自动升级为禁止项。相似历史与禁止项的
规则继承维持现状：硬约束只来自任务自身 config/verify/goal 记录。

## 验证

- `buildTaskExecutionContract.test.ts`：钉选版本 / 工具 / 验收 / 环境、budget
  与 goalLoop 同源、delegation/integration 按需出现、工具列表拷贝防扩大。
- `bun run check`：7 文件 lint + 61 tests 全绿。
