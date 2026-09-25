# CAID 集成队列与 exact-head 交付（P15 审计）

范围：`apps/server/src/services/taskIntegration`、`taskDeliveryReview`、
`githubRepo` 远端助手与 device git RPC 面。P14 已交付 provision 侧前置检查；
本 PR 只强化「把已完成的 task 分支落到 base」这一段。

## 交付边界分级

- `execution done`：topic 完成回调进入 `integrateOnComplete`；此时任务只是
  跑完，不是交付完成。
- `integrated`：`task_topics.integration.state='integrated'` 且
  `integratedSha`/`expectedHeadSha`/`expectedBaseSha`/`prNumber` 已持久化。
  本地路径要求 push 到 `origin/<base>` 成功且设备回执确认
  `pushedSourceRef === sha`；远端路径要求 `verifyRemoteMerge` 按
  冻结的 head/base SHA + PR number 重新确认（`landRemoteMerge` /
  `markDeliveryMerged`）。
- `task completed`：仅当 integration settle/hold 裁决后由生命周期 /
  `driveTaskFromVerify` /review sweep 落 `completed` ——
  `activeDeliveryRow` 要求 `executionGeneration` 匹配，旧代次证据不结算新
  run。依赖解锁消费 task 的终态，因此只有 `integrated` 能放行下游。

## 同 repo/ref 串行（本次新增）

- `withRepoRefLease` 把 claim 之后的 merge→publish 关键段包进
  `pg_advisory_xact_lock(REPO_REF_INTEGRATION_LOCK_NAMESPACE, hashtext('caid-integration:<repo|device:path>#<base>'))`。
  工程师 run 仍然并行；只有落库同一 repo/ref 的集成排队，后一个 merge 在
  锁内重新 baseline 到刚发布的 base。
- `mergeGitBranch` 新增 `fetchBase`（device RPC 全链路：
  `deviceGateway` → `device-control/dispatch` → `GitCtr` →
  `local-file-shell/git`）：合并前 `git fetch origin
+refs/heads/<base>:refs/remotes/origin/<base>`，再 `reset --hard` —
  否则 `origin/<base>` 跟踪 ref 陈旧时会在旧基线上产生永远无法 push 的
  merge commit。fetch 失败不致命，push 仍是远端真相的裁决点。
- `retryLocalPublish`：`publish_failed` 重试先重推记录的
  `integratedSha`（幂等、覆盖网络闪断）；若被拒原因是 non-fast-forward
  且记录属于原始 task 行，则回到 `integrateTaskRun` 在新的 base 上重新
  merge（produce 新 SHA），而不是永久重推一个不可能落地的提交。
  corrective 行不重新 merge —— 其 merge 内容在 integration worktree 里，
  reset 会丢掉已解决的冲突现场。

## PR-first（GitHub）路径 —— 已满足项审计

- `taskDeliveryReview` sweep：`activeDeliveryRow` 用 executionGeneration
  屏蔽旧代次；head/base/PR number 与冻结 `expectedHeadSha` 绑定，漂移的
  PR 判 waiting/blocked；`markDeliveryMerged` 逐项校验
  merged/mergedAt/mergeCommitSha/baseBranch/headBranch/prNumber/headSha
  后才落 `integrated` 并完成 task。
- CI： `classifyChecks` 按 app+name 取最新 run，merge head 与 headSha 必须
  一致；全部 skipped 视为 pending（`No delivery CI check executed
successfully`），review decision REVIEW\_REQUIRED/CHANGES\_REQUESTED 也进
  pending；合并边界二次 `getPullRequestReviewSnapshot` 重新裁决，merge 用
  `expectedHeadSha` 防 TOCTOU，合并后再确认 `confirmed.merged`。
- 合并冲突 / CI 失败 /review 意见 → `dispatchCorrective`（`role:'integrate'`
  种子行，attempts ≤ 5）在原 PR 上续推，任务保持 paused；人工
  pause/closed-PR 不会自动恢复或重试。

## 本地 repo（local-git）路径 —— 已满足项审计

- 集成 merge 在 run 独占的 detached integration worktree 中执行
  （`integration-<base>-<topicId>`），用户主工作树永不写入；
  `mergeGitBranch`/`finalizeGitMerge`/`pushGitBranch` 全部携带
  `expectedHead`/`expectedSha` 校验，设备端拒绝发布非预期提交。
- 冲突 → `dispatchCorrective`（attempts ≤ 3）回同一 worktree；超限或设备
  不可用 → `blocked` + `blockRelated` 熔断同分支行，随后幂等清理。
- `pushedToRemote`/`integratedSha` 持久化后才算 settled；push 失败留
  `publish_failed` 供有界重试，不宣称成功。

## 边界（明确不做）

- 远端（GitHub）合并自身由 GitHub/branch protection 串行裁决；lease 只为
  本地 device merge 提供必要的串行，不重建远端 merge 语义。
- 设备上 `origin/<base>` 之外的外部推送不可控；lease+fetchBase 使其收敛为
  「重新 baseline 后重试」，而非协议级 CAS。
- git worktree 不是安全沙箱（同 P14）：lease 管并发正确性，不管权限。

## 验证

- `bunx vitest run services/taskIntegration`：53 passed（新增 6：lease
  获取顺序、并发同 ref 串行、fetchBase 传递、HEAD 跳过、non-ff 重合并、
  corrective 行不重合并）。
- `bun run check`：lint clean。
