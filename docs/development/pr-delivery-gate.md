# PR 交付门禁

交付门禁（`taskDeliveryReview` + 相关 trigger）把「任务完成」与「PR 生命周期」绑定：实现任务产出的 PR 走完 review-fix 并真正 merge 后，任务才能落到 Done。

## 语义

- 只有产生 PR 的 git 交付任务才进入交付 review；没有 PR 的任务不会卡在 review 态。
- PR 未 merge 前任务保持 in-flight；merge 事件驱动任务推进到 Done。
- review-fix 循环内的任务不会被提前标记完成。

## 实现要点

- 代码从 #25 移植到 canary 基底，适配了 `OrviloDatabase` 类型名与 `createdByUserId` 可空的签名（sweep 循环显式 guard 后以 `ownerId` 参数传递）。
- 合约 prompt 更新为「fetch + 只在交付分支工作 + 必要时 `gh pr create`」，避免执行侧误用 `git checkout -B` 覆盖。
- Drizzle 迁移追加在 canary 既有迁移之后（编号 0174），与主干迁移序列不冲突。

## 不变量

- 晚到的完成事件不能越过 merge 门禁把任务写成 Done。
- 交付 review 触发条件只认「有 PR」，不凭启发式猜测。
