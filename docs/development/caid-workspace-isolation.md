# CAID 工作区与运行资源隔离（P14）

> 交付方式按计划：强化现有 `TaskWorkspaceService`，不重写工作树管理器。

## 唯一 worktree /branch 与派发绑定

- 每次全新 attempt 通过 `taskBranchName(identifier, seq)` 得到唯一分支
  （`task/T-1`, `task/T-1-r2`…），`deriveWorktreePath` 在设备上生成与
  `repoPath` 同级的隔离目录。
- 派发绑定：`task_topics.dispatchId`（部分唯一索引）+ `integration` jsonb
  在 `startRun` 同事务落库 —— worktree/branch 与 dispatch/fence 的关系
  可回溯，不存在无归属的工作树。
- 固定基线：device 侧 `forkRef` 是本地 `origin/<base>` 远端跟踪引用
  （最后抓取的已集成状态），sandbox 侧契约要求从 `origin/<baseBranch>`
  建分支；已集成的 SHA 语义由 `TaskTopicIntegration.expectedBaseSha` /
  `expectedHeadSha` 在交付完成时捕获并验证（P15 集成队列消费它们）。

## 本次加固（provisionOnDevice）

1. **启动前检查**：
   - `repoPath` 必须为设备上的绝对路径（`/`、`C:\` 或 UNC），否则
     `deriveWorktreePath` 会产生相对路径落到不可预测位置 —— 直接拒绝。
   - `resolveBase` 现在始终用 `listGitRemoteBranches` 做可用性探针；
     显式配置的 `baseBranch` 必须真实存在 `origin/<base>`，不再盲目信任，
     在 create 之前以可读错误失败。
2. **中断 provisioning 幂等恢复**：`listGitWorktrees` 检查约定路径
   —— 同路径同分支 = 上一次 add 与注册之间崩溃的同一调用，直接复用；
   同路径不同分支 = 半成品残留，force-remove 后重建；add 返回
   "path already exists" 且列表中不可见 = git 未记录的目录残留，
   force-remove 一次后重试一次，仍失败则原样抛出。该路径由本服务
   命名约定独占，不含任何已运行工作 —— 恢复安全。

## 维持不变的既有保证

- **用户工作树不受触碰**：worktree 是 `repoPath` 的兄弟目录；provision /
  cleanup 从不对 `repoPath` 本身执行 reset/clean；`discardUnregistered`
  在 `worktreePath === repoPath` 时直接返回。
- **失败现场保留**：运行中的 worktree 不被清理；`taskIntegration`
  的清理按 ownership（`integrationOwnerTopicId`）、产物持久化
  （`pushedToRemote` / `integratedSha`）排序，重复 cleanup 幂等。
- **不把 worktree 当安全沙箱**：隔离语义仅限文件系统目录；权限边界
  仍在 ACP /deviceGateway 层，git worktree 不提供 sandbox。

## 边界（未做，按计划）

- ref→SHA 解析需要新的 device RPC；`expectedBaseSha` 已在交付时由
  integration 校验补齐，SHA 钉取不做本 PR 范围。
- 测试端口 / DB / 队列 namespace 的隔离由运行资源各自的机制负责，
  不引入新的 namespace 分配器。
