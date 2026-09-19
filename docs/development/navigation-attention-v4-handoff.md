# Navigation Attention v4 — 会话交接（2026-09-18）

给换到下一台机器 / 下一个 Agent 继续用的。合同原文在仓库里，不要再去 `/tmp` 或受保护 clone 里找。

## 先读这些

| 文件                                                                                         | 作用                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`docs/implementation/navigation-attention-v4/`](../implementation/navigation-attention-v4/) | 用户交付的 v4.1 执行包（`README` / `IMPLEMENTATION_SPEC` / `DECISIONS` / `ACCEPTANCE` / `work-packages.json` / `ownership.json` / `agents/*`）。已按 `SHA256SUMS` 原样入库。目录已加入 `.prettierignore` / `.remarkignore`，lint-staged 也会跳过，不要改包内字节。 |
| [`docs/development/navigation-attention-v4.md`](./navigation-attention-v4.md)                | N00 基线：相对研究 SHA 的 canary 差异、复用清单、冻结决策、迁移号                                                                                                                                                                                                  |
| 本文件                                                                                       | 实施进度、剩余 MUST-FIX、禁止事项、下一刀改哪些文件                                                                                                                                                                                                                |
| Draft PR                                                                                     | <https://github.com/alexj11324/orvilo1/pull/95>                                                                                                                                                                                                                    |

合同版本：`nav-attention-v4.1`。这是 **reuse-and-connect**，不是 v3 重做，也不是只改侧栏按钮。

## 目标（不要缩小）

完成 Orvilo Navigation Attention v4：Inbox / My Work / Views / Team Triage 统一个人工作面，事件 → 收件人 → 提示 → 真实动作 → 回执。64 项 AC 在 [`ACCEPTANCE.md`](../implementation/navigation-attention-v4/ACCEPTANCE.md)。**在每条都有证据之前，不要把系统目标标 complete。** 不要把范围缩成「侧栏有 Inbox」。

## 仓库坐标

| 项                               | 值                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| Repo                             | `https://github.com/alexj11324/orvilo1`                                                     |
| 分支                             | `cursor/navigation-attention-v4-a544`                                                       |
| PR                               | **#95 draft** → `canary`（保持 draft，除非用户明确说 ready）                                |
| 实施 HEAD（本交接提交之前）      | `40cd74b3` `✨ feat(nav): show recent work in command menu and pin favorites`               |
| Merge-base / 本分支基于的 canary | `d02f13f1`（含 #81 ownership transfer、#94 hidden-surface retirement）                      |
| 研究 SHA                         | `d2c522fd8bf37448dccd86eacc6442a580d55cbd`（是 merge-base 的祖先）                          |
| 远端 canary 现已走到             | `73257dff`（#80 quota）。PR `mergeable_state: behind`。**未授权 rebase，不要自行 rebase。** |
| Cloud agent                      | <https://cursor.com/agents/bc-c18edf00-e213-4176-9c88-d3f33b4ea544>                         |
| 写者租约                         | 全局最多 3 writer；**本分支是唯一写者**。不要碰 `/Users/alexjiang/Desktop/vibe/orvilo1`。   |

## 用户澄清（仍然有效）

> 「什么 API key 啊，不是模型的 API key 吧，我已经在退役自定义 provider 了」

本 PR 里的 API key 工作是 **Orvilo 签名 TRPC key**（`api_keys`、`/settings/apikey`、`TRPC_NAMESPACE_API_KEY_RULES`），给受限 key 调 `workAttention` 等命名空间用，失败关闭。

- **不是** 模型 / 自定义 provider 凭据
- **不要** 恢复 `/settings/provider`（canary #94 已退役）
- 任务 subscribe/unsubscribe 是可读任务上的 follow 行，不是模型 key，也不是聊天 mute

## 已落地（相对 `canary@d02f13f1`）

表面：`/inbox`、`/my-work`、`/views/:viewId`、`/teams`。Tasks / Projects / Automation 仍是一级。HomeInbox 只做聊天摘要。剩下来的 InboxModal 列表 UI 已删，opener 只跳 `/inbox`。

迁移：**`0175_work_attention`**、**`0176_work_attention_triage_bulk`**。0174 被 #81 占用，不要复用。

