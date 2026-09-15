# Orchestrator 会话交接（2026-09-15）

> 给换到服务器上继续开发用的。设计细节看 `docs/orchestrator-workspace-plan.md`。

## 目标

把这个 fork 继续往 CAID 式编排推进：

> 依赖 DAG → 调度就绪任务 → 各 run 在隔离 git worktree /sandbox 分支里干活 →
> 自验证 + 提交 → 合并回主干 → 重算计划 → 再分配 → 终审

动机：并行任务互相覆盖工作区。每个 run 要有隔离工作区，完成的工作先集成回 base
分支，任务图 / 级联只在集成之后推进。

## 当前状态：三个 stacked PR

| PR  | 分支                                 | base                                 | 内容                                               | 验证                                         |
| --- | ------------------------------------ | ------------------------------------ | -------------------------------------------------- | -------------------------------------------- |
| #5  | `feat/orchestrator-sandbox-contract` | `main`                               | Phase C：sandbox 远端分支契约                      | 文件级 check 绿（64 tests）；`--type` 未跑完 |
| #6  | `feat/orchestrator-worktree-cleanup` | `feat/orchestrator-sandbox-contract` | Phase D1：cancel/delete/blocked 时拆 task worktree | check 绿（114 tests）；`--type` 未跑完       |
| #7  | `feat/orchestrator-integration-ui`   | `feat/orchestrator-sandbox-contract` | Phase D2：run 卡片 / 抽屉上的集成状态 chip         | check 绿（104 tests）；`--type` 未跑完       |

合并顺序：#5 → #6 → #7（#6/#7 merge 后 GitHub 会自动 retarget 到 main；
不自动就手动 `gh pr edit -B main`）。

仓库：`https://github.com/alexj11324/orvilo1.git`（fork 的实际 trunk 是 `main`，
不是 AGENTS.md 里写的 `canary`——#1/#3 都合的 `main`）。

## 机器上的 worktree（换服务器后可废弃重建）

```
/Users/alexjiang/Desktop/vibe/orvilo1                    # 主 checkout
/Users/alexjiang/Desktop/vibe/orvilo1-orchestrator       # Phase C
/Users/alexjiang/Desktop/vibe/orvilo1-phase-d-cleanup    # Phase D1
/Users/alexjiang/Desktop/vibe/orvilo1-phase-d-ui         # Phase D2
```

服务器上重建：`git clone` → `git worktree add <path> <branch>` × 3 → 每个
worktree 里 `pnpm install`。

## Phase C 要点

- `TaskWorkspaceConfig.repo`（GitHub 坐标）+ `TaskTopicIntegration.repo`/`prUrl`
  标记 remote 记录；`task_topics.integration` 是 jsonb，无迁移。
- `provision` 的 remote 门控**复现** hetero dispatch 的解析：
  `resolveExecutionPlan({ clientExecutionAvailable: false, isHetero: true,
sandboxExecutionAvailable: supportsCloudHeterogeneousSandbox(type),
requestedDeviceId: config.deviceId }).kind === 'sandbox'`。
  不要用 `resolveExecutionTarget + deviceGateway.isConfigured`——dispatch 那边
  硬编码 `clientExecutionAvailable: false`，网关部署下两边会分叉（评审 P1）。
- 非 hetero assignee 永远拿不到 contract（`repos`/`GITHUB_TOKEN`/ 契约 prompt
  只在 `spawnHeteroSandbox` 链路上存在）。
- 新服务 `apps/server/src/services/githubRepo`：`parseGithubRepo` /
  `getRepoDefaultBranch` / `findBranchPr` / `isBranchMergedInto` /
  `resolveGithubAccessToken`（Market `github` cred，吃 assignee 的
  `env.GITHUB_CRED_KEY` 覆盖）；`heteroDispatch` 已改用它。
- `repoToLocalDir` / `cloudSandboxRepoPath` 在 `@orvilo/types` 共享
  （带 `[^\w.-]` sanitize）；`sandboxRunner`、`cloudHeteroContext`、
  `taskWorkspace`、remote integrator 四处共用。
- remote integrator：`verifyRemoteMerge` 用 GitHub API 判定（merged PR 优先，
  否则 ancestry compare）；未落地 → 派一个 sandbox corrective run
  （`workspaceOverride.repos`），attempts 上限 3 → `blocked`；
  `landRemoteMerge` 按 branch 扇出写所有 tracking 行。

## Phase D 要点

