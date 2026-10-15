# Plan — Issue 详情页 Linear parity（实现版）

Spec（绑定权威）：`docs/research/linear/issue-detail-page/README.md` 的差异清单与两端实测结构。
基线：`feat/linear-issue-detail-parity` @ `origin/canary` `6996af3d3`。
工作区：`.claude/worktrees/linear-issue-detail`。

## Global Constraints（所有任务共用，逐字约束 reviewer）

- **结构/行为对齐 Linear，token 值不照搬**（DESIGN.md）。排版对齐 = 用 Orvilo 样式体系表达 Linear 的层级规格（标题 24px/600、区头 15px/600、正文 15px/450），不是抄 Linear CSS 变量。
- **保留 Orvilo 产品差异**：`TaskArtifacts`、agent 生命周期状态（待办/未开始/待验证等）、`RunAll`、底部 agent 询问条、`TaskPrerequisites` blocked notice。
- **i18n 同 PR 双语**：新增用户可见文案必须同步 `packages/locales/src/default/*.ts` + `locales/en-US/*.json` + `locales/zh-CN/*.json`。
- **每个改动带回归测试**：UI 规则抽样式模块可断言的断言 `.test.ts`；行为改动画 vitest。**禁止** `bun run check` / `bun run test` / 本地 type-check（本机 tsc 崩溃；CI 兜底）。允许：`bunx vitest run --silent='passed-only' '<file>'`（owning package 目录下）。
- **不派生 subagent**（implementer 契约）；不大范围重构超出切片。
- Commit：gitmoji 英文。改动落在 `src/features/AgentTasks/AgentTaskDetail/` 为主。
- 文档：同 PR 更新 `docs/research/linear/issue-detail-page/README.md` 的落地表（哪个差异在哪个 commit 落了）。

## Task 1 — E 排版规格

详情页标题 input → 24px/600；"活动"区头 → 15px/600；描述正文 → 15px/450。定位 `taskDetailLayoutStyles.ts` / `taskInstructionStyles.ts` / `TaskDetailTitleInput` / `TaskDetailSectionHeader`。只动样式与对应测试，不动结构。

## Task 2 — C Sub-issues 区头

`TaskSubtasks` 区头补完成进度 `done/total`（Linear `0/21` 样式：区头文字右侧小号灰字），行内按 Linear 排 = 状态点 + 优先级标号 + 标题 + 负责人头像。保留 RunAll 按钮与现有 composer。

## Task 3 — D+H 顶栏操作簇 + 订阅控件

详情页头部动作区按 Linear 补 copy-link / copy-issue-ID / copy-branch-name 图标（复用 `useTaskCopyActions`）；订阅控件本体改为 Linear 式 "Subscribe/Unsubscribe 文字链" 形态（保留现有 `IssueSubscribeToggle` 逻辑，改呈现；区头右置归 Task 7）。

## Task 4 — G 属性面板分组

右栏按 Linear 分组头重组：Properties（status/team-equivalent/priority/assignee/due date…）→ Labels 组（LabelChips + Add label，从 reveal 字段提升为常显组）→ Project 组。保留"添加属性" reveal 机制给可选字段。

## Task 5 — A Related 专区

右栏新增 Related 组（依赖 Task 4 分组结构）：列出 `blockedBy`/`blocking`/`relates` 三类 issue 行（状态点+标题，ID 为无名行回退/导航目标，点击导航），超阈值折叠为 "Show N more"。数据走 `relationGroups`/`TaskPrerequisites` 已有模型。

## Task 6 — F 添加动作行

`TaskDetailAddActions` 4 个 chip 移出主栏：＋子Issue → Sub-issues 区头 ＋；＋链接/＋文档 → 资源区头或属性面板；＋PR 同理。删除中部 chip 行。

## Task 7 — B 活动流

活动区改 Linear 式：区头右置订阅态；feed 时间恒相对格式（查 `formatActivityTime` 阈值）；评论卡内嵌 "Leave a reply…" 线程回复框（若评论模型无 parent_id，则只做卡片样式对齐并在 README 标注线程为 product-pending，不硬造数据模型）。

---

# Wave 2 — complete the remaining parity gaps (2026-10-14)

