# 审计 — 侧栏 IA 收尾 + Project Overview 点名项（2026-09-23）

**性质**：只读代码审计。本轮**没有**跑运行时（CDP/dev server 按约束禁用），
所有「已修 / 仍在」判定来自**当前 HEAD 源码** + 仓库内已提交的运行时验证文档。
凡标「待运行时采集 / 复核」的格子，都是代码读不出答案、需要真机量的项。

**锚定 revision**：HEAD `5358ec676`（工作树干净，仅本文件为新增）。
涉及修复全部已确认是 HEAD 祖先（`git merge-base --is-ancestor` 逐一验证）：

| 事项                           | 引入 commit                                                             |
| ------------------------------ | ----------------------------------------------------------------------- |
| 移除 `成员` nav 项             | `b8e008890` 💄 fix(sidebar): remove extra members entry                 |
| team 子导航默认展开            | `74a921dd0` 🐛 fix(sidebar): open each team's sub-navigation by default |
| team 行改为折叠按钮            | `08fb5c980` 💄 Make team sidebar row toggle its children                |
| Overview 内联属性行            | `771af7092` / `3cd53b715`                                               |
| 悬停抖动修复                   | `963aa7a06`                                                             |
| 共享优先级图标                 | `fcbad6e8d`                                                             |
| 右栏状态 / 折叠图标            | `a1478716b`                                                             |
| 右栏行几何（90px 列 / 0 间距） | `0fd2c3eea` + `ed9fa3b39`（卡内缩 1048）                                |
| 里程碑双色菱形                 | `7e44d11c5` + `f977c952b`                                               |
| 里程碑锚点 / 过滤链接          | `84c01725e` + `fc33552af` + `a97d07cfe`                                 |

---

## 第一部分：侧栏 IA（对照 `PAGE-INVENTORY.md` §B/C 与用户裁决）

### 1.1 `成员` nav 项 —— ✅ 已移除，`/members` 仍可达

**当前渲染**：`src/features/HomeSidebar/Body/WorkspaceSection.tsx:127-135`
渲染 `projects` / `views` / `More` 三行，**无 `members`**。任务描述里的
「128-130 三行含 members」是移除前的旧形态，现已不存在。

**`/members` 可达性（裁决的前置条件）—— 三条都在：**

| 层              | 位置                                                          | 内容                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 独立路由        | `src/spa/router/desktopRouter.shared.tsx:775-787`             | `path: 'members'` → `routes/(main)/members`，**路由未删**                                                                                                                             |
| settings 路由   | `desktopRouter.shared.tsx:1074-1081`                          | `path: 'members'`（`/[workspaceSlug]/settings/` 下）                                                                                                                                  |
| settings 内链接 | `src/features/WorkspaceSetting/hooks/useCategory.tsx:125-129` | `WorkspaceSettingsTabs.Members`（`= 'members'`，`src/types/workspaceSettings.ts:25`）在 General 组第二项；`SideBar/Body.tsx:59-69` 把它渲染成 `/${slug}/settings/members` 的 `<Link>` |

**侧栏内到达路径**：Workspace 组 → `More` → `workspaceSettings` → `/settings`
（`WorkspaceSection.tsx:95-100`），进 settings 后左栏即有 `Members`。
与 Linear「成员在 settings 下」一致。**代码面无残余差异。**

### 1.2 `团队` 行 —— ✅ 已对齐为「按钮展开子项、默认展开」

参考端形态（`PAGE-INVENTORY.md` §B/C）：team 行是 `<button>` 控制
`aria-expanded`，其后 Home/Triage/Issues/Projects/Views 五个子项**常驻展开**。

候选端当前实现（`src/features/HomeSidebar/Body/TeamsSection.tsx`）：

