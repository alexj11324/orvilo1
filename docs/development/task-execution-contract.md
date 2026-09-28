# 任务执行契约（TaskExecutionContract）

> 对应 P11（执行约束与任务上下文装配）：把任务目标 / 禁止项 / 依赖 / 验证冻结为
> 版本化运行约定，持久化到运行行，重试 / 续聊 / 纠偏合并重新绑定同一契约。

## 契约内容

`TaskExecutionContract`（`packages/types/src/task/index.ts`）在运行注册时由
`buildTaskExecutionContract`（纯装配器）从权威输入组装，写入
`task_topics.contract`（jsonb，`0176_task_topics_contract.sql`）：

| 字段                                                                      | 来源                                                                  |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `versions`（task/requirement/policy/planRevision + executionGeneration）  | `task_dispatches` 行在 claim 时的快照                                 |
| `environment`（repo/branch/workdir/device）                               | 与 `environment_snapshot` 同一来源（provisioned workspace /override） |
| `integration`（base/branch/baseSha/expectedBaseSha/expectedHeadSha/repo） | `TaskTopicIntegration` 关键字段钉选                                   |
| `tools`                                                                   | 本轮挂载的 required builtin tool 集合（`pluginIds`）                  |
| `acceptance.enabled`                                                      | `resolveTaskAcceptance`（与提示词同一判定）                           |
| `budget`（round/maxRounds）                                               | `buildTaskPrompt` 的 goalLoop —— 与提示词渲染的是同一个值             |
| `delegation.grantId`                                                      | 委托执行的授权凭证（仅 delegated run）                                |
| `schemaVersion`                                                           | 契约 schema 版本（当前 `1`）                                          |
| `content`（instruction/verify/dependency receipts）                       | R06 起：提示词策略正文冻结进契约（见下「不可变内容与依赖回执」）      |

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

## R06 加固（F07 修复）

### 不可变内容（contract.content）

`content` 冻结本轮提示词的策略正文 —— `instruction`（含 verify 门禁与依赖
回执的渲染源）、`verify` 配置、`dependencies` 回执列表。续聊 / 纠偏重开时
`buildTaskPrompt` 以 `contractContent` 继承模式直接渲染契约内容，而不是
重新从 `tasks` 当前值取 —— 任务运行期间被编辑不会隐式改变同一 attempt
的指令与验收口径（指令冻结、依赖回执冻结；活体依赖仍按图调度）。

### base 来源钉选（baseSha /baseShaHistory）

- 设备路径：worktree add 后立刻 `inspectGitWorktreePath` 复检，取
  `listed.head` 写入 `integration.baseSha`；复检不到正确 checkout 则拒绝
  提供（不再信任 `origin/<branch>` 可变引用）。
- 远端（sandbox）路径：`getRemoteBranchSha(repo, base)` 在 clone 前钉选
  base 提交，写进 `integration.baseSha` 并附在 provision prompt 里。
- 每次 re-baseline 修改 `expectedBaseSha` 时，旧值进入
  `integration.baseShaHistory[]`（finalize /corrective/captureIdentity/
  landMerge 四个写点统一经 `withBaseShaHistory`）。

### 依赖输入过期标记（inputStale）

`markStaleDependencyInputs` 挂进 `cascadeOnCompletionMany`：上游完成
（新交付或回滚）后，依赖方仍在运行的 topic 若其契约回执与最新交付
不匹配，则 `handoff.inputStale[]` 追加 `{dependsOnId, detectedAt,
expectedDelivery, observedDelivery}` —— 审计上区分「构建在现存交付上」
与「构建在已被取代的交付上」。同 topic 同 SHA 的重投递不算过期。