已接线的产品行为（ vitest/check 覆盖，**不是** 64× Preview 验收）：

- Inbox：versioned read/archive、snooze 被更新活动打断（NOT08）、`archiveAll` 不藏未决动作卡、consume-once bulk archive/read、allowlisted `actionUrl`（SEC01）、源标题 i18n、J/K/Enter/Esc、铃铛与 `unreadBadgeCount` 共用
- Decide：`workAttentionProcedure`（ACT01），不是 organize。ACP intervention OSS `{ handled: false }` → `outcome_unknown`。ownership transfer /withdraw outgoing。outgoing 占未读铃但不进 Needs-you（ACT08）
- 独立 `event_consumer_receipts`（D09）。权限 `notification:read|organize` ALL-only（D14）
- My Work：assigned / delegated=`execution_grants.initiatedBy` / review / created=`createdByUserId` 且排除 Linear 导入 null（WORK03）/subscribed。No-project chip（WORK07）。服务端 list/board（WORK08）。待审核列出非 task 的 pending approval，**不为填列表建 Task**（WORK05）
- Board：`moveBoard` CAS；N>1 `team_workflow_states` → `WORKFLOW_STATE_REQUIRED` + 精确 picker（VIEW08）。Linear-linked 不再绕 `task.update` 分类映射
- Saved views：visitor 时 `currentUser`；`expectedDefinitionVersion` CAS；builtin 虚拟 id `builtin:all|blocked|in-progress|review|projects` 不可覆盖（VIEW01）；分享 AST 抹掉不可读 id（VIEW02）；count/facet 同 ACL（VIEW07）；cursor 绑 `queryHash` + 全排序元组（VIEW06）
- Team Triage：accept/decline/duplicate/reassign + `moveToTeam` CAS（TRI02）；`duplicate_of_task_id`（TRI03）；历史 Linear import `triageStatus: accepted`（TRI01）；triage 事件 `task.scope.changed`（TRI08）；`cycleId` → `tasks.cycleRefId`（TRI07）；`teamId` 与可读团队求交（TRI05）
- Favorites：可读 task/team/project/view 标题水合；reorder API 已是 `expectedVersion` CAS（NAV06），侧栏始终可见上 / 下箭头
- CommandMenu sidecar 搜 task/team/project/savedView，不走 FTS `type:`（NAV07）
- 签名 TRPC key catalog 登记 `workAttention`
- 与 #94 合并：保留 `teams`/`views`/`my-work` 根，以及退役的 `acceptance`/`verify` 重定向

精确 redirect 仅 `/tasks?collection=mine&scope=assigned|created`。

## 本交接之后又接上的产品面（相对 `ad838850`）

- `buildInboxFeed`：`listPendingForActorSettled` → `ensureActionCards` → `listFeed` → `mapFeedWithLiveActions` → `overlayLiveTitles`（`TaskModel` / `ProjectModel.findByIds`）
- `notification.feed` 返回 `NotificationFeedPage`；`workAttention.feed` 返回 `{ data: NotificationFeedPage, success }`
- `WorkInboxPage` 读 `data.cards`；`partial` 时 base-ui `Alert`；空列表 + partial **不是** 成功空态
- Inbox SWR `focusThrottleInterval: 0`（SEC02：失权后下一次窗口聚焦会重拉，不再等 5 分钟）
- 收藏始终可见上 / 下箭头，走 `favoriteReorder` CAS，CONFLICT 则 refetch
- `workAttention.search` / `searchTasks` / `searchProjects` 上限 `WORK_SEARCH_MAX_PER_TYPE`（200）；CommandMenu 仍混合 5 / 带类型 50；`TeamsPage` 搜索框走 sidecar，不传 FTS `type:`
- `NavItem` `@media (hover: none)` 强制可见 `.nav-item-actions`
- CommandMenu 跨类型 recents：`RecentModel.queryRecent` 加 project/savedView/team 三个 union arm；`recent.getAll` 与 `RECENT_SIDEBAR_TYPES` 覆盖四类型；主面板 `RecentsCommands` 开菜单时懒拉 `recentService.getAll(8)`
- 个人模式 CommandMenu Navigate 与 `useNavLayout` 不再露出 Teams（侧栏原先已藏）
- Task / Team / Project / Saved View 共用 `WorkFavoriteButton`；侧栏收藏可 unpin

