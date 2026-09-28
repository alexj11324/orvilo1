# 候选端 Project Overview 全量清单（结构 / 样式 / 行为）

本文件只描述**候选端 Orvilo** 在 Project Overview 页面上实际渲染出来的东西。
参考端（CDP 9333）由 `reference-inventory.md` 负责，本文件不做跨端结论。

## 证据与范围

- 采集时间：2026-09-22 10:40–11:00（本机时区），浅色主题。
- 目标：CDP **9222**（本 worktree 的 Electron），
  `app://renderer/ws-useragenttes/project/parity-test-project/overview`。
- 视口：`Emulation.setDeviceMetricsOverride` **1440x900 @ DPR 2**，每次测量前重新施加。
  本文件所有坐标都是 CSS px，以视口左上角为原点。
- 工具：`node .agents/acceptance/scripts/cdp-inspect.cjs --port 9222 --viewport 1440x900 --expr-file /tmp/q-*.js`
  （`--expr-file` 把脚本包进 `(async () => { ... })()` 求值，脚本里可直接 `return`）。
- 元素→源码映射：页面自带 **347 个 `data-insp-path`** 节点，形如
  `src/features/Projects/Workspace/ProjectDashboard.tsx:71:15:Flexbox`。本文件每个条目都附该路径。
- fixture 内容：项目 `Parity Test Project`（slug `parity-test-project`），status=inProgress，
  priority=High，startDate=Sep 1 2026，targetDate=Dec 31 2026，visibility=Public，
  4 个里程碑（Gate A–D），16 个 task（0 started / 0 completed），1 条 description，0 条 update。

### 修订戳（重要）

HEAD = `6a9bd400a`，但**测量期间工作树是脏的，并且有另一个 agent 在实时改这条路径上的代码**：

| 文件                                                        | mtime    | 状态      |
| ----------------------------------------------------------- | -------- | --------- |
| `src/features/Projects/Layout/ProjectSidePanel.tsx`         | 10:55:24 | modified  |
| `src/features/Projects/Workspace/ProjectDashboard.tsx`      | 10:55:14 | modified  |
| `src/features/Projects/Workspace/ProjectDashboard.test.tsx` | 10:55    | modified  |
| `src/features/Projects/milestoneRow.ts`                     | 新增     | untracked |

10:55 的 HMR 让 `data-insp-path` 行号整体位移（`ProjectDashboard.tsx` 47/61/68/69/73 →
71/84；`ProjectSidePanel.tsx` 116/127/129/133 → 126/137/143/149/153），并且**改的正是里程碑行**。
因此：

- 「主列里程碑区」「右栏 Milestones 卡」两节是 **10:57 在当前工作树上重测**的结果；
  并列出了改动前后的对照（见 §2.6 与 §3.2）。
- 其余各节测于 10:40–10:55（HMR 前），改动后已用同一脚本复测几何未变
  （`index.tsx:120:15` 容器仍是 `[401,287,594,64]`，7 个 chip 的 rect 逐个相同）。
- **本文所有 `file:line` 按当前工作树（脏树）的行号写**。若之后代码再动，行号会再次漂移 ——
  用 `data-insp-path` 的**文件 + 组件名**匹配，不要按行号硬编码。

---

## 0. 版面总图（1440x900）

| 区域                     | rect \[x,y,w,h]        | 说明                                                                       |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------- |
| Electron TitleBar        | `[0,0,1440,38]`        | 透明底，`-webkit-app-region: drag`；内含标签页                             |
| Body                     | `[0,0,1440,900]`       | `background: color(srgb 0.972549 0.972549 0.972549 / 0.7)` ≈ #F8F8F8 @70%  |
| DesktopLayoutContainer   | `[288,46,1144,826]`    | `bg #FFFFFF`，`border 1px solid #E3E3E3`，`radius 12px`，`overflow hidden` |
| 左栏（HomeSidebar Body） | `[0,85,280,750.2]`     | 宽 280，`padding 0 4px`                                                    |
| NavHeader（内容头部）    | `[289,47,1142,44]`     | 项目选择器 + 状态 chip + pin                                               |
| Tab 栏                   | `[289,91,1142,40]`     | `padding 0 20px`，`border-bottom 1px solid #EEEEEE`                        |
| 主列 shell               | `[289,131,730,740]`    | `overflow hidden`                                                          |
| 主列滚动层 `.content`    | `[289,131,730,713.68]` | `overflow: auto`，**scrollHeight == clientHeight == 714**                  |
| 主列页面列 `.page`       | `[313,131,682,713.68]` | `width: min(800px, 100% - 48px)` 居中，`padding 24px 0 32px`               |
| 右栏面板                 | `[1019,131,412,740]`   | 宽 412，`padding 12px`，`gap 12px`，`overflow-y: auto`                     |

### 修正一个此前假设（observed）

之前交接里写「主列下半部分要靠滚动内层容器才能看到」——**在 1440x900 下不成立**。
`.content` 有 `overflow: auto`，但 `scrollHeight === clientHeight === 714`；主列最后一个元素
（第 4 行里程碑）底边在 y=796.7，页面列底边 844.68，**全部内容都在首屏内，不需要滚动**。
只有**右栏**需要滚动：`scrollHeight 829 > clientHeight 740`，差 89px（第 4 张卡在折线以下）。

---

## 1. 页面外壳

### 1.1 左栏（observed）

- 容器 `src/features/HomeSidebar/Body/index.tsx:283:5:Flexbox` `[0,85,280,750.2]`，`display:flex; flex-direction:column`。
- 用户头 `src/features/HomeSidebar/Header/components/User.tsx:44:7:Block` `[8,46,216,32]`：
  头像 `AG` 28x28（`14px/700`）+ Text `Agent Testing User's workspace` `14px/500 #080808`（`User.tsx:71:15:Text`）
  - `lucide-chevron-down` 16x16 `stroke #999999`。`role=button`。
