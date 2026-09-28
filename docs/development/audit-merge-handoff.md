# 审计修复收尾交接（merge → 验证 → Q0 验收）

> 面向接手 agent 的完整 runbook。目标：把 2026-09-18 审计报告（`/Users/alexjiang/Downloads/orvilo1_pr_audit_2026-09-18.md`，本机路径；GitHub 上无副本）的全部修复项收尾到「已验证的生产就绪」状态。
> 本文同时是实施计划：每个条目记录「做了什么、在哪、还差什么」。

## -1. 环境边界（先读这个，决定你能做什么）

- **远程可做（任何有 `gh` 凭据的机器）**：监控 PR/CI 状态、rerun workflow、合 PR、查 review 线程、改 ruleset、写文档。本文 §2–§4 全部适用。
- **仅本机（alexjiang 的 Mac）可做**：本地 Postgres（Q0 库 `orvilo_q0` 在 localhost:5432）、跑 `bun run dev` 起全栈、`agent-browser` 驱动真实 UI、`/tmp/pr-pipeline.*` 这条正在跑的流水线本身、`/Users/alexjiang/Desktop/vibe/orvilo-*/` 各 worktree、审计报告 PDF/markdown 原文。
- **推论**：云端接手者能完成「合并 + 验证」（§3/§5.1）；**Q0 实机验收（§5.2/5.3）需要本机环境或等效的全栈环境**——若没有本机访问权，请把验收项如实标为「需本机执行」，不要声称做过。
- 本机流水线若在运行中（`ps aux | grep pr-pipeline`），云端不要做同 PR 的 merge——两边撞 `gh pr merge` 会有一边报错（幂等但脏日志）。接手前先查 GitHub 状态，本地流水线停不停由用户决定。

## 0. 一句话现状

9 个审计条目对应 9 个 PR：**#82、#81、#77、#91、#94、#80、#86、#83、#85 已合入 canary**；**#87、#84、#88 在合并队列中**，本机有一条自动化流水线正在串行处理（见 §3）。全部合并后剩：canary 内容验证 → Q0 全量产品验收 → 独立评审。

## 1. 审计条目 → PR → 状态映射

| 条目 | 主题 | PR | 状态 | 合入 commit |
|---|---|---|---|---|
| R0 | 不可绕过 CI 门禁 + digest 固定部署 | #82 | ✅ merged | `6d57bb9b`（较早） |
| — | ownership transfer（前置依赖） | #81 | ✅ merged | — |
| — | 成员自离队 UI | #77 | ✅ merged | — |
| — | Documentation Required 门禁 | #91 | ✅ merged | — |
| — | 隐藏面退役第一波 | #94 | ✅ merged | `d02f13f1` |
| R6 | quota 聚焦/可见性刷新 | #80 | ✅ merged | `73257dff` |
| R5 | 退役服务端技能包分发（被 #94 覆盖，净 diff=文档） | #86 | ✅ merged | `fb70f079` |
| F8 | 任务集合视图选择 bug | #83 | ✅ merged | `9fced303` |
| R1 | 真实 workspace context/成员/权限 | #85 | ✅ merged | `277b5a82` |
| R3 | 执行引擎 provenance（ACP 接缝） | #87 | 🔄 合并中 | 分支 `fix/audit-r3-engine-provenance` |
| R2 | 执行授权活性 + 撤权栅栏 | #84 | 🔄 队列中 | 分支 `fix/audit-r2-execution-fencing` |
| R4 | 任务 PR 交付门禁（迁移 0175） | #88 | 🔄 队列中 | 分支 `feat/audit-r4-pr-delivery-gate` |
| Q0 | 全量集成验收 | — | ⬜ 未开始 | 见 §5 |