| 项               | 位置                                                                                                                                                                                          | 形态                                                                                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEAM_SUB_ITEMS` | `TeamsSection.tsx:65-71`                                                                                                                                                                      | home /triage/issues/projects/views 五项，与参考端同名同序；triage 在 `team.orchestrationPolicy?.triageEnabled === false` 时隐藏（`:202-205`）                                                                                 |
| team 行元素      | `TeamsSection.tsx:189-199`                                                                                                                                                                    | `AccordionItem` + `AccordionTrigger`（**按钮**，TeamIdentity + 队名），点击只折叠 / 展开子项，**不再是 `<a href=/teams>`**                                                                                                    |
| 子项去向         | `TeamsSection.tsx:206-220`                                                                                                                                                                    | `WorkspaceLink` → `/teams/:id`（home）或 `/teams/:id?tab=<tab>`                                                                                                                                                               |
| 默认展开         | `src/features/HomeSidebar/hooks/useTeamSubNav.ts:14-15,42-63`                                                                                                                                 | 持久化的是**折叠集** `sidebarCollapsedKeys`（`src/store/global/selectors/systemStatus.ts:176-185`，默认 `[]` → 全开），与 `sidebarExpandedKeys` 分桶（`Body/index.tsx:60-78` 注释）。存量账号与老偏好**默认展开**，对齐参考端 |
| `/teams` 可达    | `TeamsSection.tsx:131-137,170-175`（header 右侧 ArrowRight「View all」）；`:227-231`（无已加入 team 时的 `Teams` 行）；路由 `desktopRouter.shared.tsx:813-828`（`/teams` + `/teams/:teamId`） | 功能未因入口改按钮而不可达                                                                                                                                                                                                    |

**结论：无需代码改动。** 仅剩两个运行时核对点（见 §1.5）。

### 1.3 `More` 行 —— 候选端已实现；参考端内容 **待运行时采集**

候选端（`WorkspaceSection.tsx`）：

- `:74-103` `moreMenu` 四项：`agents`（`/agents`）、`automations`（`/automations`）、
  `resource`（`/resource`）、`workspaceSettings`（`/settings`）；
- `:129-135` `DropdownMenu` 包 `NavItem`（`MoreHorizontalIcon` + `navPanel.more` = "More"），
  是**行内按钮 + 弹出菜单**形态，与参考端「`More` 是一个未展开的行」结构吻合。

参考端 `More`（`PAGE-INVENTORY.md:64-65`）：`y=310`，**枚举时未点开**，
其菜单内容仍是未量 —— 不得拿「候选端有四项」反推对齐。

**待运行时采集**：点开参考端 `More`，枚举菜单项（文本 + href + 图标），
与候选端四项逐一比对；多出 / 缺失项记为差异再派修。

### 1.4 `Drafts` 角标 —— ✅ 已实现（计数口径待运行时核对）

| 层       | 位置                                                                                                                                            | 内容                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| nav 项   | `src/hooks/useNavLayout.ts:78-83`                                                                                                               | `SidebarTabKey.Drafts` → `/drafts`，`FilePenLineIcon`                                                                     |
| 固定 IA  | `sidebarContract.ts:20`（`FIXED_PRIMARY_KEYS`）、`systemStatus.ts:212`（`DEFAULT_SIDEBAR_ITEMS`）、`Body/index.tsx:48`（`CORE_KEYS`，不可隐藏） | 位置在 `agent` 之后、`create` 之前，与参考端第 5 位一致                                                                   |
| 计数     | `Body/index.tsx:110-117`                                                                                                                        | `taskDraftService.count` → `taskDraft.count` lambda 查询（`src/services/taskDraft.ts:6-7,23`），`revalidateOnFocus: true` |
| 角标渲染 | `Body/index.tsx:217-220`                                                                                                                        | `draftCount > 0` 时在行尾渲染计数（与 inbox/reviews 同一 `extra` 槽位样式）                                               |
| 路由     | `desktopRouter.shared.tsx:720-732`                                                                                                              | `path: 'drafts'` → `routes/(main)/drafts`                                                                                 |

**待运行时验证**：参考端角标实测 `2`（草稿评论数）。候选端 `taskDraft.count`
的口径（草稿条数？含评论草稿？）需在真机上造 2 条草稿对照一次。

### 1.5 第一部分差异清单汇总

| 项                                                  | 判定                                                                               | 证据                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------- |
| `成员` nav 项                                       | ✅ 已移除；`/members` 三路径可达                                                   | §1.1                   |
| `团队` 行形态                                       | ✅ 按钮 + 子项默认展开                                                             | §1.2                   |
| `Drafts` + 角标                                     | ✅ 已实现                                                                          | §1.4                   |
| `More` 行内容                                       | ⚠ 候选端有，参考端未枚举                                                           | §1.3，**待运行时采集** |
| team 组 header「View all」箭头                      | ⚠ 候选端有（`TeamsSection.tsx:170-175`），参考端同位置是否有对应未枚举             | 待运行时采集           |
| triage 条件渲染（`triageEnabled === false` 时隐藏） | ⚠ 参考端 Triage 常驻；候选端按 team 策略隐藏 —— 数据驱动差异，需确认参考端无此条件 | 待运行时核对           |
| `Initiatives` / `Cycles` / `Triggers`               | ✅ 按用户裁决不做                                                                  | —                      |

**最小改动建议**：第一部分**无必改代码**。若运行时采集发现 `More` 菜单项
不一致，改动点在 `WorkspaceSection.tsx:74-103` 的 `moreMenu` 数组（纯数据）。

---

## 第二部分：Project Overview 六点名项

代码主战场：`src/features/Projects/Workspace/index.tsx`（主列）、
`Workspace/ProjectPropertiesCard.tsx`（右栏属性卡）、
`Workspace/ProjectDashboard.tsx`（主列里程碑）、
`Layout/ProjectSidePanel.tsx`（右栏）、
`src/features/Projects/milestoneRow.ts` + `sectionLabel.ts`（共享规格）。

### 2.1 主属性行 —— **部分**（行为与 pill 已修，集合成员与列宽有残余）

`Workspace/index.tsx:211-241` 当前形态：

| 子项                            | 现状                                                                                                                                                                                                                                | 判定                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Status                          | 真 `<button>` pill（`styles.status` `:80-112`：28px / `radius 9999px` / 13px・500 / 透明底 /hover `colorFillTertiary`），`DropdownMenu` → `projectService.updateStatus`（`:155-167,216-226`），`lifecycleLocked` 守门（`:168-174`） | ✅ 已修（codex.spec 的「死 Tag」已变成真菜单）                                                                                         |
| Priority / Lead / 日期 ×2       | `ProjectPriorityField/ProjectLeadField/ProjectDateField` `inline` 形态，`styles.inline` pill（`ProjectPlanningFields.tsx:51-90`）                                                                                                   | ✅                                                                                                                                     |
| 日期对分隔                      | `ArrowRightIcon` 16px（`index.tsx:230`）                                                                                                                                                                                            | ✅                                                                                                                                     |
| 容器几何                        | 仍 `Flexbox horizontal gap={16}`（`:211`）非 grid；label `minWidth:72`（`:212`，参考端标签列 65.4766 + 列间距 16 → 候选端值列起点比参考端约晚 6.5px）；值列 `wrap` + `gap:2px 4px`（`:215` + `styles.properties` `:75-79`）         | ⚠ **wrap 保留是按 codex.spec 的参考端实测**（参考端 390px 下也 wrap，gap 2/4）—— 但旧 spec 的「容器高～96px / 不同 y ≤ 2」需运行时复核 |
| **残余：多出 `Visibility` Tag** | `index.tsx:235-239` 仍渲染 `Public/Private` round Tag；参考端主行无此项（ref-inventory §2.2 六项无它；codex.spec 记为 "Candidate additionally renders … Public"）                                                                   | ✗ **仍在**，处置未裁决                                                                                                                 |
| **残余：缺 `Teams` chip**       | 参考端主行第 5 项是 Teams `BUTTON`（`svg 14×14 fill #ff2fcd`，ref-inventory §2.2）；候选端主行无 team 控件                                                                                                                          | ✗ **仍在**（未派修记录）                                                                                                               |
| Members chip                    | `index.tsx:232-234` 保留 ——`overview-members-updates.md` 明确「用户确认参考端有成员时主行也显示 Members」，属**有记录的保留**                                                                                                       | ✅ 有意                                                                                                                                |
| 行末 `⋯`                        | 未实现 ——spec 明令「不要发明未观测的菜单」                                                                                                                                                                                          | ✅ 有意留空                                                                                                                            |
| label 颜色                      | `SECTION_LABEL_PROPS`（`sectionLabel.ts:53-57`）= 13px/500 `colorTextSecondary`（`#666666`，ΔE 4.2 文档化偏离，dark 模式安全的取舍）                                                                                                | ✅ 已修（有记录的 token 取舍）                                                                                                         |

