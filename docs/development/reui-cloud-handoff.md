# ReUI 迁移云端移交

日期：2026-09-29（America/New_York）。这是 **WIP 移交，不是完成或发布证明**。用户要求将全部当前变更提交到 draft PR，由云端继续。

## 从这里接手

- PR：<https://github.com/alexj11324/orvilo1/pull/357>，保持 draft，目标 `canary`，分支 `feat/reui-sidebar`。不要自行 merge/deploy。
- 分支原始基线：`0817a350189dd48bf854a6af3a9de3d22f78aa9c`。已推送第一批 `46c275354f727c0e11cccbe18a81a12b37c6988e`，证据提交 `e2c3f954d74bebcb4164a5c856e49ac7a9a4ad03`。本移交提交保存后续所有任务变更。
- 本地实际工作树：`/Users/alexjiang/.cache/orvilo-reui-sidebar`。云端应 checkout PR head；本机 `/tmp` 文件、进程、端口和登录状态不能直接在云端使用。
- 原工作区 `/Users/alexjiang/Desktop/vibe/orvilo1` 保持 `fix/linear-catalog-org-query` / `fbd261ac3c6c901b9c049aa895ebe6c180afe06f`，无关 `.devin/skills/` 和 `.env.bak-20260924` 未提交，勿读取或上传密钥备份。
- 用户要求 subagent 使用 **GPT-6.1 Sol / Medium**。使用显式模型、effort，避免固定其他模型的 agent role 覆盖。

## 已冻结的用户要求

1. 全项目基础组件改用 ReUI，**按页面分批**。功能一致即可；采用 ReUI 默认形状，不要把旧 Lobe 按钮样式重新套上。CollectUI registry proxy 保留。
2. 只采用 App Shell 9 的 sidebar，保留原 Orvilo 主页面布局、内容层级及真实命令。Agent 页面也保留全局 workspace/Issue 导航。不要恢复已被否定的 Shell 10/21 或整页 shell 重构。
3. macOS 左侧保留原生透明毛玻璃；文字、普通图标、hover/selected 表面参考 Linear 的中性色。状态、优先级及标签颜色保留语义，避免普通导航被 Antd link 强调色染蓝。
4. 删除侧栏中间折叠把手，只用 macOS 左上角原按钮。Web / 非 Mac 在上方 header 提供折叠按钮，避免无法展开。
5. 折叠时搜索只显示图标、账户只显示头像；不能溢出文字。搜索按下 / 打开 / 关闭不能上下抖动。
6. 三组标题的折叠三角紧跟标题，参考 Linear；清除 “显示全部条目” 多余标题。
7. **Drafts 隐藏且暂不做**，包括自定义侧栏列表。保留已有路由和草稿数据；不要继续开发 Drafts。
8. Issue 看板 / 列表右键菜单应有真实操作，参考 Linear。右侧 Issue 属性栏的布局、按钮及颜色也通过 CDP 对照。
9. 用户已明确选择 **“本次也补齐日期和提醒”**：需要真实后端字段、接口、持久化与提醒交付，不是占位菜单或浏览器内存定时器。无需再次确认这两项范围。

## 当前代码与证据边界