`summarizeFeed` 仍不把 `sourceUnavailable` 交给铃铛；包络只在 Inbox 页。

## 剩余 MUST-FIX（无需 Preview 就能做）

**已全部落地。** 只剩 NICE（可后做）：NAV02 原生通知矩阵、收藏列表 overflow 折叠、CMDK 搜索 SWR key 已不含 workspaceId、TRI04 回归（`queryProjects` 已 EXISTS，没有行放大）。

## 给下一刀

Preview 限额解开后跑 N12 / END06–08。不要用 mock 报完成。不要 rebase 到更新的 canary，除非用户要求。

`listPendingForActor()` 仍返回数组，给 `ensurePendingSourceCards` 用，可以留。

## 阻塞 / 不要假装完成

| 项                                               | 状态                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| N12 / END06–08 真实 Linear、GitHub、ACP 闭环     | **BLOCKED**，没有获准 Preview。Vercel 免费档日限额，Preview 没起来。不要用 mock 报 N12 完成。 |
| N10 生产 shadow dual-write                       | 关掉，保持关                                                                                  |
| ACCEPTANCE 64×                                   | 合同上仍是 `NOT_RUN`。scoped vitest ≠ 产品验收                                                |
| PR-event「Required Quality Gate」concurrent-skip | **不是** 产品失败。看 **push** Test CI                                                        |
| Vercel「Deployment rate limited」                | **不是** 产品失败                                                                             |

## 明确不要做

- 不要 rebase 到更新的 canary，除非用户要求
- 不要恢复 `/settings/provider` / 自定义模型 provider
- 不要把 AgentTasks `KanbanBoard` 再挂到 My Work / Team
- 不要发明 GitHub PR-without-task 产品存储
- 不要加 WorkQuery export
- 不要开生产 shadow dual-write
- 不要手改 migration `_journal.json`（`bun run db:generate` 后 rename / 幂等加固）
- 不要跑 `bun run test`（全量套件）
- 不要本机跑全仓 `bun run check --type`（CI-only，`scripts/type-check.mjs` 会 fail-fast）。本地：`pnpm type-check` 进对应 package，或 CI=true 的全仓脚本（会很吃内存）
- 不要 UpdateGoal complete
- 不要碰受保护 clone `/Users/alexjiang/Desktop/vibe/orvilo1`
- SAFE-BY-ABSENCE，不要主动做：TRI06 AI 自动执行、SEC04 username mapping、SEC07 破坏性清理 job、TRI04 按团队复制 Project 导航器

## 质量怎么跑

```bash
# 只对改动文件，不要 bun run test
bun run check [changed-files...]

# 单测
bunx vitest run --silent='passed-only' <file>
cd packages/database && bunx vitest run --silent='passed-only' <file>
```

本分支近期 scoped check（都不是 64× AC）：

- `b4136da6` / `24df8830`：lint 干净，19 passed（workflow-state picker + favorite 标题）
- `02d8191e` / `c5be180c` / `bd5209d9`：288 passed
- `cfc06a6f`：66 passed；当时全仓 `tsgo --noEmit` 通过
- 本增量（Inbox 包络 / 收藏重排 / 团队搜索 / 触屏）：lint 干净，42 passed。不是 64× AC。
- `d6560eb7`（CommandMenu 跨类型 recents + `recent.test.ts` work-type arms）：lint 干净，38 passed。不是 64× AC。
- pin / 个人模式藏 Teams：lint 干净，`bun run check` 改动文件 55 passed。不是 64× AC。

提交信息用 gitmoji。PR 正文英文。保持 draft。

## i18n / 路由 /schema 备忘

- 新文案：`packages/locales/src/default/`，并手改 en-US /zh-CN
- 路由：先读 `spa-routes` skill。公共路径只注册在 `src/spa/router/desktopRouter.shared.tsx`
- 组件：先读 `react` skill。Alert/Select/Modal 用 `@lobehub/ui/base-ui`
- 验收：文档 /handoff 不需要新的产品 acceptance run。新的 Inbox 包络 UI **需要**，但在 Preview 限额解除之前只能用 vitest + 说清楚缺口