- 导航项（每个都是 `<a>`，`src/features/Workspace/WorkspaceLink.desktop.tsx:27:5:a`，`[4,y,272,28]`，行距 29，`radius 8px`）：

  | 文本                   | y     | href                           | 图标（18x18）                              |
  | ---------------------- | ----- | ------------------------------ | ------------------------------------------ |
  | Inbox                  | 85    | `/ws-useragenttes/inbox`       | `lucide-inbox`                             |
  | My issues              | 114   | `/ws-useragenttes/my-issues`   | `lucide-square-user`                       |
  | Reviews                | 143   | `/ws-useragenttes/reviews`     | `lucide-git-pull-request`                  |
  | Agent                  | 172   | `/ws-useragenttes/agent/inbox` | `lucide-bot`                               |
  | （仅图标 ＋）          | 201   | —                              | `lucide-plus`                              |
  | Workspace（折叠开关）  | 230   | —                              | `lucide-play` 7x7，Text `12px/500 #999999` |
  | **Projects（激活）**   | 257.9 | `/ws-useragenttes/projects`    | `lucide-folder-kanban`，图标 `#080808`     |
  | Views                  | 286.9 | `/ws-useragenttes/views`       | `lucide-layout-list`                       |
  | Members                | 315.9 | `/ws-useragenttes/members`     | `lucide-users`                             |
  | More                   | 344.9 | —                              | `lucide-ellipsis`                          |
  | Your teams（折叠开关） | 384.4 | —                              | `lucide-play` 7x7                          |
  | Teams                  | 413.9 | `/ws-useragenttes/teams`       | `lucide-layers`                            |

  非激活项图标 `stroke #999999`，标签 Text（`NavPanel/components/NavItem.tsx:246:13:Text`）`13px/500 #666666`，
  激活项标签 `13px/500 #080808`。

- **激活行背景不在 `<a>` 上**，由 `src/features/NavPanel/components/NavItem.tsx:180:7:Block` 画：
  `[4,257.9,272,28]`，`background rgba(0,0,0,0.03)`，`radius 8px`。
- 左栏底 `src/features/HomeSidebar/Footer/index.tsx:266:9:Flexbox` `[0,835.2,280,44.8]`：
  `ActionIcon` 28.8x28.8 + `Block` 28x28（头像 `AG` `10px/700`）。

### 1.2 内容头部 NavHeader（observed）

`src/features/NavHeader/index.tsx:47:7:Flexbox` `[289,47,1142,44]`，`display:flex; align-items:center; justify-content:space-between; gap:4px; padding:8px`。

左：项目选择器 `src/features/NavPanel/SidebarHeaderSelect.tsx:63:5:Block` `[297,53,190.7,32]`
（`role=button`，`tabindex=0`，`aria-haspopup=dialog`，`aria-expanded=false`，`cursor:pointer`，
`padding 2px`，`radius 10px`，`display:flex; gap:8px`）：

- 项目图标 `<img>` 28x28 `[299,55]`（`src/libs/next/Image.tsx:41:10:img`，`border-radius: 0`，与主列 44x44 是同一张图）
- Text `Parity Test Project` `[335,58,119,22]` `14px/500 #080808`，`text-overflow:ellipsis; white-space:nowrap`
- `lucide-chevrons-up-down` 16x16 `[466,61]` `stroke #999999`

右：`src/features/Projects/Layout/TabsBar.tsx:172:13:Flexbox` `[1294,57,129,24]` `display:flex; gap:10px`，两个子元素：

1. 状态 Tag `TabsBar.tsx:178:19:Icon` 所属的 `Tag` `[1294,59,95,20]`：文本 `In Progress`，
   `background rgba(22,88,255,0.06)`，`color rgb(0,114,245)`（#0072F5），`border-radius:999px`，
   `font-size:12px; font-weight:400`，`padding 0 8px`，`gap 4.8px`；图标 `lucide-circle-play` 12x12 `stroke #0072F5`。
   **`cursor: auto`，没有 role/tabindex/handler，点击无任何反应（实测 dead）。**
2. 图钉按钮 `src/features/HomeSidebar/Body/WorkFavoriteButton.tsx:25:9:ActionIcon` `[1399,57,24,24]`：
   `<button>`，`cursor:pointer`，`tabindex=0`；图标 `lucide-pin` 14x14 `stroke #999999`
   （hover 时 `#666666`）。点击会在 `lucide-pin` ⇄ `lucide-pin-off` 之间切换（实测两个方向都验证过，测完已复原）。
   **没有 `aria-label`、没有 `title`、没有 `aria-pressed`—— 无可访问名称。**

### 1.3 Tab 栏（observed）

外层 `TabsBar.tsx:212:7:Flexbox` `[289,91,1142,40]` `padding 0 20px`，`border-bottom 1px solid #EEEEEE`；
内层 `TabsBar.tsx:213:9:Flexbox` `[309,96.5,199,28]` `display:flex; gap:4px`。
三个 tab 都是 `<a>`（`WorkspaceLink.desktop.tsx:27:5:a`），`height:28px`，`border-radius:9999px`，
`padding 0 10px`，`font-size:12px; font-weight:500`：

| tab      | rect                   | href                                                    | 状态样式                                                    |
| -------- | ---------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| Overview | `[309,96.5,72.9,28]`   | `/ws-useragenttes/project/parity-test-project/overview` | `aria-current=page`，`bg rgba(0,0,0,0.06)`，`color #080808` |
| Activity | `[385.9,96.5,62.3,28]` | `.../activity`                                          | 透明底，`color #666666`                                     |
| Issues   | `[452.2,96.5,55.9,28]` | `.../tasks`                                             | 透明底，`color #666666`                                     |