### 2.2 右栏 —— **部分**（行集合与几何已对齐，仍有结构缺口）

挂载：`Layout/index.tsx:58-62` —— `ProjectSidePanel` 在 overview/activity/tasks
三个 section 常驻（`PANEL_SECTIONS` `:23`），宽 ≤960px 时整树不挂载（`:27`）。
面板 399px + `scrollbar-gutter: stable`（`ProjectSidePanel.tsx:33-57`）；
卡 `radius 10`、起始内缩已对齐到内容盒 `x=1048`（`:58-83` 注释记录推导）。

`ProjectPropertiesCard.tsx:160-247` 行集合：

| 参考端 8 行    | 候选端                                                                                                              | 判定                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Status         | `:163-188` Tag + ChevronDown + DropdownMenu；active 态用 `ProjectActiveStatusIcon`（实测黄色周界 SVG，`a1478716b`） | ✅                                                      |
| Priority       | `:190-195` `ProjectPriorityField`                                                                                   | ✅                                                      |
| Lead           | `:197-202` `ProjectLeadField`                                                                                       | ✅                                                      |
| Members        | `:203-214` `ProjectMembersField`（空态 placeholder `properties.membersEmpty`）                                      | ✅                                                      |
| Dates          | `:215-220` `ProjectDateFields`（一行两控件 + `→`，内容宽自适应）                                                    | ⚠ 行在对，**控件内无图标**（见 §2.4）                   |
| Teams          | `:222-239` Tag 列表 / 空态 `—`                                                                                      | ✅                                                      |
| Slack          | **缺**                                                                                                              | ⟂ 产品域缺口（spec 判 UNRESOLVED，本仓库无 Slack 概念） |
| Labels         | `:241-246` `ProjectLabelsField`                                                                                     | ✅                                                      |
| ~~Milestones~~ | **已删**（卡内不再出现）                                                                                            | ✅ `rail-properties-card.spec` 的核心项                 |