User directive: 全部对齐，功能层面优先，UI 细节也要注重。Schema 变更已获用户明确授权（comment threading）。

Verified-remaining gaps (evidence: live T-3 with seeded sub-issues/relations/comments on commit 24610385f vs Linear ORV-117):

## Task W1 — Header action cluster placement
Linear mounts the copy-link / copy-id / copy-branch icons + star + overflow at the FAR RIGHT of the issue page's top chrome row, not inline after the breadcrumb title. Move `TaskDetailHeaderActions`' cluster so it right-anchors the top bar (breadcrumb stays left). Keep narrow/peek behavior: cluster stays but collapses to overflow menu when space is tight (or as current). Touch: `TaskDetailPage.tsx`, `TaskDetailHeaderActions.tsx`, peek-pane host (`IssuePeekActions.tsx`).

## Task W2 — Section headers: pill → flat Linear rows
Sub-issues / Attachments / Activity headers currently render as bordered pill chips (label + ⌄) with actions at the far right edge. Linear measured (live CDP @ ORV-117): the collapse header is a flat `<button>` — **12px/500 text, 24px height, transparent bg/border**, chevron leading; the Activity band is **15px/600 in a 32px container**. Right-side controls (sort, +) sit inside the row and reveal on hover in Linear — keep ours visible if hover-reveal conflicts with touch, but the chrome must be flat (no border, no pill bg). Restyle `TaskDetailSectionHeader` + collapsible trigger affordance accordingly; keep i18n + all mount contexts.

## Task W3 — Sub-issues sort menu
Current control is a binary manual↔status toggle. Linear offers a sort menu (manual / status / priority / assignee / created). Replace with a menu listing the real options our ordering supports — check `subtaskOrdering.ts` for what orders exist and surface them all; keep manual-drag mode behavior intact.

## Task W4 — Data-state row rendering polish
With seeded data now live (T-3: 3 sub-issues done/in-progress/todo, blocked-by + relates, 3 comments), tighten to Linear form. **Rail group labels**: Linear measures **16px/400** (we currently render 12px/500 muted — real gap, fix). Sub-issue rows — status icon + priority + identifier + title + assignee avatar + ⋯, target ~28px row; Related rows — kind label + status icon + title + ⋯（identifier 仅作无名行回退）, `Show N more` stays 13px/500 muted (matches Linear). Comment cards — avatar + bold name + relative time header, body below; verify card spacing vs Linear's card form. Fix only concrete deviations found in the audit — cite measured values.

## Task W5 — Comment threading (schema + API + UI)
User authorized schema change. Linear comments support reply threads. Implement minimum viable parity:
- `task_comments.parent_comment_id` (nullable self-FK, cascade with parent), drizzle schema + generated migration (follow `db-migrations` skill — idempotent, no destructive ops).
- `task.addComment` accepts optional `parentCommentId` (validate same-task parent); comment list/query returns `parentCommentId` so the feed can group.
- UI: `CommentCard` gets a reply affordance; replies render as a nested thread under the parent card (one level — Linear nests replies under the parent). Composer support: clicking reply targets the parent (chip/label showing replying-to, cancellable). Deep-link `#comment-<id>` still resolves inside threads.
- i18n en/zh. Tests: model-level parent validation + UI thread render.
- Do NOT change existing comment payloads' shape beyond adding the optional field; unrelated consumers (topicComments, agent flows) untouched.

## Task W6 — Narrow/peek crowding + cleanup
- Verify the peek-pane header at ~400-500px: cluster must not overflow (collapse to ⋯ menu or hide copy icons as needed).
- Remove dead `taskDetail.relations.none` i18n key (all 3 locale sources), dead `TaskLabelSelector.defaultOpen` prop.
- keepMounted deep-link: when expanding a collapsed Activity feed for a `#comment-<id>` hash, ensure scrollIntoView still runs (e.g. re-fire after expand).
- Setup modal: Related section inside setup keeps 5-row fold + add menu — simplify if trivially safe, else record as accepted.

Global constraints unchanged: gitmoji commits, fresh implementer + reviewer per task, local test/typecheck runs forbidden (CI is the gate), changes stay inside the issue-detail slice unless a task explicitly says otherwise. W5 may touch `packages/database`, `apps/server` (trpc), and the feature dir — that's its scope.