**注意 tab 文案 `Issues` 与 href 里的 `tasks` 不一致**（observed，不是笔误）。
三个 tab 真点都验证过：分别落到 `/overview`、`/activity`、`/tasks`，`aria-current` 随之转移。
进入 Activity 后，**头部的状态 chip 与 pin 按钮仍在**（说明它们属于 Project Layout，不属于 Overview 页面）。

### 1.4 Electron 标签条（observed，非页面内容）

顶部一行 `TitleBar.tsx:28:5:Flexbox` `[0,0,1440,38]`，内含一个标签
（`TabItem.tsx:282:7:ContextMenuTrigger`，图标 `lucide-history` 14x14 `#666666`，文案 `Projects`）＋ `+`。

---

## 2. 主列

主列纵向节奏（observed，`.page` 内）：页面 padding-top 24 → 内容从 y=155 开始；
`Workspace/index.tsx:91:11:Flexbox` 是 `gap:20px` 的列，装 4 块：图标 + 标题 + 摘要、Properties 行、
Resources 行、composer、Description；之后 `ProjectDashboard` 以 `margin-block-start:24px` 接上。

### 2.1 项目图标 / 标题 / 摘要（observed）

| 元素         | rect               | 值                                                                                                                                                                             |
| ------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 图标 `<img>` | `[313,155,44,44]`  | `radius 0`，src 是 `registry.npmmirror.com/@lobehub/fluent-emo…`（同一个 fluent-emoji 立方体，头部另有一个 28x28 副本）                                                        |
| 标题         | `[313,209,682,32]` | **`<input>`**（`ProjectOverviewField.tsx:68:7:Input`），`value="Parity Test Project"`，`font-size:24px; font-weight:600; line-height:37.71px; color #080808`，背景透明、无边框 |
| 摘要         | `[313,243,682,24]` | 同组件第二个 `Input`，`value=""`，**`placeholder="Add a short summary…"`（U+2026 单字符省略号）**，`font-size:15px; font-weight:450`                                           |

两者之间是 `ProjectOverviewField.tsx:67:5:div` 包裹，`gap 2px`。

### 2.2 `Properties` 内联行（observed）

容器 `Workspace/index.tsx:116:13:Flexbox` `[313,287,682,64]`：
`display:flex; flex-direction:row; flex-wrap:nowrap; align-items:center; gap:16px`。

- 标签 `Workspace/index.tsx:117:15:Text` `[313,308.8,72,20.4]`：文本 `Properties`，
  `font-size:13px; font-weight:500; color rgb(153,153,153)`，`min-width:72px`，左对齐。
  垂直居中于 64px 行（308.8 = 287 + (64-20.4)/2）。
- chip 容器 `Workspace/index.tsx:120:15:Flexbox` `[401,287,594,64]`：
  **`flex-wrap: wrap`**，`gap: 8px`，`flex: 1 1 0%`，`min-width: 0`。

#### 换行结论：**换行了，且在第 5 个可见 chip 之后**

第 1 行（y=287，20px 高的 Tag 居中到 y=291）：

| #   | 元素                 | rect                   | 备注                                                                                                                                                                                                                                                     |
| --- | -------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tag `In Progress`    | `[401,291,95,20]`      | `bg rgba(22,88,255,0.06)`、`color #0072F5`、`radius 999px`、`12px/400`、图标 `lucide-circle-play` 12x12 `stroke #0072F5`、`cursor:auto`（不可点）                                                                                                        |
| 2   | button `Add members` | `[504,287,131.5,28]`   | `radius 8px`，`border 1px transparent`，`padding 0 8px`，`13px/400`；图标 `lucide-users` 14x14 `stroke #666666`；**文字色 `rgb(187,187,187)`**；`role=combobox aria-haspopup=listbox`                                                                    |
| 3   | button `High`        | `[643.5,287,53.6,28]`  | 同上外形；文字色 `#080808`；`role=combobox`                                                                                                                                                                                                              |
| 4   | button `Add lead`    | `[705.1,287,100.9,28]` | 图标 `lucide-user-round` 14x14 `#666666`；文字色 **`#080808`**；`role=combobox`                                                                                                                                                                          |
| 5   | 开始日期 DatePicker  | `[814,287,120,28]`     | `.ant-picker`，`radius 6px`，`border 1px transparent`，`padding 0 7px`；内部 `<input value="Sep 1, 2026" aria-label="Start date">` `[822,290,104,22]` `14px/400 #080808`；后缀日历图标 13x13 `fill currentColor` = `rgb(187,187,187)`；`flex: 0 0 120px` |

第 1 行占 401→934，容器右边界 995，**剩余 61px**；下一个元素（目标日期选择器）
需要 `120 + 8(gap) = 128px` > 61px → 换行。

第 2 行：

| #   | 元素                | rect                                                                                                           |
| --- | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| 6   | 目标日期 DatePicker | `[401,323,120,28]`（`<input value="Dec 31, 2026" aria-label="Target date">` `[409,326,104,22]`）               |
| 7   | Tag `Public`        | `[529,327,49.8,20]`，`bg rgba(0,0,0,0.03)`、`color #666666`、`radius 999px`、`12px/400`、无图标、`cursor:auto` |

换行由 **`flex-wrap: wrap` + 固定 120px 的 DatePicker** 造成，不是宽度算错。
另有两个细节：sr-only 的 `<label>`（Members/Priority/Lead）是 `position:absolute; 1x1`，
三个 `<input>` 是 `position:fixed; 1x1`，**都不参与 flex 行**，所以不计入上面的宽度账。

#### 与右栏是否同一套布局：**不是**（observed）

