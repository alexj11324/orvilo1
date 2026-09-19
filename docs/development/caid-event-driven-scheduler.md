# CAID 事件驱动就绪调度（P13 审计）

> 结论：持续异步调度主干已存在 —— 本 PR 只补一个真实缝隙：派发领取时对
> `depends_on` 的**领取时刻复检**。其余验收项逐条对账如下。

## 派发仲裁的唯一入口

所有自动派发入口都汇到同一个 `TaskDispatchModel.request → claimForProvisioning
→ transition/fence` 链，不绕过部分唯一索引：

| 入口                        | 触发                                                       | 到达仲裁的路径                                         |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| Goal 协调器 `dispatch_task` | `tick` → `dispatchWork`                                    | advisory-lock 领取后 `runTask(trigger:'goal')`         |
| 任务级依赖完成级联          | `cascadeOnCompletion`                                      | `runTask(trigger:'orchestrator')`                      |
| 心跳 / 定时 / 手动          | `task.run`、heartbeat、schedule                            | `runTask(trigger:…)`                                   |
| Linear planning             | `linearSync/planning`                                      | `model.request(requestedBy:'orchestrator:planning:*')` |
| 租约恢复                    | `resumeAbandonedTaskRecovery` / `recoverAfterVerification` | `runTask` → `prepare`                                  |

`runTask` 无条件 `taskDispatch.prepare()`：`request` 在 Task 行锁内解析幂等
键、生成代际、revision 快照（plan/policy/requirement/task）；`claimForProvisioning`
以 fence+1 + `phase='claimed'` 做 CAS。多入口并发只产生一个派发 ——
部分唯一索引是数据库兜底，`busy` 返回既存 dispatch 而不是第二份运行。
重复事件（同一 `idempotencyKey`）返回 `existing`，天然幂等。

## 完成事件 → ready set

- **receipt 语义**：`selectFrontier` 用 `depends_on`（dependent → prerequisite）
  对 `resolved` 集做局部 ready 计算 —— 完成事件（settle/verify/toolExecution）
  统一走 `scheduleGoalAdvance` 唤醒协调器，与事件到达顺序无关，乱序、重复
  安全。
- **半成品不得判完成**：`decideWithoutFrontier` 要求全部 task 节点终态
  （resolved/rejected/retired）才进入 terminal acceptance；ready 为空但有
  未完成节点 → `no_frontier`（暂停在可视原因上，绝不 achieved）。
- **本次新增（claim-time 复检）**：`tick` 的 frontier 排名用的是快照；P12 的
  `patch`（或并行人工 Gate 决议）可以在快照读取与 dispatch 领取之间提交
  新 `depends_on` 边或退役节点。`dispatchWork` 在 advisory-lock 事务内已重读
  graph 校验 goal 状态 / 预算 / 容量，现在同样对**当前** graph 复检节点终态与
  `depends_on` 未满足项 —— 命中即 `blocked`，不领取、不派发，任务保持
  `backlog` 等下一次完成事件。

## 容量的原子占用

- **Goal 级**：`pg_advisory_xact_lock(GOAL_DISPATCH_LOCK_NAMESPACE, goalId)`
  内 `countRunningTasks` + `claimGoalTask` 同步发生 —— 计数与领取同事务，
  `maxConcurrentTasks` 不可被并发 tick 越界。
- **Project 级**：`projectDispatchWaitingReason` 在行锁事务内计数
  `PROJECT_CONCURRENCY_PHASES`，超限 → `phase='waiting'` + `waitingReason`，
  容量释放后由下一次 request 自动 resume。
- **未知派发不释放 owner**：取消走 `cancel_requested` phase + 租约；孤儿
  （provisioning/dispatched/running 租约过期）只能经 `claimForRecovery` 转为
  `outcome_unknown` 做 reconcile —— 不得据此启动第二个进程。

## 可重放 / ACK 丢失 → reconcile 而非重启

- 唤醒投递：`scheduleGoalAdvance`（Hatchet 队列，dev/desktop 为 in-process
  timer）— 队列失败只记错误日志，不吞掉语义。
- 丢失唤醒：`findPlanningStartCandidates`（`phase='requested'` 且
  `planRevision` 非空的 orchestrator 派发）与 `findRecoveryCandidates`
  （租约过期的 provisioning/dispatched/running/outcome\_unknown）由 sweep
  按稳定 operation identity 认领重放。
- `settle` 以 `expected` 相位 + fence + generation 三元 CAS 结算，重复 ACK
  幂等。

## 边界（未做，按计划）

- 不在浏览器 / 内存 `Promise.all` 上实现异步 —— 依赖既有 Hatchet + DB 行。
- 集成队列与 exact-head 交付属于 P15；本 PR 的 "集成" 仍等同于 task 完成。
- `waiting` 的恢复条件沿用既有 project-policy /assignee 语义，未新增等待原因类型。
