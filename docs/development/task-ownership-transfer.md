# 任务执行所有权移交（Execution Ownership Transfer）

> 对应 #343 / #356：把 assignee 变更从普通属性编辑提升为 execution-control
> 操作，保证「数据库里的负责人」和「实际在执行的人」永不分裂
> （split-brain），也永不经过 `A → nobody → B` 空窗。

## 不变量

**`status = 'running'` 的任务不允许通过普通 update 改写 `assigneeAgentId`。**

这条不变量下沉在 `TaskModel.update()`（`packages/database/src/models/task.ts`）：
所有 assignee 写路径 —— 不只是 tRPC `task.update`—— 都在事务内 `FOR UPDATE`
锁住任务行后检查：

- `before.status === 'running'` 且 `assigneeAgentId` 发生变更（含置 `null`）
  → 抛 `TaskHandoffRequiredError`（HTTP 409 `HANDOFF_REQUIRED`）。
- 同值写、非 running 任务、以及原子「park + 换 assignee」
  （同一 `data` 里把 `status` 写成非 running）放行。
- 原子 park+reassign 只存在于 `TaskModel.update()` 层，供已经先完成
  fencing 的内部协议使用；公开 API（`task.update` → `updateWithLog`）
  对 running 任务的任何 assignee 变更一律要求 `task.handoff`，不开放
  该逃生口。
- 协议写必须显式携带 `mutation.executionTransfer: true` 才能越过该检查；
  这是内部协议的唯一合法旁路，等价于签名声明「我已在更新前 fence 了
  incumbent dispatch」。

`updateWithLog`（用户面写路径）此前已有同等检查，现在与底层 `update()`
双重把关；任何未来的 service /sync/orchestrator 入口都不可能再绕过。

## 统一移交原语

`transferTaskExecutionOwnership`（`apps/server/src/services/taskOwnership`）是
所有非交互入口共用的最小原语：

```
fence incumbent dispatch（requestStopForTasks）
  → taskModel.update(assignee, { ...mutation, executionTransfer: true })
  → cancellation sweep 收敛并 park（settle → paused）
```

后继调度由调用方的编排器决定（park policy）。

三个入口的策略：

| 入口                                 | 路径                                                              | 后继策略                                              |
| ------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------- |
| UI `task.handoff`                    | `TaskService.handoffTask`（`cancel_and_restart`）                 | fence → CAS → settle → `runTask` 为继任者重启         |
| Linear inbound（`updatePublicTask`） | 检测「running + assignee 变更」→ `transferTaskExecutionOwnership` | park；`reason: 'linear_assignee_change'`              |
| Goal `setAgent`                      | 先对 running 集合 `requestStopForTasks('goal_agent_change')` 再写 | 与原来一致 ——coordinator 按 goal 自动调度策略重新派发 |

## CAS

- `task.handoff`：`expectedDomainRevision` **必填**（schema 层 `min(1)`）。
- `task.update`：携带 `assigneeAgentId` / `assigneeUserId` 时
  `expectedDomainRevision` **必填**（否则 400），消灭 stale reassignment
  造成的 lost update。
- 前端：detail store 的 `updateTask` 在负载缺 revision 时通过
  `taskService.find` 惰性取回 `domainRevision`（detail payload 本身不带该字段），
  乐观更新先于取值派发、不阻塞 UI；`handoffTask` action 同样以行内数据为准。
  MyWork 批量改派从 `WorkQueryBoardTask.domainRevision` 直取。

## UI

Running 任务的 agent 选择器不再禁用：选择新 agent 弹出确认
（`taskDetail.handoff.*`，en-US /zh-CN 已翻译），确认即调用 `task.handoff`；
取消零副作用。非 running 任务维持普通 `updateTask` 路径。