| 批次                                       | 已完成                                                               | 验证情况                                                                                                      | 未完成                                                  |
| ------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 第一批 sidebar / Issue selection /titlebar | Shell9 composition、Base UI primitives、实际数据命令                 | 95 文件 lint、87 tests；独立源码审查；深浅 Electron 点击、Cmd/Shift、checkbox 命中区域、菜单与搜索测试        | 远端 Typecheck/E2E 曾失败，下面说明                     |
| 后续 sidebar 修正                          | 无中间 rail、折叠搜索 / 头像、稳定中性色 selector、Drafts 隐藏、文档 | 11 文件 lint、22 tests；审查修复后 12 targeted tests；Electron 两主题各 2 次真实折叠 / 搜索 / 菜单 / 展开通过 | Web/non-Mac fallback 未实机验证                         |
| Settings                                   | 90 路径（89 现存文件、1 删除样式），普通控件 / 布局迁移              | 67 tests、5 既有 warnings；独立源码审查无 blocker                                                             | 全页面真实运行与写入验收未完成                          |
| Projects + WorkspaceSetting                | 52 路径、复杂搜索 / 多选 / 标签选择、原功能回调                      | 加 ComboboxClear 导出共 53 文件、104 tests；独立源码审查                                                      | **项目创建弹窗 popup 被遮挡已复现**；其他运行验收未完成 |
| MyWork / WorkInbox / WorkTeams             | 22 文件普通控件迁移；popover 宽度 / 可访问名称修正                   | 41 test files / 297 tests；独立源码审查                                                                       | 过滤、显示、详情、bulk、triage 等完整运行验收未完成     |
| CI 类型修复                                | 4 文件修复 8 处已确认错误                                            | lint、8 tests；独立复核                                                                                       | 还未在这些修复后的 head 上确认远端 Typecheck            |
| 右键 / 右侧属性栏                          | 只读诊断、真实 Linear CDP 采集、语义规格                             | 见下方根因与源文件                                                                                            | **尚未实施**                                            |
| 日期 / 提醒                                | 后端只读方案与已批准合同                                             | 已确认现有服务入口                                                                                            | **无 schema、migration、API 或 UI 实现**                |

第一批证据：[`../research/reui/sidebar/evidence/batch-1/README.md`](../research/reui/sidebar/evidence/batch-1/README.md)，其中 SHA/hash 只证明对应第一批代码，不能证明本移交所有变更。后续折叠运行记录与已确认 CI 类型日志位于 [`../research/reui/handoff-evidence/`](../research/reui/handoff-evidence/)。这些是局部证据，不构成全项目验收。

原生 screenshot API 最后返回 Stage Manager thumbnail，未作为最终材质证明。CDP 截图证明 renderer 颜色 / 布局，不能独立证明 native compositor material。

## 必须先处理的实际问题

### A. 与最新 canary 同步

移交时 `origin/canary = aed338ed893d249830391df53b270c8b8ead06e5`，比基线多两个提交：`02e8252b4`（PR285，team resources /project UI）与 `aed338ed8`（PR355，Cloudflare）。PR 存在冲突，尚未 rebase。

PR285 新增 migration0195，并改动 Favorites 拖拽、TeamHome resources、Projects list 和导航。**不能对冲突统一选 ours**：保留上游业务功能，再叠加本次 ReUI 呈现。它还删除了 `ToggleLeftPanelButton` 和对应 Hotkey enum；用户此处明确要求保留左上角折叠按钮，需要在最新代码上接回真实持久化状态，宜用 ReUI Button。日期 / 提醒 migration 必须在同步后生成，不要抢占或手工合并 0195。

### B. 新 popup 在旧 imperative modal 后面

已在隔离 Electron 20 复现：Sidebar 新建 → 创建项目 → 团队 Combobox → 点 `Parity Test Team`。真实点击被 `CreateProjectContent` 的 div 挡住。Popup Positioner `z-index=50`，旧 Base Modal `z-index=1211`，`elementFromPoint` 落在 modal 内容而不是 option。

相关：`src/components/ui/{combobox,select,popover,dropdown-menu,context-menu,tooltip}.tsx`；`src/layout/SPAGlobalProvider/index.tsx` 仍挂 Lobe ModalHost/BaseModalHost/ToastHost；旧库动态 layer manager 位于安装依赖 `base-ui/zIndex`，modal 基础 1200、浮层 1100、每次打开递增。

**还没有修复。** 在共享浮层边界解决，覆盖真实 modal 内的 Combobox、Select、Popover 及嵌套菜单，避免只给一个项目 selector 打补丁；不要用随意大数掩盖动态堆叠。当前普通页面的 MyWork display popup 能打开，不能据此宣称 modal 场景通过。

### C. Issue 看板右键没有 DOM handler

`TaskBoardCard.tsx` 的 `ContextMenuTrigger` 包住 `GeneratingBorder`。Trigger clone child 注入右键事件，但 `GeneratingBorder` 只解构 children/className/generating/style，丢掉了事件和 data props。换成 ReUI wrapper 仍包同一 animation child 也会复现。**新 trigger 应绑定实际 DOM card；保留动画和拖拽。**