|                     | 主列内联行           | 右栏 Properties 卡                                          |
| ------------------- | -------------------- | ----------------------------------------------------------- |
| label 列 x / 宽     | `313` / `72px`       | `1044` / `84px`                                             |
| value 列 x          | `401`                | `1138`                                                      |
| label 与 value 间距 | `16px`（容器 gap）   | `10px`（行内 gap）                                          |
| label 排版          | `13px/500` `#999999` | `12px/450` `#666666`（唯 Status 行是 `13px/450` `#666666`） |
| 行高                | 58px（64 含两行）    | 28px（Dates 60、Milestones 92）                             |
| 行间距              | 由 wrap 决定         | `gap: 6px`                                                  |

### 2.3 `Resources` 行（observed）

容器 `Workspace/index.tsx:152:13:Flexbox` `[313,371,682,24]`，`display:flex; align-items:center; gap:16px; flex-wrap:nowrap`。

- 标签 `Workspace/index.tsx:153:15:Text` `[313,372.8,72,20.4]`：`Resources` `13px/500 #999999`，`min-width:72px`。
- 值容器 `Workspace/index.tsx:156:15:Flexbox` `[401,371,167.6,24]`，`gap:8px; flex-wrap:wrap`。
- 唯一子元素：按钮 `Add document or link…`（`Resources/ProjectLinks.tsx:115:11:Button`）
  `[401,371,167.6,24]`，`radius 6px`，`border 1px solid transparent`，`padding 0 8px`，
  `font-size:12px; font-weight:500; color #080808`，图标 `lucide-link-2` 14x14 `stroke #080808`
  `[410,376]`，`cursor:pointer`。空 fixture 下没有知识库 chip。

### 2.4 Update composer（observed）

- 外框 `Updates/index.tsx:208:9:div` `[313,415,682,66]`：`display:flex; justify-content:center`，
  **`border 1px solid rgb(227,227,227)`（实线，不是虚线）**，`border-radius:10px`，`padding:16px`，背景透明。
- 内部 `Updates/index.tsx:209:11:div` `[555.9,432,196.3,32]`。
- 按钮 `Updates/index.tsx:190:7:button` `[555.9,432,196.3,32]`：`border-radius:9999px`，
  `border 1px solid transparent`，`padding 0 12px 0 10px`，`gap:8px`，`13px/500`；
  图标 `lucide-circle-dot` 14x14 `stroke #666666` `[566.9,441]`；
  文案 `Write first project update` `Updates/index.tsx:198:9:Text` `[588.9,440.5,150.3,15]` `13px/500 #999999`。
- **行为（实测真点）**：点击后跳到 `.../activity`，`aria-current` 变 Activity，
  且 Activity 页上有一个 `contenteditable=true` 的编辑器 `[326,212,656,32]` **自动获得焦点**（没有 dialog）。

### 2.5 `Description` 折叠区（observed）

- 根 `ProjectDescription.tsx:103:5:Flexbox` `[313,501,682,88.4]`，`display:flex; flex-direction:column; gap:4px`。
- 开关 `ProjectDescription.tsx:104:7:button` `[313,501,87.3,20.4]`：
  `<button type="button">`，`aria-expanded="true"`，`aria-controls`，**没有 `aria-label`**，
  `display:flex; gap:4px; padding:0; border:0; background:transparent; cursor:pointer`；
  图标 `lucide-chevron-down` 14x14 `stroke #080808` `[313,504.2]`；
  文本 `Description` `ProjectDescription.tsx:112:9:Text` `[331,501,69.3,20.4]` `13px/500 #080808`。
- 正文 `ProjectDescription.tsx:116:7:div` `[313,525.4,682,64]`，包裹链有**三层不同字号**：
  `div(fs 14, lh 22)` → `div(fs 16, lh 25.6, display:flex)` →
  `div[contenteditable="true"](fs 15, fw 450, lh 24, white-space:pre-wrap)` `[313,529.4,682,56]` →
  `<p>` `[313,533.4,682,48]`（`margin: 4px 0`）→ 文本 span `[313,536.4,576.1,41.5]`（两行）。
- 内容：`Synthetic description text used only as layout-equivalent fixture data for Linear parity comparison.`
- **行为（实测）**：点击开关 → `aria-expanded=false`、图标变 `lucide-chevron-right`、
  正文高度 64→0、下方区块上移（613→545）。再点复原。

### 2.6 主列里程碑区（observed，10:57 在当前工作树重测）

- `ProjectDashboard.tsx:47:5:Flexbox`：`margin-block-start:24px`，`gap:24px`，`min-width:0`；
  `ProjectDashboard.tsx:48:7:Flexbox`：`padding:16px 0`，`border-block-start:1px solid #EEEEEE`，`gap:10px`。
- 标题行 `ProjectDashboard.tsx:49:9:Flexbox` `gap:7px`；
  文本 `Milestones` `ProjectDashboard.tsx:50:11:Text` `[313,630.4,77,23.6]`，`15px/600 #080808`。
- 列表 `ProjectDashboard.tsx:59:11:Flexbox` `gap:0`，4 行，每行 `ProjectDashboard.tsx:71:15:Flexbox`
  `[313,y,682,33.4]`，`padding: 6px 0`，`gap:10px`，`align-items:center`，
  `border-block-end: 1px solid #EEEEEE`（**第 4 行 `border: 0px none`**）：

