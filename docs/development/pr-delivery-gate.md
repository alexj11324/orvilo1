# PR 交付门禁

交付门禁（`taskDeliveryReview` + 相关 trigger）把「任务完成」与「PR 生命周期」绑定：实现任务产出的 PR 走完 review-fix 并真正 merge 后，任务才能落到 Done。

## 语义

- 只有绑定远程仓库（`config.workspace.repo`，或经 project/team 仓库关联解析出 `repo`）的 git 交付任务才要求 PR 证明；本地 `repoPath` 工作区保持本地完成语义。
- 证明与**当前执行代**绑定：证明行必须满足 `task_topics.execution_generation = tasks.execution_generation`。重跑 bump 代际后，历史 merged PR 不能替代新交付。
- PR 未 merge 前任务保持 in-flight；merge 事件驱动任务推进到 Done。
- review-fix 循环内的任务不会被提前标记完成。

## 实现要点

- 代码从 #25 移植到 canary 基底，适配了 `OrviloDatabase` 类型名与 `createdByUserId` 可空的签名（sweep 循环显式 guard 后以 `ownerId` 参数传递）。
- 合约 prompt 更新为「fetch + 只在交付分支工作 + 必要时 `gh pr create`」，避免执行侧误用 `git checkout -B` 覆盖。
- Drizzle 迁移追加在 canary 既有迁移之后（编号 0175），与主干迁移序列不冲突。
- sweep 扫描先做 SQL 预过滤（当前代 repo-bound delivery 行），避免 50 条普通任务把扫描额度耗尽；全循环受 `REVIEW_SWEEP_BUDGET_MS`（10min）约束，给 watchdog 的 15min 执行窗口留余量。
- 合并决策点双重栅栏：重读 task 行校验 `executionGeneration`/状态/未删除（防扫描期间的 restart/cancel/delete），再重读 PR snapshot 校验 CI/评审状态仍为 green 且 headSha 未动。
- `integrated` 但任务未完成的行会被 sweep 收养并重试完成转移（覆盖 updateIntegration 与 updateStatus 之间崩溃的窗口）；`pending`/`merging` 等已交付但未绑定 PR 的行由 sweep 建立 PR 纳入 review。
- 评审反馈游标排除交付凭据属主（`GET /user`）自己发表的评论，防止纠正性 run 对自身回复循环派发；`/user` 不可读的凭据（如 installation token）降级为不排除——此类 actor 以 Bot 身份发帖，本就被过滤。
- trigger 的祖先继承深度（0..9）与 `resolveWorkspaceConfig` 的 `WORKSPACE_INHERIT_DEPTH` 严格对齐；`provider=git` 但既无 `repo` 也无 `repoPath` 的畸形绑定 fail-closed。

## 不变量

- 晚到的完成事件不能越过 merge 门禁把任务写成 Done。
- 交付 review 触发条件只认「有 PR」，不凭启发式猜测。
- 撤权/重跑/删除后，旧的合并快照不能落进新执行代。