- `AgentTaskItem.tsx` 包 Lobe Block，未确认相同丢事件问题。
- `TaskSubtasks.tsx` 使用 imperative `showContextMenu(buildItems(...))`，目前只在 canEdit 时开放且不含完整 assignee。
- `useTaskItemContextMenu.tsx` 已有 status /priority/assignee/copy ID+URL /delete/conditional run；native interceptor 不是本次 board 根因，因为 status/priority extra 导致 web fallback。
- `closeContextMenu()` 仍只关闭旧宿主；迁移新的受控 ReUI menu 后，数字快捷键必须关闭新 root 并清理 listeners。

规格：[`../research/reui/issue-context-menu/SPEC.md`](../research/reui/issue-context-menu/SPEC.md)。现有 Labels、Project、milestone、rename、favorite、subscribe、dependency/parent、copy 定义等 API 可复用；`useTaskTransferMenuItem` 是返回 null 的 stub。Due date/reminder 新增已批准；其他未建立的 conversion/team-reassign/IDE 功能不应制造假菜单。

### D. 右侧 Issue 属性栏未迁移

规格：[`../research/reui/issue-rail/SPEC.md`](../research/reui/issue-rail/SPEC.md)。主文件 `AgentTasks/AgentTaskDetail/{TaskDetailSections,TaskProperties,TaskProjectSection,TaskRailActions,TaskPrerequisites,taskDetailLayoutStyles}` 与共享 property pickers。该内容被 full-page / MyIssues pane /chat portal 复用。

参考顺序：quick copy actions → Properties（Status/Priority/Assignee）→ 独立 Labels → Project → 缩进 milestone。普通 value 文本和按钮中性、透明 idle；不要仍混用强调色。保留 reviewer、acceptance、schedule 等 Orvilo 真功能。精确 workflow state/CAS、disabled running、project-owner milestone 权限必须保留。

## 日期与提醒：批准的后端方案（未实施）

- Task `dueDate?: 'YYYY-MM-DD' | null`：省略不改、null 清除。Drizzle nullable date/string，服务器 `z.iso.date()`；task update/detail/list 与客户端类型一起贯通。DueDate 复用 task write 权限。
- `task.setReminder({id, remindAt: UTC ISO string | null})`：当前用户、当前可读任务、一条可修改 / 取消提醒；过去时间服务器拒绝。详情只返回当前用户 `reminder:{remindAt,deliveredAt}|null`。提醒不是修改任务内容，应用 task read ACL，不误套 agent:update。
- `taskReminders`：uuid PK、task/user FK cascade、真实 task workspaceId nullable、remindAt、deliveredAt、timestamps；unique (task,user)，pending remindAt 索引。
- 后台同一事务锁 due pending 行（批量 100，SKIP LOCKED），再次确认接收者 task/workspace/private-team ACL；分配 feedRevision、创建现有 NotificationModel 的 task update card、标记 deliveredAt。dedupe 为 reminderId+remindAt；更新重置 delivered、取消与扫描串行化。不能泄露别人的提醒或失权任务内容。
- Hatchet `createCoreHatchetTasks` 注册每分钟 sweep，复用现有 worker；Local 非 queue/non-Vercel 在 Hono startServer 与 Next node instrumentation 启动同一个小型 runner，启动立即扫、随后每 60 秒、unref、HMR 不重复。数据库是事实来源，服务器停止期间不交付，恢复后扫逾期。当前线上 worker 未核验。
- 无需新增外部 email/IM provider 或 speculative outbox。使用既有 Notifications / WorkAttention，可点击回任务。

候选文件：database schemas task/workAttention、TaskReminder model+tests、types/task、server lambda task/router integration、server task service、taskReminder service+tests、hatchet tasks/taskNames、Hono standalone、instrumentation、client services/task 与日期 / 提醒控件。新增数据库文件必须带隔离 / 失败回滚测试，迁移用生成器并审查幂等性。

验收必须包含真实定时交付（关闭浏览器也到达）、编辑 / 取消、跨用户隔离、丢失权限、重启后逾期交付、并发扫一次通知。不要手动调用 sweep 冒充周期运行。不要对现有 UI fixture DB 跑会 `delete(users)` 的 integration suite，另建 disposable DB。