| 行  | y     | 行 id                  | 图标链接            | 名称                                                                    | 日期                                                        |
| --- | ----- | ---------------------- | ------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | 664   | `milestone-f1f4a675-…` | `[313,672.2,16,16]` | `Gate A — Synthetic Boundary` `[339,670,571.9,20.4]` `13px/500 #080808` | `Oct 15, 2026` `[920.9,670.8,74.1,18.9]` `12px/400 #999999` |
| 2   | 697.4 | `milestone-9348cc50-…` | `[313,705.6,16,16]` | `Gate B — Synthetic Retirement` `13px/500`                              | `Nov 1, 2026` `12px/400 #999999`                            |
| 3   | 730.8 | `milestone-d734896b-…` | `[313,739,16,16]`   | `Gate C — Synthetic Closure` `13px/500`                                 | `Nov 20, 2026`                                              |
| 4   | 764.3 | `milestone-17571d8f-…` | `[313,772.5,16,16]` | `Gate D — Synthetic Disposition` `13px/500`                             | `Dec 10, 2026`                                              |

- 行内元素顺序与几何：`<a>`(16) → gap 10 → 名称（`flex:1 1 0%`，`ellipsis`，`nowrap`）→ 日期（右对齐，右边界 995）。
- 图标：`lucide-diamond` 16x16，`fill="transparent"`，`stroke="var(--ant-purple)"`，`stroke-width=2`，
  计算值 **`stroke: rgb(189, 84, 198)` = #BD54C6**。
- 每行 `<a href="#milestone-<uuid>" aria-label="<里程碑名>">` 只包住 16x16 图标；
  名称与日期**不在链接内**，且没有自己的 handler。
- **行为（实测）**：点击行 / 名称不导航、无 popover；唯一可点目标是那个 16x16 图标链接（`cursor:pointer`）。

#### 并发编辑对照（同一区域，10:55 前后）

| 观察项       | 10:55 之前（= HEAD `6a9bd400a` 的代码）                | 10:57 当前工作树                                                         |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| 主列图标尺寸 | 14x14                                                  | **16x16**                                                                |
| 主列图标颜色 | `stroke="currentColor"` → `rgb(8,8,8)`                 | **`stroke="var(--ant-purple)"` → `rgb(189,84,198)`**                     |
| 右栏图标尺寸 | 12x12                                                  | **16x16**                                                                |
| 右栏图标颜色 | `color={cssVar.colorPrimary}` → `stroke rgb(34,34,34)` | **`rgb(189,84,198)`**                                                    |
| 可点目标     | 两侧行内 **0** 个 `a`/`button`                         | 图标被 `<a href="#milestone-<id>">` 包住；主列行带 `id="milestone-<id>"` |
| 名称左边界   | 主列 337 / 右栏 1064                                   | 主列 339 / 右栏 1068                                                     |
| 行高 / 字号  | 未变                                                   | 未变（主列 33.4 / `13px/500`；右栏 18.9 / `12px/400`）                   |

改动来自新增的 `src/features/Projects/milestoneRow.ts`（`MILESTONE_ICON_SIZE = 16`、
`MILESTONE_ICON_COLOR = cssVar.purple`、`getMilestoneAnchorId`），两个渲染点现在共用这两个常量。

---

## 3. 右栏

面板 `ProjectSidePanel.tsx:126:7:Flexbox` `[1019,131,412,740]`：`width:412px`，`padding:12px`，
`gap:12px`，`overflow-y:auto`，`scrollHeight 829`（需滚 89px 才能看到第 4 张卡）。

**共 4 张卡**，全部是 `ProjectSidePanel.tsx:85:5:Flexbox` 的实例，样式一致：
`background: color(srgb 1 1 1 / 0.78)`（= rgba(255,255,255,0.78)），`border 1px solid #EEEEEE`，
`border-radius:10px`，`padding:12px`，`gap:8px`，`display:flex; flex-direction:column`。

| #   | 卡           | rect                   | 折叠开关（`ProjectSidePanel.tsx:86:7`→`87:9:button`）            |
| --- | ------------ | ---------------------- | ---------------------------------------------------------------- |
| 0   | `Properties` | `[1031,143,377,424]`   | `[1044,156,351,28]` `aria-label="Collapse properties section"`   |
| 1   | `Milestones` | `[1031,579,377,161.4]` | `[1044,592,351,28]` `aria-label="Collapse milestones section"`   |
| 2   | `Progress`   | `[1031,752.4,377,102]` | `[1044,765.4,351,28]` `aria-label="Collapse progress section"`   |
| 3   | `Activity`   | `[1031,866.4,377,82]`  | `[1044,879.4,306.6,28]` `aria-label="Collapse activity section"` |

折叠开关（`ProjectSidePanel.tsx:87:9:button`）共性：`min-height:28px`，`padding:0`，`border:0`，
背景透明，`cursor:pointer`，`display:flex; gap:6px`，左侧 **Text `13px/500 #666666`
（`ProjectSidePanel.tsx:97:11:Text`）** + `lucide-chevron-down` 12x12 `stroke #666666`
（`ProjectSidePanel.tsx:100:11:Icon`，Properties 卡在 `[1112,164]`）。内容区是
`ProjectSidePanel.tsx:104:7:div`（`[hidden]` 切换）> `105:9:Flexbox`。
**实测折叠行为**：`aria-expanded` true→false，`aria-label` 在 `Collapse/Expand … section` 间切换，
内容加 `hidden`，卡高 424→54，图标 chevron-down→chevron-right；再点复原。
（细节：折叠后该卡宽度 377→388，因为面板滚动条消失。）

### 3.1 `Properties` 卡（observed）

行容器 `ProjectPropertiesCard.tsx:148:5:Flexbox`：`display:flex; flex-direction:column; gap:6px`。
每行 `display:flex; gap:10px`，label 列 **x=1044 宽 84px**，value 列 **x=1138**（= 1044+84+10）。