几何：label 列 `width:90px; flex:0 0 auto`（`styles.label` `:39-43`）、行 `min-height:28`（`:62-66`）、卡内 `gap:8`（`:162`）→ pitch 36，全部对上参考端分解 `1048+90+0=1138`。

区头（`ProjectSidePanel.tsx:167-181`）：`<button>` + `AccordionArrowIcon`
16px 实心 disclosure（`AgentTasks/shared/AccordionArrowIcon.tsx`，`isOpen` 旋转 90°）

- `SECTION_LABEL_PROPS` 文字；折叠走 `hidden` + `aria-expanded`（`:183-185`）
  ——`right-rail-verification.md` @ `a1478716b` 已实测折叠交互。

**残余缺口（均有记录、未派修或有意推迟）**：

1. `Slack` 行 —— 产品域缺口；
2. 区头右侧 `+`/add action（Properties / Milestones）未实现 ——
   `right-rail-verification.md` 注明依赖尚不存在的 mutation；
3. Team / Activity 区头图标形状未对齐（同文档）；
4. 右栏 `Milestones` 卡控件集缺口见 §2.6；
5. `Progress` 卡：参考端有折线图，候选端 `ProjectIssueProgress` 只渲染数字组
   （`PARITY-TABLE.md` §3 列为未配对项）。

### 2.3 优先级图标 —— ✅ 已修

- 共享组件 `src/components/PriorityIcon/index.tsx`：`PRIORITY_ICONS`（`:107-113`）
  5 枚自绘 16-viewBox SVG（none/urgent/high/medium/low），urgent 橙、其余
  `colorTextSecondary`（`getPriorityIconColor` `:18-19`）；
- 调用点同源：Overview 字段 `ProjectPlanningFields.tsx:266`（`size={16}`）、
  Projects 列表 `List/index.tsx:458-463`、Create 弹窗默认态；
- 运行时验证：`priority-icons-verification.md` @ `fcbad6e8`（57.28×28 trigger、
  五档 listbox、urgent 橙色均实测）。

### 2.4 日期图标 —— **部分**（主行已修；右栏 Dates 行控件内无图标）