合并顺序是刻意的：R2(#84) 在 R4(#88) 前，交付门禁依赖执行栅栏的 epoch/generation 语义。

## 2. 权威状态怎么查（不要相信本文快照）

```bash
# 各 PR 状态
gh pr view <N> --json state,mergeStateStatus,headRefOid --jq '"\(.state) \(.mergeStateStatus) \(.headRefOid[:8])"'
# canary 是否已包含某 PR 的 head（squash 合并后 head 变了，用 PR number 查）
gh pr view <N> --json mergedAt,mergeCommit --jq '.mergedAt, .mergeCommit.oid'
git -C <repo> merge-base --is-ancestor <mergeCommit> origin/canary && echo "on canary"
# 未解决 review 线程数（ruleset 要求=0）
gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved}}}}}' \
  -F o=alexj11324 -F r=orvilo1 -F n=<N> --jq '[.data.repository.pullRequest.reviewThreads.nodes[]|select(.isResolved|not)]|length'
```

**ruleset `trunk-branches`（canary+main）实况**：必需检查 = `Documentation Required` + `Required Quality Gate`；approving_review_count=**0**（合并不需要批准）；required_review_thread_resolution=true；strict_required_status_checks_policy=true（head 必须追平 base → 每合一个，其余 PR 立刻 BEHIND）。

## 3. 合并流水线（本机正在运行）

`/tmp/pr-pipeline.sh`（nohup 后台，4h 硬截止至约 22:47 UTC+8，日志 `/tmp/pr-pipeline.log`）。对每个剩余 PR（#87→#84→#88）循环至多 4 轮：

1. `git merge origin/canary` 进分支 worktree → push（无变更则跳过）
2. 等当前 head 的 **push 事件** `test.yml` run 转绿
3. 对同 head 的 **pull_request 事件** run 发 `gh run rerun <id>`（整 run 重跑，**不要 `--failed`**——`check-duplicate-run` 必须重新求值）
4. `mergeStateStatus` 到 CLEAN/UNSTABLE/HAS_HOOKS → `gh pr merge <N> --squash`；BEHIND 则下一轮

**STOP 码**：2=push run 非绿（查 job 日志定因）；3=mergeable 异常（BLOCKED/DIRTY/超时）；6=canary 合入冲突；7=更新失败；8=有未解决线程；9=轮次耗尽（canary 移动太频繁）。**接手第一步：`tail -30 /tmp/pr-pipeline.log` 看流水线是活着、已完成还是已 STOP。** 若 STOP 按对应码处置后用同脚本重启（PIPE 数组删掉已合 PR）。

分支→worktree 映射（流水线 cd 进去 merge，请保持工作树干净）：

| PR | 分支 | worktree |
|---|---|---|
| #87 | fix/audit-r3-engine-provenance | `/Users/alexjiang/Desktop/vibe/orvilo-r3` |
| #84 | fix/audit-r2-execution-fencing | `/Users/alexjiang/Desktop/vibe/orvilo-r2` |
| #88 | feat/audit-r4-pr-delivery-gate | `/Users/alexjiang/Desktop/vibe/orvilo-r4` |

## 4. CI 机制与已知坑（都已踩过）

- **双 run / duplicate-skip**：`test.yml` 同时触发 `push` 与 `pull_request`。同 SHA 两个 run，其一被 `check-duplicate-run` 标记跳过并 **fail-closed**（`Duplicate skip reason: concurrent_skipping`）。push run 的门禁转绿后，commit 的必需检查即满足；若 `mergeState` 持续 BLOCKED，再对 PR run 整量 `gh run rerun`（走 `skip_after_successful_duplicate` 唯一允许 exit 0 的分支）。
- **ParadeDB flake**：`packages/database` 的 `ftsSearch` BM25 测试偶发 `assertion failed: item_pointer_is_valid(ctid)`（ParadeDB 内部断言，与业务无关，已命中 2 次）。Test Database 失败先看日志——是这个就 `gh run rerun <id> --failed`。
- **Documentation Required**：`pull_request_target` 从保护基线执行，`apps/`、`packages/`、`src/`、`server/` 等功能性改动必须带 `docs/` 变更，无豁免。本批 PR 均已带文档（`docs/development/*.md`）。
- **mergeState 判读**：`UNSTABLE` = 必需检查全过、非必需（如 Vercel）失败/pending → **可合**；`BLOCKED` = 必需检查未满足；`BEHIND` = 要追平 base；`DIRTY` = 冲突。Vercel `Deployment rate limited — retry in 24 hours` 是限流噪音，非必需。
- **coverage job 会 skipped**：`merge-app-coverage`/`merge-server-coverage` 正常显示 `skipped`，不影响门禁。
- **Typecheck 是 job 内联的**：`Test Database` job 内含 lint+typecheck，TS 错误也会让它红——失败先分辨是 lint/TS/单测哪一段。
- **jobs API 只列已调度 job**：needs 未满足的 job 不在 `actions/runs/<id>/jobs` 里，`total_count` 随调度增长——不要拿中期的 job 列表判断门禁 job 缺失。

## 5. 合并后验证 + Q0 验收

### 5.1 合并完整性（合并完立即做）

```bash
git fetch origin canary
git log --oneline origin/canary -12    # 应看到 9 个 squash/merge commit
# 内容抽查（关键语义进 canary）
git show origin/canary:packages/database/migrations/0175_task_pr_delivery_gate.sql | grep -c enforce_task_pr_delivery_before_complete   # ≥1
git show origin/canary:packages/database/migrations/meta/_journal.json | python3 -c "import json,sys; print([e['tag'] for e in json.load(sys.stdin)['entries']][-3:])"
# 期望尾部：174_workspace_ownership_transfers → 175_task_pr_delivery_gate
git show origin/canary:src/business/client/WorkspaceContextSlot.tsx | grep -c Alert   # R1 错误分支
git show origin/canary:packages/database/migrations/ | true
grep -rn "getSkillBundle" <checkout>/apps <checkout>/packages  # 应无生产引用（R5）
```

### 5.2 Q0 验收清单（10 域，逐项做实机验证）

前置：全部合并完成。验收基准 = 合并后 canary 的**同一组合 SHA**。

1. **工作区（R1）**：两用户两工作区私人项目：邀请→接受→进入→刷新深链→切换→离队→旧标签页失效→重邀；成员/邀请/Agent 页/在线光标都来自正确租户；slug 路径终态错误可重试（Alert+retry）。
2. **撤权（R2）**：运行后撤权/过期未 sweep/成员降权/双认领/旧 epoch 回调/断线重连/取消未知/角色移除重邀——旧授权不能写副作用或标 Done。
3. **ACP（R3 + 相关 #90/#76）**：prompt→更新→permission→cancel→恢复 trace 不过旧 AgentRuntimeService；两机器远程走真实 ACP；无绑定/设备离线/协议不兼容/缺桥/重复迟到事件/旧 session 恢复负向；外部浏览器能力逐条对 P60/隐藏面清单。
4. **PR 交付门禁（R4）**：Agent 改码→push→PR→人为 CI 失败+评审意见→同 PR 修复→讨论解决→精确 head 合并→DB Done 全链路；无 PR/未 merge/失败或全 skipped CI/head 被换/冲突/断线/取消未知均不能错误 Done；repoPath-only 本地语义放行；畸形 git 绑定 fail-closed；关联回退同样要 merged PR 证据；旧代证据不解锁。
5. **质量门禁（R0 + #98 若已合）**：必需检查 fail/missing/skipped/pending、head 更新、未解决讨论、来源不符、过时构建、未授权 retag 任一项拒绝提升/部署；成功路径记精确 digest、失败可回滚；duplicate-skip 正确镜像 owning run；浮动标签=最新绿；docs 门禁持续生效。
6. **隐藏面退役（R5+#94）**：`verifyAcceptance`/`getSkillBundle`/`lh acceptance`/`lh verify run|result|evidence|install` 无生产注册残留；旧入口不可绕过；任务检查与 Automations 保留；vendored `.agents` skills 在。
7. **部署（R0 部署侧）**：源码 SHA、镜像 digest、迁移、app/worker 版本一致；digest 固定；promote 仅在 gate 绿后；**无部署授权最多交付 READY_TO_DEPLOY**。
8. **配额刷新（R6）**：90s 旧数据刷新、60s 内跳过、慢 DB/慢实时 API、加载期聚焦、焦点+可见性双事件、设备切换、卸载迟到响应、错误冷却。
9. **任务视图（F8）——已验收**：空集合列表模式保持列表表面+内联 composer、看板模式保持看板+创建弹窗、刷新持久（验收链接在 #83 body）。
10. **S3**：公开签名端点公网 PUT、读取/预览成功。

### 5.3 验收环境（本机已备好一半）

- **DB**：`orvilo_q0`（postgres://postgres:orvilo_local_dev@localhost:5432/orvilo_q0）已建好，含 174 条迁移 + 旧验收数据。**#88 合并后需手动补 0175**：`psql .../orvilo_q0 -f packages/database/migrations/0175_task_pr_delivery_gate.sql`（纯触发器 SQL，无扩展依赖），并在 `drizzle.__drizzle_migrations` 插一行（模仿上一行的 hash/created_at 格式）。
- **本地 Postgres 限制**：本机集群 `pg_search 0.0.0` 无 `bm25` access method → 0093 迁移在全新库上跑不过；所以用 TEMPLATE 克隆已有库绕过（已做）。Docker 不可用，别走 `dev:docker`。
- **后端**：`bun run dev`（Next.js 全栈）。新建 worktree `git worktree add /tmp/orvilo-q0 origin/canary`，`pnpm install --ignore-scripts`（electron 原生模块 build 会炸，SPA 不需要），复制 `orvilo1/.env` + `.env.local`，把 `DATABASE_URL` 改指 `orvilo_q0`，`PORT=<空闲端口>` 起。3010 被别的会话的 transfer-wt 后端占着，别动。
- **SPA-only**：`bun run dev:spa`（代理 3010 后端）——只适合纯前端验证；R1/R2/R4 的验收需要新代码后端。
- **验收基建**：`.agents/acceptance/`（tracked）有 `setup-auth.sh`、`test-env.sh`、`agent-browser` 会话注入；种子用户注册走 `/api/auth/sign-up/email`。
- **证据规则（重要，canary AGENTS.md 已改）**：**不再发布到独立验收站**——证据（截图/录屏/日志/测试输出）直接附到 PR 或 GitHub Actions artifact，并记录产生证据的 commit SHA。F8 那条 `orvilo.aspectlylabs.com/acceptance/...` 链接是旧规则产物，Q0 不要复用该通道。

### 5.4 独立评审

审计要求「当前组合 SHA 的独立批准与验收」。所有 PR 作者=alexj11324（自批无效）。合并完成后对最终 canary SHA 走 deep-review skill 的 light 模式（或按用户指定评审者），把结论落到 PR/记录。

## 6. 实施要点备查（每个条目改了什么）

- **R2 (#84)**：delegation grant 活性 + commit 栅栏。claim 无 executor 时自开事务（FOR UPDATE 不能在 autocommit 提前释放）；claim 失败把 topic 标 `failed`；mint 只对 user 主体写 authzVersions。文档 `docs/development/execution-grant-fencing.md`。
- **R4 (#88)**：迁移 `0175_task_pr_delivery_gate.sql`，触发器 `enforce_task_pr_delivery_before_complete()`——完成转换才触发、递归 CTE 找最近 git 绑定祖先、repoPath-only 放行、无 repo 且无 repoPath 的畸形绑定 fail-closed、remote/关联交付要求 merged PR 证据且 `execution_generation` 绑定当前代、SQLSTATE 23514（`tasks_completed_requires_git_target`/`tasks_completed_requires_merged_pr`）。服务侧 sweep：EXISTS 预过滤、代绑定 `activeDeliveryRow`、收养 in-flight 未绑 PR 的行、合并前重读 task+snapshot（CI 复验+headSha 不变）、10min 预算、snapshot 排除 token 属主自身评论（`/user`，失败降级）。测试 `packages/database/src/models/__tests__/taskPrDeliveryGate.test.ts`（断言走 `error.cause.message`，证据行显式 `executionGeneration`）。文档 `docs/development/pr-delivery-gate.md`。
- **R1 (#85)**：真实 workspace context hooks（`useActiveWorkspaceId/Slug` 等）、`WorkspaceContextSlot` slug 终态错误 Alert 可重试、`useWorkspaceUrlSync` 卸载清理、`getWorkspaceMembers` 空降级不泄漏跨租户 `latestMembers` 快照、i18n `setting.workspace.loadFailed`（en/zh 手翻）。
- **R6 (#80)**：`lastRevalidateAt` 打点收敛到 `loadQuota` 单点；聚焦/可见性 revalidate 落在 in-flight 请求上不再被 stale 覆盖。测试 `QuotaMenu.test.tsx`。
- **F8 (#83)**：`getTaskViewSurface`/`getTaskCreateActionBehavior`——有效视图独立于条数（空集合不再被强制 board）；回归测试覆盖空集合两模式 + 持久化。
- **R3 (#87)**：执行引擎 provenance 戳记；文档 `docs/development/execution-engine-provenance.md`。
- **R5 (#86)**：净 diff 仅文档 `docs/development/skill-distribution-retirement.md`（合并后真实语义：无 getSkillBundle 墓碑，整面已删）。
- **R0 (#82)**：`test.yml` 尾 `required-quality-gate` job（needs 全量 + always()，`skip_after_successful_duplicate` 是唯一能绿的跳过路径）；`deploy-orvilo1.yml` retag/promote/release 三处 `require-quality-gate` action + digest 固定部署；`gh api` 瞬时失败消耗等待预算而非中止。
- **注意事项**：迁移顺序必须保持 `0174_workspace_ownership_transfers` → `0175_task_pr_delivery_gate`；drizzle 错误文本在 `DrizzleQueryError.cause.message`；`task_topics.execution_generation` nullable 无默认，证据行必须显式写。

## 7. 关键路径与文件

- 本机仓库：`/Users/alexjiang/Desktop/vibe/orvilo1`（主 worktree，当前在别人的 `fix/loading-screen-brand-mark` 分支——别动）；本文档分支 worktree `/tmp/orvilo-handoff`。
- 流水线脚本/日志：`/tmp/pr-pipeline.sh`、`/tmp/pr-pipeline.log`、`/tmp/pr-pipeline.out`。
- 审计报告：`/Users/alexjiang/Downloads/orvilo1_pr_audit_2026-09-18.md`。
- 会话经验：`/Users/alexjiang/Desktop/vibe/orvilo1/tasks/lessons.md`（**未跟踪文件**，含 duplicate-run/drizzle cause/迁移重生等教训，建议先读）。
- 任务进度：`/Users/alexjiang/Desktop/vibe/orvilo1/tasks/todo.md`（未跟踪）。
- Q0 库：`orvilo_q0` @ localhost:5432（§5.3）。

## 8. 接手第一步

1. `tail -30 /tmp/pr-pipeline.log` —— 判断流水线：跑到 `PIPELINE COMPLETE` / `STOP` / 还在等。
2. `gh pr list --state open` + §2 命令核三个 PR 的权威状态。
3. 流水线 STOP → 按 STOP 码处置（§4 机制）→ 改 PIPE 数组后 `nohup /tmp/pr-pipeline.sh &` 重启。
4. 全部 merged → §5.1 验证 → §5.2/5.3 起 Q0 → §5.4 独立评审。
5. 全程硬约束：监控循环必须有独立计算的硬截止时间；本地测试/类型检查有 hook 拦截（测试全走 CI）；不要 `--no-verify` 绕过 pre-commit（worktree 缺依赖时先确认钩子内容再考虑 `HUSKY=0`）。

## 附录 A：流水线脚本

本机 `/tmp/pr-pipeline.sh` 的副本已一并提交为 `docs/development/audit-merge-pipeline.sh`（同目录）。重启前把 `PIPE` 数组改成剩余未合的 PR，`wt` 路径按你所在机器调整；没有 worktree 时用 `git worktree add <dir> <branch>` 建。脚本有全局 4h 硬截止、每 PR 4 轮上限、失败即停并写日志——符合「监控必须有独立硬 deadline」的约束。

```bash
nohup bash docs/development/audit-merge-pipeline.sh > /tmp/pr-pipeline.out 2>&1 < /dev/null &
tail -f /tmp/pr-pipeline.log
```