| 行         | rect                | label（x=1044）                                      | value（x=1138）                                                                                                                                                                                                                                                                                          |
| ---------- | ------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status     | `[1044,192,351,28]` | `Status` `13px/450 #666666` `[1044,195.8,84,20.4]`   | `<span role="button" tabindex="0" aria-haspopup="menu">` `[1138,196,111,20]` `cursor:pointer`：Tag `In Progress` `[1138,196,95,20]`（`bg rgba(22,88,255,0.06)`、`#0072F5`、`radius 999px`、`12px/400`、`lucide-circle-play` 12x12 `#0072F5`）+ `lucide-chevron-down` 12x12 `stroke #080808` `[1237,200]` |
| Priority   | `[1044,226,351,28]` | `Priority` `12px/450 #666666`                        | button `High` `[1138,226,53.6,28]`：`radius 8px`，`padding 0 8px`，`13px/400 #080808`，`role=combobox`                                                                                                                                                                                                   |
| Lead       | `[1044,260,351,28]` | `Lead` `12px/450`                                    | button `Add lead` `[1138,260,100.9,28]`：`lucide-user-round` 14x14 `#666666` + 文本 `13px/400 #080808`                                                                                                                                                                                                   |
| Members    | `[1044,294,351,28]` | `Members` `12px/450`                                 | button `Add members` `[1138,294,131.5,28]`：`lucide-users` 14x14 `#666666` + 文本 `13px/400` **`rgb(187,187,187)`**                                                                                                                                                                                      |
| Dates      | `[1044,328,351,60]` | `Dates` `12px/450`（y=348.6，在 60px 行内居中）      | `[1138,328,257,60]` `flex-direction:column; gap:4px`：DatePicker `[1138,328,120,28]`、分隔箭头 `→` `[1262,331,11.2,22]` `14px/400 #080808`、DatePicker `[1138,360,120,28]`；两个 `<input>` 的 `aria-label` 分别是 `Start date` / `Target date`，值 `Sep 1, 2026` / `Dec 31, 2026`                        |
| Teams      | `[1044,394,351,28]` | `Teams` `12px/450`                                   | Text `—` `[1138,398.6,11.7,18.9]` `12px/400 #999999`，`cursor:auto`                                                                                                                                                                                                                                      |
| Labels     | `[1044,428,351,28]` | `Labels` `12px/450`                                  | button `Add label` `[1138,428,103.8,28]`：`lucide-tag` 14x14 `#666666` + 文本 `13px/400` **`#bbbbbb`**                                                                                                                                                                                                   |
| Milestones | `[1044,462,351,92]` | `Milestones` `12px/450`（y=498.6，在 92px 行内居中） | `[1138,462,257,92]` `flex-direction:column; gap:4px`，4 个 Tag 每行一个：`[1138,462,178.8,20]`、`[1138,486,184.6,20]`、`[1138,510,168.4,20]`、`[1138,534,187,20]`，`radius 999px`、`bg rgba(0,0,0,0.03)`、`color #666666`、`12px/400`，文本是**里程碑名**（`Gate A — Synthetic Boundary` 等）            |

**`Milestones` 行里的 chip 不可点**（实测：无 role/tabindex/handler，点击无 popover、无导航）。

可交互控件的实测响应（真点 `.click()` + 观察 portal）：

| 控件                 | 结果                                                                      |
| -------------------- | ------------------------------------------------------------------------- |
| Status 行 value span | 打开 `role="menu"`：`In Progress / Archived / Backlog / Paused / Planned` |
| Priority `High`      | 打开 `role="listbox"`：`No priority / Urgent / High / Medium / Low`       |
| `Add lead`           | 打开 `role="listbox"`：`No lead / AT Agent Testing User`                  |
| `Add members`        | 打开 `role="listbox"`：`AT Agent Testing User / Invite and add…`          |
| `Add label`          | 打开 `role="listbox"`，内容 `No data`                                     |
| 两个 DatePicker      | 打开 `.ant-picker-dropdown` 日历（Sep 2026 / Dec 2026）                   |

### 3.2 `Milestones` 卡（observed，10:57 重测）

内容 `ProjectSidePanel.tsx:105:9:Flexbox` `[1044,628,351,99.4]` `gap:8px`；4 行，每行
`ProjectSidePanel.tsx:137:15:Flexbox` `[1044,y,351,18.9]` `gap:8px; align-items:center`，行距 26.9：

| 行  | y     | 图标链接                                                                                             | 名称                                                                          | 日期                                                                           |
| --- | ----- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | 628   | `<a>` `[1044,629.4,16,16]` `href="#milestone-f1f4a675-…"` `aria-label="Gate A — Synthetic Boundary"` | `ProjectSidePanel.tsx:149:17:Text` `[1068,628,244.9,18.9]` `12px/400 #080808` | `ProjectSidePanel.tsx:153:19:Text` `[1320.9,628,74.1,18.9]` `12px/400 #999999` |
| 2   | 654.9 | `[1044,656.3,16,16]`                                                                                 | `Gate B — Synthetic Retirement` `[1068,654.9,249.8,18.9]` `12px/400`          | `Nov 1, 2026` `[1325.8,654.9,69.2,18.9]`                                       |
| 3   | 681.7 | `[1044,683.1,16,16]`                                                                                 | `Gate C — Synthetic Closure` `[1068,681.7,242.2,18.9]`                        | `Nov 20, 2026` `[1318.2,681.7,76.8,18.9]`                                      |
| 4   | 708.6 | `[1044,710,16,16]`                                                                                   | `Gate D — Synthetic Disposition` `[1068,708.6,242.4,18.9]`                    | `Dec 10, 2026` `[1318.4,708.6,76.6,18.9]`                                      |

- 图标：`ProjectSidePanel.tsx:143:19:Icon` > `lucide-diamond` **16x16**，`fill transparent`，
  `stroke="var(--ant-purple)"` → 计算值 **`rgb(189,84,198)`**，`stroke-width 2`。
