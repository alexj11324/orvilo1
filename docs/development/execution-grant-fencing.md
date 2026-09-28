# 执行授权与提交栅栏

`agentDelegation` 服务（`apps/server/src/services/agentDelegation/`）给被委托执行提供**活性授权 + 提交栅栏**双层保护：撤权、降级或过期之后，运行中的任务不能继续产生受控副作用。

## 授权铸发（mint）

`mintExecutionGrant` 为一次委托生成 grant 行。仅当委托主体是 `user` 时写入 `authzVersions.workspaceAuthzVersion`—— 版本栅栏只对 user 主体有意义；对非 user 主体写版本会铸出提交时永远满足不了的栅栏。

## 活性声明（claim）

`claimExecutionEpoch` 在同一事务内完成三件事：

1. `SELECT ... FOR UPDATE` 锁住 grant 行；
2. 校验 grant 未撤销、未过期、授权版本仍匹配；
3. bump `executionEpoch` 并返回给调用方。

调用方未传入 executor 时函数自开事务 ——`FOR UPDATE` 的行锁只在事务生命周期内持有，autocommit 下锁会在校验与 bump 之间提前释放，撤权可以插进窗口。

## 提交栅栏（assertMayCommit）

`taskRunner` 在 dispatch 注册持久化之前调用 `assertMayCommit({ epoch, grantId, taskId, topicId })`：再次在事务内校验 grant 活性与 epoch 一致性。claim 抛出时，dispatch 路径必须先把 topic 标为 `failed` 再向上抛 —— 否则行会卡在 `running` 等看门狗兜底，撤权期间的失败语义也被掩盖。

## 不变量

- 任何受控副作用（注册 attempt、写 task/topic 状态迁移）之前都必须过 `assertMayCommit`。
- epoch 是单调的：claim 成功即 bump，晚到的完成携带旧 epoch 时 commit 栅栏拒绝写入 Done。
- 撤权 → 版本失配 → claim/assert 失败 → topic/task 落到 `failed`，而不是悬挂。
