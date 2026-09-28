# CAID 版本化计划与增量 DAG

> 对应 P12：在现有 Goal/Task graph 上加入 CAID planning policy ——
> append/replace/retire 增量补丁 + `expectedPlanRevision` CAS。

## 入口与校验链

`lh goal plan` / `goal.submitPlan`（及 operation-authenticated
`submitOperationPlan`）的同一个 `GoalManagerService.submit` 现接受第五个 action：

```json
{"action":"patch","strategy":"caid","expectedPlanRevision":0,
 "patches":[{"op":"append","key":"a","task":{...},"dependsOn":["<nodeId|key>"]},
           {"op":"replace","nodeId":"...","title":"...","description":"..."},
           {"op":"retire","nodeId":"..."}]}
```

提交仍走原有幂等 / 鉴权链：turn token + operation 身份 + 快照一致性 +
`state.submitted` 首写赢（重复提交幂等返回 `duplicate`）。

## 规则（全部服务端强校验，在单个事务内）

1. **`expectedPlanRevision` CAS** — 与 `config.caidPlan.revision`（首个 patch
   前为 0）比对；不等即 `CONFLICT Stale plan revision`，整个批次不落任何
   改动（同事务回滚）。成功后 revision 在同一事务内 +1。
2. **在飞工作不阻塞 patch** —— `patch` 不受 `tasks`/`verify` 的
   "existing work must be delivered" guard 约束（增量计划的意义即如此），
   但 `decisions pending`、快照失效、预算耗尽等既有门禁照常生效。
3. **append**：新建 `proposed` task 节点；`dependsOn` 可引用现有节点 id 或
   同批次 `key`；目标必须是非终态 task 节点；自依赖与循环（既有 +
   新增 `depends_on` 边做 DFS 环检）拒绝。
4. **replace/retire**：目标必须是非终态 task 节点；节点已绑定 `taskId`
   或 status `active`（= contract 已冻结、正在运行）时拒绝 ——
   运行中节点不可静默改写，需要取消 / 等待 / 显式重规划；retire 还要求无
   `depends_on` 依赖方（含同批次新增依赖）。
5. 批次原子：任一补丁失败，整批节点 / 边 /revision 一并回滚。

## 维持不变的语义

- Task 仍是唯一工作项 —— 不新建平行 workflow\_tasks；新节点照旧经
  `proposed` → 既有 dispatch 仲裁。
- 旧 `tasks`/`verify`/`retry`/`escalate` 策略及其 unfinished guard 原样保留。
- Manager 文本不直接成为数据库权威：所有补丁落在同一事务校验后生效。
- 用户硬约束（budget、acceptance、decision gates）不由 patch 改变。

## 验证

`manager.test.ts` 新增 `CAID incremental plan patches`（5 例）：takeover
轮次中 append 带依赖落地且 sibling 不受影响；stale revision 拒绝且零写入；
同批 key 循环拒绝；replace/retire 冻结节点拒绝；同批次依赖者存在时 retire
拒绝。