- 几何：`a`(16) → gap 8 → 名称（`flex:1 1 0%`，`ellipsis`，`nowrap`）→ 日期（右对齐到 1395）。
- **整行的可点目标只有那个 16x16 图标链接**（`cursor:pointer`）；行本身
  `DIV`、`cursor:auto`、无 `role`/`tabindex`/handler，`elementFromPoint` 落在名称 Text 上（`cursor:auto`）。
  名称与日期都不可点。
- 与主列同区**不是同一个组件**：两处分别由 `ProjectSidePanel.tsx` 与 `ProjectDashboard.tsx` 渲染。
  间距（8 vs 10）、行高（18.9 vs 33.4）、名称字号字重（`12px/400` vs `13px/500`）、
  有无行分隔线（无 vs `1px #EEEEEE`）都不同；当前修订只共用了 `milestoneRow.ts` 的图标尺寸与颜色。

### 3.3 `Progress` 卡（observed）

`ProjectIssueProgress.tsx:47:5:Flexbox` `[1044,801.4,351,40]`，`display:flex; gap:8px`，
三个 `<dl>`（`ProjectIssueProgress.tsx:49:9:dl`）各 `width:111.66px; flex:1 1 0%`，
x 分别是 `1044 / 1163.7 / 1283.3`（间距 8px，行距 119.7）。

每个 `<dl>` 内：

- `dt`（`ProjectIssueProgress.tsx:50:11:dt`）`[x,y,111.7,20]`：`display:flex; gap:5px; align-items:center`，
  `font-size:12px; font-weight:500; color #666666`，前置色块 `span`（`51:13:span`）**6x6**，`border-radius:1px`：
  - Scope → `rgb(153,153,153)`（#999999）
  - Started → `rgb(238,158,11)`（#EE9E0B）
  - Completed → `rgb(34,34,34)`（#222222）
- `dd`（`ProjectIssueProgress.tsx:54:11:dd`）`[x,y+20,111.7,20]`：`font-size:12px; font-weight:400; color #080808`，
  `line-height:20px`，`margin:0`，**`padding-inline-start: 11px`**（= 色块 6 + gap 5），
  `font-variant-numeric: tabular-nums`。数值：`16 / 0 / 0`。
  这个 11px 内缩是刻意让数字与 dt 的**标签文字**左对齐（dt 文字起点 x=1055，dd 文字起点 x=1055）。
- 整卡无任何可点目标（实测色块与数字点击均无反应）。

### 3.4 `Activity` 卡（observed，在首屏折线以下，需滚动 89px）

`[1031,866.4,377,82]`。头部：折叠开关 `[1044,879.4,306.6,28]`（`Activity` `13px/500 #666666`）
＋ 右侧 `See all` 链接 `WorkspaceLink.desktop.tsx:27:5:a` `[1358.6,884,36.4,18.9]`
`12px/400 #666666`，`href .../activity`（真点验证跳转）。
内容 `ProjectCreationActivity.tsx:25:5:Flexbox` `[1044,915.4,351,20]`，`gap:8px`：
图标 `lucide-box` 14x14 `[1044,918.4]`，`stroke rgb(8,8,8)`（**比旁边文字更深**）；
文本 `Project created ·` `12px/400 #666666` `[1066,915.4,133,20]` +
`<time>Sep 22</time>` `12px/400 #666666` `[1159.4,917.9,39.6,14.5]`。

---

## 4. 疑似多出的元素（**需要与参考端交叉核对**）

我按分工没有访问参考端 9333，因此下面只能列出「在候选端存在、且按经验在 Linear 的
Project Overview 上不太可能出现的控件」，**不能断言参考端没有**：

1. **内容头部右上角的状态 chip**（`TabsBar.tsx` 内，`[1294,59,95,20]`）—— 与主列 `Properties`
   内联行里的状态 Tag 是同一套 token、同样 95x20，属视觉重复；且它 `cursor:auto` 不可点。
2. **头部图钉按钮**（`WorkFavoriteButton.tsx:25:9:ActionIcon`）—— 可点、会切换状态，但
   **没有任何可访问名称**（无 `aria-label`/`title`/`aria-pressed`）。
3. **右栏 `Properties` 卡里的 `Milestones` 行**（`ProjectPropertiesCard.tsx:229:9`）——
   把 4 个里程碑名做成 `radius 999px` 的 chip、每行一个，且全部不可点；
   同一份数据在下面还有一张独立的 `Milestones` 卡。
4. **右栏第 4 张 `Activity` 卡**—— 只在 `showActivity` 打开时渲染。
5. **右栏 `Progress` 卡**（Scope/Started/Completed 三元组 + 6x6 色块）——
   注意此卡**没有进度条**，只有三组数字。
6. **DevDock 底部开发工具条**（`src/features/DevDock`）：`Agent Mock` / `Feature Flags` /
   `Render Gallery` 按钮（`11px/400 #666666`，`[31,876]` 起）+ 路由路径 + `120 FPS` / `CLS` /
   内存等读数（`[970.7,877.4]` 起），另有 `lucide-ellipsis` 溢出菜单 `[1416,880]`。
   这是开发期浮层，不属于产品 UI。
7. **Electron 标签条**（`TitleBar` 内 `Projects` 标签 + `lucide-history` 历史按钮）。
8. **左栏底部常驻的 `AG` 头像**与 `Agent Mock` 等入口。

---

## 5. 已知陷阱（实测踩到，实现 / 复测时别再踩）

