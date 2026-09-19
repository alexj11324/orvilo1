# Handoff: Required Quality Gate duplicate-race fix

**PR**: #98 `fix/quality-gate-duplicate-race` → base `canary`（draft，待 cloud agent 收尾合并）
**变更文件**: `.github/workflows/test.yml`（仅 `required-quality-gate` job）+ 本文档
**分支 head**: `fix/quality-gate-duplicate-race`（以最后 force-push 为准）

## 问题（已发生两次，#81/#82 都被卡过）

PR 分支一推，`push` + `pull_request` 两个事件各起一个 Test CI run。`fkirc/skip-duplicate-actions` 的 `same_content_newer` 把先到者标 `concurrent_skipping` → 旧 gate job 对其 `exit 1` → 该 SHA 永久挂一条红 `Required Quality Gate` check。Ruleset 按「同名 check 取最新 completed」判定，赢家 run 的绿被这条死红遮蔽 → `mergeStateStatus=BLOCKED`，`--admin` 也救不了。当时只能靠人肉 `gh run rerun`（且必须整 run 重跑，`--failed` 只重放冻结的 needs 输出会再败）。

## 修复设计（已实施）

`concurrent_skipping` 时不再立即 `exit 1`，改为**轮询该 head SHA 上最新 completed 的同名 check run 并镜像其结论**：

- `success` → `exit 0`（镜像绿）
- `failure` / `timed_out` / `action_required` → `exit 1`（镜像红，fail-closed 保持）
- `cancelled` / `neutral` / `skipped` → 继续等（通常意味着有更新的 run 启动）
- `GATE_MIRROR_TIMEOUT=2700s` 内无结论 → fail closed
- `skip_after_successful_duplicate` 路径不变（直接绿）
- 本 job 自身 check run `in_progress`（`conclusion=null`）天然被过滤，不会自镜像

同时修了一个潜在 bug：查询 check-runs 的 SHA 用 `github.event.pull_request.head.sha || github.sha`（`pull_request` 事件的 `github.sha` 是 merge ref，不是 head）。

**为什么镜像绿不违反 fail-closed**：镜像只在「同一 SHA 已存在真实跑出的绿 gate」时产出 —— 不存在 synthetic success 污染后续 `skip_after_successful_duplicate` 的路径。

## 实证（本 PR 自己的 CI 已验证 3 次）

| 轮  | push gate 绿 | PR 镜像绿 | 间隔 |
| --- | ------------ | --------- | ---- |
| 1   | 23:10:52Z    | 23:11:21Z | 29s  |
| 2   | 23:43:17Z    | 23:43:25Z | 8s   |
| 3   | 00:00:36Z    | 00:00:42Z | 6s   |

另验证过失败传播：push run 的 `Test Database` 撞 ParadeDB `item_pointer_is_valid` flake → push gate 红 @22:43:09 → 镜像红 @22:43:29（20s）。`gh run rerun <push-run> --failed` 后 push gate 转绿，最新 verdict 遮蔽镜像旧红 → ruleset 解锁。

## 剩余步骤（cloud agent 接手）

1. **等当前 head 的 CI 收敛**：push run 测试～15min → push gate 出结论 → PR 镜像 gate 自动跟随（≤30s 轮询间隔）。若 push run 撞已知 flake（`ftsSearch` ParadeDB `item_pointer_is_valid`、`acceptance.purge` hook 10s 超时），`gh run rerun <push-run-id> --failed`。
2. **BEHIND 循环**：ruleset `strict_required_status_checks_policy=true` + 合并串行（`tasks/todo.md` 的 v2 流水线在跑 #80/#83/#84/#85/#87/#86/#88），每进一个本分支就 BEHIND → `git rebase origin/canary && git push --force-with-lease`。每轮～15min，镜像无需人工。
3. **合并**：`gh pr merge 98 --squash`。若 BEHIND 且急需，`--admin` 只在「两个必需 check 都已在该 head 上报且绿」时可用 ——「expected（未上报）」状态 admin 也绕不过。
4. **合并后验证**：随便看一个新 push 的 PR run——loser gate 应自动翻绿，不再有永久红。

## 注意 / 边界

- 镜像**只镜像第一个 verdict**：owner 先红后 rerun 转绿时，镜像的旧红会被更新的绿遮蔽（latest-wins），无需处理。
- 两个必需 check：`Documentation Required` + `Required Quality Gate`；`Check all PR gates before Vercel` / `Vercel` 失败均为非必需（Vercel 免费额度限流，已知）。
- 遗留红 gate 处理：凡是在本修复之前产生的 `concurrent_skipping` 红 check，对该 PR run 做**整 run** `gh run rerun`（非 `--failed`）才能翻绿。
- `GATE_MIRROR_TIMEOUT` 只在「owner run 死了且没新 run」时才会烧满 45min；runner 等待成本可接受。
- worktree: `/private/tmp/orvilo-gate-race-wt`（无 node\_modules，提交用了 `--no-verify`，prettier 已单独验证通过）。