- D1 `cleanupTaskWorktrees` 只删 `role: 'task'` 行的 task-scoped worktree。
  **共享的 `<repo>-integration-<base>` worktree 永远不删**—— 它是跨任务共享的，
  删了可能毁掉别的任务在同一 base 上的在途 merge（这是 Phase B 的既有设计，
  已知限制：blocked 后残留在共享 worktree 里的 open merge 会污染同 base 的
  下一次 merge，需要时做 per-task integration worktree 或加 abort RPC）。
- 挂接点：run cancel /topic delete / 终态 status（canceled|completed|failed）/
  cascade / 两个 delete 入口（tRPC router + agent tool runtime）/
  integrateOnComplete 的 blocked 路径。全部 best-effort，绝不阻塞主操作。
- `serverRuntimes/task.ts` → `taskIntegration` 的 import 会造成模块环
  （taskIntegration → taskRunner → aiAgent → agentRuntime → builtin →
  serverRuntimes/index → task.ts）。测试靠 mock `@/server/services/taskIntegration`
  截断（和既有 `TaskService` mock 同款）。生产路径 builtin→index→task 顺序安全。
- D2 `RunIntegrationTag` 只渲染有 integration 记录的 run；tooltip 里放
  branch→base /attempts/conflicts /lastError/ PR 链接。

## 评审 findings 处理情况（独立 light review 已完成）

| #                                                | 结论     | 处理                                                                                                                                                                   |
| ------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a `runsInSandbox` 与 dispatch 分叉（P1）        | 真实     | 已修：改用 `resolveExecutionPlan` 复现 + allowlist 门控，含回归测试                                                                                                    |
| 1b 非 hetero assignee 拿到无法兑现的契约         | 真实     | 已修：非 claude-code/codex 直接 false                                                                                                                                  |
| 2 `getAgentConfig().catch` 吞错（P2）            | 真实     | 已修：删掉 catch，not-found 本来就是 null                                                                                                                              |
| 3 sandboxRunner 私有 `repoToLocalDir`（P2）      | 真实     | 已修：sanitize 并进共享 helper，删私有副本                                                                                                                             |
| 4 unverifiable 烧 attempt + 忽略 CRED\_KEY（P2） | 部分采纳 | 已修：`check.error` 落 `lastError`；verify/provision 都吃 `GITHUB_CRED_KEY`。没做 "unknown 不烧 attempt"——integrator run 本身会独立验证，attempts 上限本来就是为了兜底 |
| 5 `landRemoteMerge` 只回写一跳（P2）             | 真实     | 已修：按 branch 扇出（同 device 路径 publishAndCleanup 的做法）                                                                                                        |

## 待办（按优先级）

1. **`bun run check --type` 全仓 type-check**：最后一次没跑完（tsgo 冷启动
   \~15–25min）。#5/#6/#7 各自都要过一次再合。
2. **acceptance**：orchestrator 是行为变更，仓库约定要产品级验证。最低限度：
   起一个 repo-bound task（assignee=claude-code，workspace.repo = 某个测试 repo）
   → 看 sandbox 里 branch+push+PR → integrator run 合回 → run 卡片上的
   integration chip。跑完把 `app.lobehub.com/acceptance/<id>` 链接补进 #5。
3. **D2 视觉检查**：Tag 在 TopicCard / 抽屉上的渲染没实际看过截图。
4. Phase E（下一个大块，见 plan 文档 non-goals 外沿）：
   - blocked 之后共享 integration worktree 里的 stale open merge 清理
     （需要 abort RPC 或 per-task integration worktree）
   - 重算计划 / 再分配在 integrate 之后已经走了现有 cascade—— 不用动
   - final review / 自动合 PR（`gh pr merge`）目前靠 corrective run 的 prompt，
     可以考虑做成确定性的 server 侧动作
5. 计划文档 Phase D 复选框在 PR 合并后勾掉。

## 常用命令

```bash
# 文件级 lint+相关测试（不要跑 bun run test）
bun run check <files...>
# 全仓 type-check（慢）
bun run .agents/scripts/check/cli.ts --type
# 手动单测
bunx vitest run --silent='passed-only' <test-file>
# 依赖
pnpm install   # 每个新 worktree 都要跑一次
```

## 相关 PR 历史

- \#1 kanban 拖拽移植 — merged
- \#3 Phase A+B per-run worktree + merge-back — merged（8e9d38ab）
- \#4 automations 侧边栏移植 — open（与本线无关）
- \#5/#6/#7 本次 stacked