1. **标题上的黄色底不是样式**。`Parity Test Project` 标题（`<input>`）曾整块显示黄色
   `rgb(253,240,117)`。实测：该 `<input>` 的 `background-color` 是 `rgba(0,0,0,0)`、
   `box-shadow: none`、`:autofill` 不匹配，`::selection` 计算值是 `rgb(255,239,92)`，
   而 `document.getSelection()` 的 anchorNode 是 `index.tsx:100:15:Flexbox`、range rect
   `[313,209,682,58]`（正好罩住标题 + 摘要两个 input）。**在空白处点一下黄底即消失**
   （复测像素从 `(253,240,117)` 变回 `(255,255,255)`）。这是 Chromium 对跨表单控件选区的绘制，
   不是 CSS。`::selection` 全局色是 `rgb(255,239,92)`。
2. **`<a>` 的 computed `color` 会骗人**。左栏导航 `<a>` 的 `color` 是链接蓝
   `rgb(0,114,245)`，但用户看到的文字颜色来自内层 `Text`（`#666666` / 激活 `#080808`）。
   采「链接颜色」必须落到叶子文本节点上。同理 tab 的 `<a>` 自带 `font-size:14px`，
   而可见文本是 `12px/500`。
3. **主列标题 / 摘要是 `<input>`，不在 `textContent` 里**。任何按文本找标题的查询都会落空
   （甚至误命中 `NavPanel/SidebarHeaderSelect.tsx:75:7:Text` 里头部那个同名文本）。
   占位符用的是单字符 `…`（U+2026），不是三个点。
4. **三层嵌套字号**：Description 正文包裹链是 `14px → 16px → 15px`，采到哪一层决定结论。
5. **`data-insp-path` 的行号会随并发编辑漂移**（本次实测：10:55 的一次 HMR 把
   `ProjectDashboard.tsx` 的 47/61/68/69/73 变成 71/84）。匹配用**文件 + 行内组件名**，
   不要硬编码行号。同一区域在两次测量之间可能已经换了实现。
6. **右栏折叠后卡宽会变**（377→388），因为面板滚动条消失。比较宽度前先固定折叠状态。
7. **`Add members` / `Add label` 的文本色是 `#BBBBBB`，而 `Add lead` / `High` 是 `#080808`**
   —— 主列与右栏**两处都一样**，所以更像既有设计而非渲染事故，但与「同为一组 placeholder」
   的直觉不符，跨端比对时要当成一个待判定的点。
8. **`Milestones` 卡第 4 张（Activity）在首屏之外**，panel `scrollHeight 829 > clientHeight 740`；
   不滚就统计卡片数会少一张。
9. 候选端有大量**带文本但不可见的节点**（未挂载 tab 的常驻渲染）。任何
   `querySelectorAll` 统计都必须先用 rect + 逐级 `offsetParent` 过滤可见性，否则数字全是噪音。

---

## 6. unknown（本次未测，不要当成已确认）

- **参考端的对应值**：本文件不含任何跨端结论，全部交给 `reference-inventory.md`。
- **NavHeader 项目选择器点击后的 dialog 内容**（`aria-haspopup="dialog"`，未打开测）。
- **右栏折叠态宽 388 是否是回归**：未与参考端比对「折叠后是否应保持 377」。
- **键盘可达性**：只记录了 `tabindex`/`role` 属性，没做真实 Tab 走查，
  也没有验证 16x16 的图标链接是否满足最小点击目标尺寸。
- **深色主题**：只测浅色。`var(--ant-purple)` 等 token 在深色下的解析值未知。
- **其它 tab 上的右栏**：只在 Activity 页确认了头部状态 chip 仍在，未逐卡比对
  Overview/Activity/Issues 三处右栏是否完全一致（源码注释声称右栏在所有 tab 常驻）。
- **窄视口 / 断点行为**：只在 1440x900 测。`.page` 的 `width: min(800px, 100% - 48px)` 与
  主列 `Properties` 行的换行位置都会随宽度变化，未扫断点。
- **hover /focus/active 三态的完整样式**：仅零星采到 pin 按钮 hover 由 `#999999` 变 `#666666`。
- **`Add document or link…` 之外的 Resources 非空态**（fixture 没有知识库链接）。

---

## 7. 复现方式

```bash
cd /Users/alexjiang/Desktop/vibe/orvilo-linear-parity
# 结构/样式：把脚本写进文件再用 --expr-file 传（脚本里可直接 return）
node .agents/acceptance/scripts/cdp-inspect.cjs --port 9222 --viewport 1440x900 --expr-file /tmp/q-*.js
# 几何证据：截图（注意先点击空白处清掉选区，否则标题会带黄底）
node .agents/acceptance/scripts/cdp-inspect.cjs --port 9222 --viewport 1440x900 --shot /tmp/cand.png
# 行为证据：真点（Input.dispatchMouseEvent，走 hit-testing）
node .agents/acceptance/scripts/cdp-inspect.cjs --port 9222 --viewport 1440x900 \
  --click '<selector>' --expr "await new Promise(r=>setTimeout(r,1000)); return location.href"
```

本次采集用到的临时脚本：`/tmp/q-probe.js`、`q-shell.js`、`q-shell2.js`、`q-inspmap2.js`、
`q-mainprops2.js`、`q-header.js`、`q-title.js`、`q-maindump.js`、`q-hit.js`、`q-yellow.js`、
`q-sel.js`、`q-rail.js`、`q-svg.js`、`q-blocks.js`、`q-desc2.js`、`q-toggle3.js`、`q-dead.js`、
`q-live.js`、`q-wrap.js`、`q-sidebar.js`、`q-labels.js`、`q-remeasure.js`。
截图：`/tmp/cand-overview-1440.png`（10:4x 修订，标题带选区委影）、
`/tmp/cand-current-1440.png`（10:57 修订）、`/tmp/cand-rail-bottom.png`（右栏滚到底）。