## CI 与后续组件迁移

旧 head `e2c3f954d`：Web build/size/entry graph 与 app/server/desktop/packages tests 成功；Typecheck 8 errors、E2E 6 scenarios 失败。Type log 已修复的内容：Menu 接受实际两种 legacy item 类型、5 处 React createElement children props、ProductLogo mono、geometry test Partial<SystemStatus>。没有在本机跑 tsgo。

E2E：new-topic button 找不到、topic 右键 / 切换 / 删除 / 搜索历史路径失配，另有编辑消息 timeout。必须确认真实新话题 / 历史操作仍可达后适配测试，不能改回 Agent 接管全局 sidebar，也不能仅放宽断言。旧 run：Test36648574369（Type job109677526975）；E2E36648574284（Web job109677306530）。最新交接提交需要新的远端 CI，不宣称已绿。

仍有大量全项目组件未迁移。当前批次还保留 Form、imperative Modal/confirm/toast、domain Avatar、rich Font Select、Password、DatePicker、Slider/Segmented/Alert、Block/Grid/Divider/CopyButton、上传 / 编辑器 / 富文本等；Conversation、AgentTasks 等其他页面也未全部处理。以当前 `rg` 盘点继续按页面，不能将已完成三批说成全项目完成。

原 ReUI 配置 `components.json` 为 base-nova，`@reui` 走 CollectUI。已有 `components/ui` 和 `components/reui/badge` 优先复用；不要装第二套平行组件树。

## 云端执行顺序与命令

1. Checkout PR head；读 AGENTS、相关 React/Ponytail/deep-review/db skills，保存当前 manifest。同步最新 canary 并整合上游业务变更。
2. 修复 modal 内共享 popup 层级；真实点击验收。
3. 修复 board/list/subtask 的 ReUI context menu 共用入口，再接已有命令。
4. 实施已批准 dueDate/reminder backend foundation、生成迁移、菜单与右栏接线，完成通知周期验收。
5. 依据已采集语义规格迁移右侧属性栏，并验收现有 Settings/Projects/Work 页；继续全项目剩余基础组件分批迁移。
6. 独立审查、作用域检查、远端 Typecheck/Web/E2E、记录最终 SHA 证据。保持 draft 直到上述当前 blockers 与验收缺口关闭，交回用户决定 merge。

```bash
git fetch origin
git checkout feat/reui-sidebar
git status --short
# 先保存/确认任务提交，再 rebase origin/canary；冲突需逐文件整合业务与 ReUI
bun run check --lint --test <changed-files...>
# 不在本机跑 tsgo / 全仓 type；使用 GitHub Typecheck
rg -n "@lobehub/ui" src/features src/components src/routes
```

本机启动 Web/SPA 被自动审批拒绝，原因是开发规则要求 Electron（dev:desktop /desktop:build:main），Web 构建交远端 CI。没有绕过。云端遵守其环境规则并在 PR 附真实证据。

本机留存运行状态（仅供本地复现）：user 正在用 Electron19/CDP9241；不要远程脚本导航该窗口。独立验收 20/CDP9242 已最小化；backend31271、Redis6379、Postgres5432、isolated DB `orvilo_reui_sidebar_20260929`，fixture 是 synthetic Agent Testing workspace/1 team/1 project/6 MyIssues rows/22 total issues。auth cookie 与 browser profile 不在 PR，云端应重新建立隔离 fixture。Brave9337 是复制的私有 profile，原 Brave 未动；Linear 截图 / 私有内容不上传。

## 可直接给云端的接手提示

> 请接手 draft PR #357 的 feat/reui-sidebar，先读 docs/development/reui-cloud-handoff.md 和两个 Issue specs。保留用户冻结要求与原主布局 / 原生 glass，Drafts 暂不做。先整合 canary PR285 的 team resources，修复已复现 popup 遮挡与 board 右键丢事件，再实施用户已批准的 dueDate/reminder 后端和右侧属性栏。剩余基础组件按页采用 ReUI 默认样式，保留实际回调 / 权限 / 持久化。GPT-6.1 Sol Medium subagents；不要本地 tsgo；真实运行与远端 CI 分开报告。未完成项保持 draft，不自行 merge。
