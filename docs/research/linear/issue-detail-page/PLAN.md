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

右栏新增 Related 组（依赖 Task 4 分组结构）：列出 `blockedBy`/`blocking`/`relates` 三类 issue 行（状态点+ID+标题，点击导航），超阈值折叠为 "Show N more"。数据走 `relationGroups`/`TaskPrerequisites` 已有模型。

## Task 6 — F 添加动作行

`TaskDetailAddActions` 4 个 chip 移出主栏：＋子Issue → Sub-issues 区头 ＋；＋链接/＋文档 → 资源区头或属性面板；＋PR 同理。删除中部 chip 行。

## Task 7 — B 活动流

活动区改 Linear 式：区头右置订阅态；feed 时间恒相对格式（查 `formatActivityTime` 阈值）；评论卡内嵌 "Leave a reply…" 线程回复框（若评论模型无 parent_id，则只做卡片样式对齐并在 README 标注线程为 product-pending，不硬造数据模型）。