| 面                | 候选端                                                                                                                                                                                             | 参考端                                                                                                              | 判定                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 主行 start/target | `ProjectPlanningFields.tsx:340-344`：`inline` 时 `suffixIcon` = `CalendarDaysIcon` / `CalendarIcon` 16px；`styles.inlineDate` `:91-109` 把 suffix 前置（`order:-1`）、`field-sizing:content`       | `svg 16×16` 前置图标（ref-inventory §2.2）                                                                          | ✅                                  |
| 主行分隔          | `ArrowRightIcon` 16 svg（`index.tsx:230`）                                                                                                                                                         | 裸 `svg 16×16` 箭头                                                                                                 | ✅                                  |
| **右栏 Dates 行** | `ProjectDateFields`（`:370-379`）走 `fitContent` → `styles.field`，`suffixIcon = inline ? … : null`（`:340-344`）→ **两个日期按钮内无图标**；分隔符是纯文本 `<span aria-hidden>→</span>`（`:376`） | 每个 `role=button` 内含 16px 图标（文本偏移 +30 = 图标区 30px，ref-inventory §3.1 `:436,:449`）；分隔为 `svg 16×16` | ✗ **仍在**                          |
| aria 口径         | `aria-label = create.startDate/targetDate`（`:309`）                                                                                                                                               | `aria="Change project start/target date"`                                                                           | ⚠ 文案口径差异（轻，i18n 键值问题） |

**最小改动建议**：给 `ProjectDateField` 加一个 `rail`/`fitContent` 分支下的
前置图标（复用 `CalendarDaysIcon`/`CalendarIcon` 16 + `order:-1` 同一手段），
并把 `→` 文本换成 16px svg 箭头 —— 两处都在 `ProjectPlanningFields.tsx`，
不动交互逻辑。改动前需先确认参考端右栏日期按钮的图标**字形**（日历 or
里程碑式菱形？ref-inventory 只记了尺寸未记 path）——**待运行时采集**。

### 2.5 悬停抖动 —— ✅ 已修

- 修复 commit `963aa7a06`；验证文档 `hover-jitter-2026-09-22.md`：
  hover 后 7 个控件（Status/Priority/Lead/ 两个日期 / Members/Visibility）
  的 x/y/w/h **零变化**；
- 机理：`styles.inline` 静止态预留 `border: 1px solid transparent`
  （`ProjectPlanningFields.tsx:60`），`.ant-select-selector` `border:0 !important`
  （`:79`）——antd 控件 hover 不再长边框；status 按钮 `border:0` 恒定
  （`index.tsx:90`）hover 仅换背景。

### 2.6 里程碑 —— **部分**（图标 / 锚点 / 进度已修；卡片结构与若干控件为记录在案的推迟）

**已修部分：**

| 项              | 位置                                   | 形态                                                                                                                                                                    |
| --------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 共享规格        | `milestoneRow.ts:35-41`                | `MILESTONE_ICON_PAINT` = `fill #505ec4` + `stroke #5e6ad2`（参考端实测双色）；`MILESTONE_ICON_SIZE = 16` —— 主列与右栏**同一对象**，消灭了 12/14px 分叉的根因           |
| 主列锚点        | `ProjectDashboard.tsx:99,102-109`      | 行带 `id="milestone-<id>"` 落点；图标包 `<a href="#milestone-<id>">` + `scrollToMilestoneAnchor`（`milestoneRow.ts:69-75`，react-router 下主动滚动）                    |
| 主列进度链      | `ProjectDashboard.tsx:120-130`         | `N issues · N%` → `getProjectMilestoneIssuesPath` = `…/tasks?projectMilestoneId=<id>`（`milestoneFilter.ts:11-12`），与参考端 `…/issues?projectMilestoneId=<id>` 同语义 |
| 区标题          | `ProjectDashboard.tsx:85`              | `SECTION_LABEL_PROPS`（13px/500 muted），15px/600 已消                                                                                                                  |
| 右栏行          | `ProjectSidePanel.tsx:84-107,229-256`  | 42px 行、出血 ±10px、hover 底盘、图标 16 双色、名 12/450、进度 `{{percent}}% of {{count}}`（`packages/locales/src/default/project.ts:173`，对参考端 `100% of N`）       |
| 右栏 See issues | `ProjectSidePanel.tsx:108-132,249-255` | `display:none` → 行 hover `display:flex`（`:104-106`），24px 高 overlay 盖在读数位                                                                                      |

**仍在的差异（分两类）：**

A. **spec 明示推迟 / 内容未观测**（`milestone-row.spec.md`「本轮有意不做」表）：

1. 主列仍是**单行**，非参考端 129px 卡（描述正文、`Collapse`、hover 控件）；
2. 主列卡下 `BUTTON "Milestone"`（新建入口）无；
3. 右栏 `BUTTON[aria="Milestone actions"]` 24×24 常显 `⋯` 无；
4. 右栏第 5 行 `No milestone` 空态占位行无；
5. 拖拽手柄、主列 hover-only `Set target date` / `⋯` 均无；
6. 右栏行**不是**两层 `role=button` —— 现为 inert `div`（`:229`），
   spec 把「整行按钮跳 issues」列为可选项未做；代码注释（`:218-228`）
   记录了「键盘用户走主列进度链抵达同一过滤列表」的替代理由。

B. **记录与实测有出入、需裁决**：

7. `See issues` 去向：参考端实测跳 `/issues` **无 query**（ref-inventory `:499`），
   候选端跳 `…/tasks?projectMilestoneId=<id>` **带过滤**。`ProjectSidePanel.tsx:226`
   注释声称参考端指向「milestone-filtered list」—— 与 ref-inventory 的
   「`location.search` 为空」相矛盾（spec unknown 推测过滤可能在客户端状态）。
   **需要一次参考端运行时核对**：点 `See issues` 后列表是否按该里程碑过滤；
   不过滤则候选端此行为属有意增强，应写进差异台账而不是悄悄对齐。
8. `See issues` 字号：候选端 12px（`:122`），参考端 13.3333px（ref-inventory `:495`）——
   1.33px 差，记录待裁决。

### 2.7 第二部分差异清单汇总

| 点名项     | 判定     | 一句话                                                                                            |
| ---------- | -------- | ------------------------------------------------------------------------------------------------- |
| 主属性行   | **部分** | 行为 /pill/gap 已修；仍多 `Visibility` Tag、仍缺 `Teams` chip，容器非 grid + label 列 72 vs 65.5  |
| 右栏       | **部分** | Properties 卡行集合与几何已对齐；Slack 缺（产品域）、区头 add action / Progress 折线图未做        |
| 优先级图标 | **已修** | 共享 `PRIORITY_ICONS`，列表 / 详情 / 创建同源                                                     |
| 日期图标   | **部分** | 主行已修；右栏 Dates 两控件内无图标、分隔符是文本非 svg                                           |
| 悬停抖动   | **已修** | 963aa7a0 预留 1px 透明边框，实测零位移                                                            |
| 里程碑     | **部分** | 图标双色 16 / 锚点 / 过滤进度链已修；卡片结构与 5 个控件为记录在案的推迟；`See issues` 去向待裁决 |

---

## 待运行时验证项汇总（本轮禁用 CDP，全部留待下轮）

**侧栏：**

1. 参考端 `More` 行点开后的菜单枚举（文本 /href/ 图标），比对候选端四项；
2. 参考端 `Your teams` 组头是否有候选端「View all」箭头的对应物；
3. 参考端 team 子项是否随 `triageEnabled` 类策略隐藏（候选端 `TeamsSection.tsx:202-205`）；
4. `Drafts` 角标口径：造 2 条草稿，候选端计数应等于参考端 `2`；
5. 移除 `成员` 后真机走一遍 Workspace → More → workspaceSettings → Members 链路。

**Overview：**

6. 主属性行容器实测：不同 y 值数、容器高、首个 chip 相对 label 的 x 偏移
   （候选端 `72+16` vs 参考端 `65.5+16`）；
7. `Visibility` Tag / 缺 `Teams` chip 的用户裁决（参考端主行无前者有后者）；
8. 右栏 `Dates` 按钮内图标的字形采集，再定 §2.4 的最小改动；
9. 参考端 `See issues` 点击后的列表是否带里程碑过滤（裁决候选端带过滤行为）；
10. `Progress` 卡折线图、`Activity` 卡、Resources 行空态等 `PARITY-TABLE.md` §3
    未配对项仍整体未量。
