# 参考端 Linear 六页速览（ref-sweep）

这是**排序用的 triage**，不是验收规格。目的是回答「这六页里哪页与候选端差异最大、最该先做」，
所以每页只采：版面骨架、区块清单、可见文本、代表元素原值、空态、数据基数。

**不是**逐元素深挖，**没有**追 hover /focus/ 菜单。精读留给后续单页 deep-dive。

采于 `2026-09-22`，参考端 `:9333`（Brave），CDP 直连。

---

## 0. 证据条件（六页共用，逐页仅记差异项）

| 项              | 值                                                                                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 参考端          | `https://linear.app`，workspace `BDI_Verifier`，team `orvilo`                                                                                                                                                     |
| 视口            | `1440x900`，`deviceScaleFactor 2`。采集当时窗口本体即 `innerW 1440 / innerH 900 / dpr 2`（`outerW 1441`），override 与真实一致 —— 但**窗口后来漂到过 `1200x824`**，见 9.4。本文件所有几何**只在 1440x900 下可比** |
| 语言            | `<html lang="zh-CN">` —— 但**界面 chrome 全英文**，只有**内容数据**中英混排                                                                                                                                       |
| 主题            | 浅色                                                                                                                                                                                                              |
| 字体            | `"Inter Variable", "SF Pro Display", -apple-system, …`，`-webkit-font-smoothing: antialiased`                                                                                                                     |
| 页面底 / 主面板 | `#eeeff1` / `#f9f8fb`（computed 原值是 `lch()`，见下）                                                                                                                                                            |

### 色板（canvas 取像素换算 sRGB，因为 computed style 一律返回 `lch()`）

| 用途              | computed 原值                                  | sRGB                  |
| ----------------- | ---------------------------------------------- | --------------------- |
| 页面底（`html`）  | —                                              | `#eeeff1`             |
| 主面板（`main`）  | `lch(97.94 0.5 282)`                           | `#f9f8fb`             |
| 主按钮底          | `lch(53 52.26 286.91)`                         | `#6d79d4`             |
| 主按钮字          | `lch(100 5 286.91)`                            | `#fffeff`             |
| 激活分段底 / 字   | `lch(93.483 0.5 282)` / `lch(9.794 0 282)`     | `#ededed` / `#1a1a1b` |
| 未激活分段底 / 字 | `lch(99.997 0.5 282)` / `lch(39.176 1.25 282)` | `#fefeff` / `#5c5d5f` |
| 标题字            | `lch(19.588 1.25 282)`                         | `#2f2f31`             |
| 导航项字          | `lch(9.444 0 282)`                             | `#1a1a1b`             |
| 分隔线            | —                                              | `#e2e2e2`             |

> 比对陷阱：参考端把颜色写成 `lch()`，直接抓 computed style 拿去和 Orvilo 的 hex 比会
> **全部不等**，而那是表示法差异不是设计差异。要比就先换算到同一空间。

### 共用外壳（六页只有这些是一致的）

| 区域        | 几何（CSS px）                            | 备注                                     |
| ----------- | ----------------------------------------- | ---------------------------------------- |
| 左导航 NAV  | `x0 y0 244x900`                           | 导航项 `220x28`，行距 29px               |
| 主面板 MAIN | `x244 y8 1188x856`                        | 圆角面板                                 |
| 页头 HEADER | `x245 y9` 起，**高 88**                   | **Agent 页例外：高 44**                  |
| 页标题      | `x263 y23`，`h2`                          | **13px / 500 / `#2f2f31`** —— 不是大标题 |
| 分段控件    | 高 28，圆角 `9999px`，**不是 `role=tab`** | 12px / 500                               |
| 图标按钮    | `28x28`                                   | 顶栏一排                                 |
| 右下角      | `Agent` 12px / 450                        | 常驻                                     |

**页标题只有 13px** 是这个产品最容易做错的一处：Orvilo 若按常见习惯给页面大标题（20–24px），
这一排会整体错位。

---

## 1. Inbox

- **URL**：`/bdiverifier/inbox` → **自动重定向**到 `/bdiverifier/inbox/priority`
- **title**：`Inbox (32)`
- **截图**：`/tmp/refsweep/inbox.png`　**快照**：`/tmp/refsweep/inbox.json`　**原值**：`/tmp/refsweep/inbox.probe.json`

### 版面骨架

| 区域   | 几何            | 内容                                        |
| ------ | --------------- | ------------------------------------------- |
| NAV    | `0,0 244x900`   | 共用                                        |
| 列表栏 | `245,9 400x855` | **自己的页头（高 88）** + 通知列表          |
| 详情栏 | `645,9 787x855` | 选中通知的 issue 详情（**不是右栏 aside**） |

这是**双栏 master-detail**，不是单列表页。`main` 里没有 `aside`，两栏是并排 div。

### 区块清单

| #   | 区块       | 几何                     | 类型     | 内容                                                                                              |
| --- | ---------- | ------------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| 1   | 列表页头   | `245,9 400x88`           | 分段控件 | `Inbox` + 分段 `Priority`(角标 29) / `Other`(角标 2) + 右侧 3 图标                                |
| 2   | 引导横幅   | `y112–172`               | 可关闭卡 | `Important notifications now go to your priority inbox` + `Keep priority inbox`(下拉) + `Disable` |
| 3   | 通知列表   | `y209` 起，**行距 55px** | 列表     | \~13 行可见                                                                                       |
| 4   | 详情页头   | `y23`                    | 面包屑   | `ORV-115` 13px/500                                                                                |
| 5   | 详情标题   | `y112`                   | 文本     | **24px / 600**                                                                                    |
| 6   | 属性 chips | `y173–204`               | chip 行  | 状态`Done` / 优先级`High` / `Assignee` / 项目名 /milestone/ `Labels` / `2 related`，均 12px/450   |
| 7   | 正文       | `y258` 起                | 富文本   | h2 **19px/600**、h3 **17px/600**、正文 **15px/450**、行内 code **14.0625px**                      |

### 可见文本（去重按 y，摘录）

```
  67 Inbox           │ 67 Priority(29)  │ 67 Other(2)
 121 Important notifications now go to your priority inbox
 148 Keep priority inbox          │ 148 Disable
 209 ORV-115  [Slimming 15] Remove orphan AChaos subsystem and chaos fixtures
 229 GitHub                                                        229 17h
 264 🔒 chore(slimming): full census coverage + strict fail-closed boundary …   284 Devin 17h
 319 🧹 chore(slimming): classify Knowledge/RAG boundary as KEEP + conflict …   339 Devin 17h
 374 🚀 promotion: repository slimming consolidated tree (ORV-99–111, bounda…   394 Devin 17h
 429 🗑️ chore(slimming): remove orphan AChaos subsystem + chaos fixtures (O…   449 Devin 17h
 484 💄 feat(work-surfaces): Linear parity polish — project tabs/panel, acti…   504 Devin 18h
 539 ORV-101 [Slimming 03] Verify Provider/BYOK retirement and clean residuals  559 GitHub 18h
（列表继续到 y899，共 ~13 行）
```

### 代表元素原值

| 元素       | 字号 / 字重 | 颜色                              |
| ---------- | ----------- | --------------------------------- |
| 通知行 ID  | 13 / 450    | `lch(19.588 1.25 282)`            |
| 通知行标题 | 13 / 500    | 同上                              |
| 行元数据   | 12 / 450    | `lch(39.176 1.25 282)`            |
| 详情标题   | 24 / 600    | —                                 |
| 正文       | 15 / 450    | —                                 |
| 分段控件   | 12 / 500    | 见色板（**`role=tab` 计数为 0**） |

### 空态

列表**非空**（有数据）。但**详情栏有一个真实的「未选中」占位态**，已复现两次：

- 文案 `{N} unread notifications`，13px / 500，**水平居中于详情栏**（`x966 y490 w144`，栏中心 1038.5 = 文本中心 1038）
- 出现时机：导航后约 5s 仍是占位；随后应用**自动选中首条**并填充详情
- 计数会随已读变化：同一会话内依次观测到 `30` → `29`

### 数据基数

- 导航角标 `31` → 页头 `Inbox (32)`（两个计数不同源，未深究）
- `Priority 29` + `Other 2`
- 列表可见～13 行；`Priority` 分组下 `Devin` 为主要来源，少量 `GitHub`

### 速览结论

**与「典型 Linear 列表页」差异最大的一页**：它是双栏 master-detail（左列表 + 右详情），
而不是单列列表；且带一条可关闭的引导横幅和一个真实的「未选中」占位态。候选端若按普通列表做，
差异是**结构性**的。

---

## 2. My issues

- **URL**：`/bdiverifier/my-issues/assigned`
- **title**：`My issues › Assigned`
- **截图**：`/tmp/refsweep/myissues.png`　**快照**：`/tmp/refsweep/myissues.json`　**原值**：`/tmp/refsweep/myissues.probe.json`

### 版面骨架

| 区域 | 几何               | 内容                     |
| ---- | ------------------ | ------------------------ |
| NAV  | `0,0 244x900`      | 共用                     |
| 页头 | `245,9 1187x88`    | 占满整宽（**没有右栏**） |
| 列表 | `245,350 1176x572` | 分组 + 层级树，无列头    |

单栏全宽，无 master-detail。

### 区块清单

| #   | 区块                        | 几何                      | 类型     | 内容                                                                                |
| --- | --------------------------- | ------------------------- | -------- | ----------------------------------------------------------------------------------- |
| 1   | 页头                        | `245,9 1187x88`           | 分段控件 | `My issues` + 分段 `Assigned` / `Created` / `Subscribed` / `Activity` + 右侧 3 图标 |
| 2   | 分组头 `Urgent issues 2`    | `y106`                    | 可折叠组 | `13px/500` + 计数 `13px/450`，hover 出 `+`                                          |
| 3   | 分组头 `Blocking issues 37` | `y234`                    | 可折叠组 | 同上                                                                                |
| 4   | 行                          | `y148` 起，**行距～44px** | 表格行   | 见下                                                                                |

### 行的元数据列（这是本页信息密度的来源）

从左到右：拖拽把手・状态环图标・优先级图标・issue ID・标题・子项计数 `0/9`・
评论数徽标・标签（`Bug` / `claude code` / `Improvement`）・PR 引用（`#151`）・
项目 chip（`ACP Harness 退役 + CAID 工程化`）・负责人头像（9px `AJ`）・日期

**层级**：子 issue 通过缩进 + 连接线挂在父 issue 下（`ORV-68` 缩进于 `ORV-22` 之下）。

### 可见文本（摘录，y 排序）

```
 106 Urgent issues 2
 148 DAY123-79  ContextFocus: payment licensing subscription refund support  … Feature │ ContextFocus │ Jun 24
 192 DAY123-84  ContextFocus: final commercial release evidence …            … Feature │ ContextFocus │ Jun 24
 234 Blocking issues 37
 275 ORV-22   Phase 3 — 第二轮审查整改 SA01–SA09     0/9   Bug │ claude code │ ACP Harness 退役 + CAID 工程化 │ Sep 20
 319 ORV-68   [SA09] 真机 ACP 验收（BLOCKED：环境缺位）  1 │ 13   claude code │ … │ Sep 20
 363 ORV-21   Phase 2 — 独立审查整改 R00–R11（findings F01–F12，PR #149–#165）  0/12  Bug │ claude code │ Sep 20
 407 ORV-60   [R11] 固定整合 SHA 的真实验收与最终删除审查（F12）  10 │ 9  claude code │ Improvement │ Sep 20
 408 ORV-58 / ORV-57 / ORV-56 / ORV-55 / ORV-54 / ORV-53 / ORV-52 / ORV-51 / ORV-50 / ORV-49 …
```

### 代表元素原值

| 元素     | 字号 / 字重 | 备注                      |
| -------- | ----------- | ------------------------- |
| 行标题   | 13 / 500    | 中文标题同字号            |
| issue ID | 13 / 450    | 等宽感（未验字体族）      |
| 行元数据 | 12 / 450    | 标签、项目 chip、日期同号 |
| 头像     | 9 / 400     | 极小                      |
| 分组头   | 13 / 500    | 与行标题同号不同色阶      |

### 空态

**非空**（两组共 39 条）。

### 数据基数

- `Urgent issues` **2** 条，`Blocking issues` **37** 条（合计 39）—— 计数来自分组头自述
- 视口内可见 **16 行**（Urgent 2 + Blocking 14）
- 跨两个 team：`orvilo` 的 `ORV-*` 与另一 team 的 `DAY123-*`

### 速览结论

**与「典型 Linear 列表页」相比的特殊之处**：分组头 + **父子层级树（缩进 + 连接线）** +
极密的元数据列（标签 / PR 引用 / 项目 chip 同时出现）。这是六页里**交互与布局复杂度最高**的列表。

---

## 3. Reviews

- **URL**：`/bdiverifier/reviews`
- **title**：`Reviews (18)`
- **截图**：`/tmp/refsweep/reviews.png`　**快照**：`/tmp/refsweep/reviews.json`　**原值**：`/tmp/refsweep/reviews.probe.json`

### 版面骨架

| 区域   | 几何            | 内容                         |
| ------ | --------------- | ---------------------------- |
| NAV    | `0,0 244x900`   | 共用                         |
| 列表栏 | `245,9 482x855` | 自己的页头（高 88）+ PR 列表 |
| 详情栏 | `727,9 705x855` | **空态**                     |

又是双栏 master-detail，但两栏宽度与 Inbox 不同（482/705 vs 400/787）。

### 区块清单

| #   | 区块                    | 几何                     | 类型     | 内容                                                             |
| --- | ----------------------- | ------------------------ | -------- | ---------------------------------------------------------------- |
| 1   | 列表页头                | `245,9 482x88`           | 分段控件 | `Reviews` + 分段 `For you` / `Created` + 右侧 2 图标             |
| 2   | 分组头 `Ready to merge` | `y103`                   | 可折叠组 | 12px/500（**注意：比行标题小**）                                 |
| 3   | 分组头 `Created by you` | `y855`                   | 可折叠组 | 同上                                                             |
| 4   | PR 行                   | `y138` 起，**行距 40px** | 列表     | PR 图标 + 标题 13/500 + 时间 13/450（右对齐 `x677`）+ 草稿笔图标 |
| 5   | 详情栏空态              | `1008,340`               | 空态     | 插画 + 文案                                                      |

### 可见文本（摘录）

```
 103 Ready to merge
 138 🐛 fix(tasks): close prerequisite recovery and private cascade gaps        6d
 178 fix(ci): name the GitHub secret in the deploy pre-flight error             8d
 217 Make 纸白 and 米黄 look like different papers                               5w
 258 Fix leftover import P2s: session trust, S3 resign, auth match              5w
 298 codex/daymark stack 01 trellis removal                                      7w
 338 test: add UI automation and smoke flows                                     7w
 378 Optimize notebook for local setup and disable cloud platform sections       6mo
 418 Add drug sales backtesting analysis with visualization                      6mo
 458 Habits: fix heatmap gutters and floating month day                          7w
 498 fix: use native Liquid Glass for the detail date                            7w
 538 docs: align product and interaction guidance                                7w
 578 feat: update localization for redesigned flows                              7w
 618 feat: redesign the event creation and detail experience                     7w
 658 feat: expand the event background picker                                    7w
 698 feat: refine widgets and Live Activity layouts                              7w
 738 feat: refine subscriptions and premium paywall                              7w
 778 refactor: harden local-first integration services                            7w
 818 feat: add event style foundations and display fonts                          7w
 855 Created by you
 890 🔒 ci(vercel): gate branch deployments on green CI                          2d
 930 🔥 chore(retire): drop the skill-store prompt wiring and its dead locale keys 4d
 970 🔧 ci(release): prepare protected releases and standalone desktop publishing  4d
```

### 代表元素原值

| 元素      | 字号 / 字重 |
| --------- | ----------- |
| PR 行标题 | 13 / 500    |
| 行时间    | 13 / 450    |
| 分组头    | 12 / 500    |
| 空态文案  | 13 / 500    |

### 空态

**详情栏是空态**（`Reviews` 页无选中项时的默认态）：

- 插画 `svg` `143x152` at `x1008 y340`（**水平居中**：中心 1079.5 = 栏中心 1079.5）
- 文案 `45 reviews`，13px / 500，at `x1045 y515`

> 注意这个 `45` 与导航角标 `18`、标题 `Reviews (18)` **不是一个数**。未深究其口径
> （疑似「全部 review 总数」vs「待我处理数」），**不要当成 bug 断言**。

### 数据基数

- 导航角标 `18`，`title` 也是 `18`
- 左列表视口内可见 **21 行**（`Ready to merge` 下 18 行 + `Created by you` 下 3 行）
- **分组头不带计数**（与 My issues 不同，后者写着 `2` / `37`），所以 18/3 是「可见行数」不是「组内总数」
- 详情栏空态自述 `45 reviews`

### 速览结论

**左列表的行不是 issue，是 PR**（图标是 PR 分支图标、标题是 conventional-commit 风格）。
候选端若把 Reviews 做成 issue 列表，语义就错了。右栏与 Inbox 一样是 master-detail。

---

## 4. Agent

- **URL**：`/bdiverifier/agent`
- **title**：`New chat`
- **截图**：`/tmp/refsweep/agent.png`　**快照**：`/tmp/refsweep/agent.json`　**原值**：`/tmp/refsweep/agent.probe.json`

> ⚠️ **本节已按第 8.5 节回审修正。** 初次采集只看到**状态 A**（composer 单独居中），
> 漏掉了迟到的**状态 B**（composer 上移 + 示例卡）。两态都在下面，**B 才是稳定终态**。

### 版面骨架

| 区域 | 几何            | 内容                                                |
| ---- | --------------- | --------------------------------------------------- |
| NAV  | `0,0 244x900`   | 共用                                                |
| 页头 | `245,9 1187x44` | **只有 44 高（其他页 88）**，只有 `New chat ⌄`      |
| 主体 | 居中单列        | 大插画（背景，极低对比）+ composer 卡（+ 示例卡区） |

**没有 tab、没有表格、没有右栏。**

### 两个状态（**这是本页最容易做错的地方**）

页面加载后先渲染 **A**，约 11–20 秒后才进入 **B**。布局在两者间**整体位移**，不是多一块而已。

| 区块                                | 状态 A（早，`bodyTextLength=219`） | 状态 B（终态，`bodyTextLength=435`）  |
| ----------------------------------- | ---------------------------------- | ------------------------------------- |
| composer 卡                         | `482,395 712x104`                  | `482,~294 712x112`（**上移约 91px**） |
| 输入区                              | `500,409 676x24`                   | `500,318 676x24`                      |
| 底部控制条（`Skills`/ 附件 / 发送） | `y463`                             | `y372`                                |
| 示例卡区                            | **不存在**                         | `y456`，3 张 `232x135`                |

### 区块清单（状态 B）

| #   | 区块        | 几何                                                    | 类型            | 内容                                                                                         |
| --- | ----------- | ------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------- |
| 1   | 页头        | `245,9 1187x44`                                         | 标题 + picker   | `New chat` 按钮（`aria-label="Switch agent chat"`，`92x28`）+ 左侧 `Menu` 按钮               |
| 2   | 背景插画    | `670,187 336x336`                                       | svg             | 大尺寸、极低对比（视觉上几乎看不见）                                                         |
| 3   | composer 卡 | `482,~294 712x112`                                      | 表单            | 圆角卡                                                                                       |
| 4   | 输入区      | `500,318 676x24`                                        | contenteditable | `ProseMirror`，**15px**                                                                      |
| 5   | 底部控制条  | `494,372 688x24`                                        | 按钮行          | `Skills` chip `74x24` + 附件 `24x24` + 发送 `24x24`                                          |
| 6   | 示例区标题  | `498,425`                                               | 文本 + 关闭钮   | `Get started with some examples` **12px / 450**；右侧 `Dismiss` 关闭钮 `24x24` at `1154,420` |
| 7   | 示例卡 ×3   | `y456`，每张 `232x135`，圆角 `8px`，间距 8（pitch 240） | **button**      | 图标 + 标题 13px/500 + 描述 12px/450                                                         |

示例卡内容（逐字）：

| 卡  | 标题（13/500）           | 描述（12/450）                              |
| --- | ------------------------ | ------------------------------------------- |
| 1   | `Create a new project`   | `Turn an idea into a well-scoped project`   |
| 2   | `Research a topic`       | `Research a topic across the issue backlog` |
| 3   | `Draft a project update` | `Turn project progress into a clear update` |

三张卡横向铺满 composer 宽度（`482..1194`），与 composer 左对齐。

### 可见文本

```
状态 A（219 字符，仅两条）        状态 B（435 字符，终态）
 23 New chat                       23 New chat
463 Skills                        372 Skills
                                  425 Get started with some examples
                                  520 Create a new project      / 542 Turn an idea into a well-scoped project
                                  520 Research a topic          / 542 Research a topic across the issue backlog
                                  520 Draft a project update    / 542 Turn project progress into a clear update
```

**关键：`Ask Linear...` 是 placeholder，不是文本节点。** 抓 `innerText` **抓不到**
（实测 `contenteditable` 的 `::before` 为 `none`，占位符由别的机制渲染）。
aria-label 反而是可靠来源：`Attach images, files, or videos`、`Send message`、`Skills`、`Dismiss`。

### 代表元素原值

| 元素       | 字号 / 字重 | 备注                           |
| ---------- | ----------- | ------------------------------ |
| 输入区     | 15 / 400    | `lch(20 1 282)`，`ProseMirror` |
| `Skills`   | 12 / 500    | chip，`74x24`                  |
| `New chat` | 12 / 500    | 页头 picker，`92x28`           |
| 页标题     | 13 / 500    | 与其他页一致                   |

### 空态

**整页就是「新会话」空态**（0 条消息）。但空态**不是一个静止画面**：它有状态 A → B 的演进，
终态 B 含 3 张可点击的示例卡和一个 `Dismiss` 关闭钮。

没有历史会话列表 —— 左侧 `Agent` 导航项有角标 `2`，但本页不展示会话列表
（**未找到入口，记 unknown**；我只看了默认渲染，未点 `Menu` / `New chat ⌄`）。

### 数据基数

**0**（新会话）。

### 速览结论

**与其他五页完全不同的形态**：无 tab、无列表、无表格，页头只有 44 高，主体是 composer
空态 + 示例卡。**若候选端把 Agent 做成「会话列表 + 右侧详情」，那是把 Inbox/Reviews 的模式
误套过来**。

另外两点只有深挖才会发现、但对 parity 很关键：

1. **示例区是可关闭的**（`Dismiss`），关闭后是否持久化**未验证**（我没有点它）。
2. **composer 的纵向位置随示例区出现而上移约 91px** —— 若候选端把 composer 固定在某个
   "垂直居中" 位置，两态里必有一态是错的。

---

## 5. Projects（列表）

- **URL**：`/bdiverifier/projects/all`
- **title**：`Projects`
- **截图**：`/tmp/refsweep/projects.png`　**快照**：`/tmp/refsweep/projects.json`　**原值**：`/tmp/refsweep/projects.probe.json`

### 版面骨架

| 区域 | 几何            | 内容                       |
| ---- | --------------- | -------------------------- |
| NAV  | `0,0 244x900`   | 共用                       |
| 页头 | `245,9 1187x88` | 标题 + tab + `New project` |
| 表格 | `y105` 起       | **带列头的真表格**         |

### 区块清单

| #   | 区块   | 几何                     | 类型     | 内容                                                                                      |
| --- | ------ | ------------------------ | -------- | ----------------------------------------------------------------------------------------- |
| 1   | 页头   | `245,9 1187x88`          | 分段控件 | `Projects` + tab `All projects`（带一个附加图标）+ 右侧 `New project`（`x~1341`）+ 3 图标 |
| 2   | 列头行 | `y105`，12px/450         | 表格头   | 7 列，见下                                                                                |
| 3   | 数据行 | `y144` 起，**行距 48px** | 表格行   | 6 行                                                                                      |

**列头（含 x 坐标）**：`Name`(289) · `Health`(877) · `Priority`(1013) · `Lead`(1081) ·
`Target date`(1141) · `Issues`(1232) · `Status`(1293)

**行的形态**：图标 + 名称（13/500 at `x317`）+ 可选标签 chip + 目标日期・
`Health` 列为虚线圆 + `No updates`（12/500） · `Priority` 列为柱状图标或 `---` ·
`Lead` 列为 9px 头像・`Issues` 列为纯数字・`Status` 列为**甜甜圈图标 + 百分比**

### 可见文本（全量）

```
 23 Projects                                            23 New project
 67 All projects
105 Name   877 Health   1013 Priority   1081 Lead   1141 Target date   1232 Issues   1293 Status
144 Repository Slimming & ACP Boundary Hardening   903 No updates   1259 16   1317 100%
191 ACP Harness 退役 + CAID 工程化                 903 No updates   1259 75   1317 32%
240 Orvilo Linear Parity                          903 No updates   1087 AJ   1259 32   1317 39%
288 📋 PasteBuddy: Paste.app Feature Parity         903 No updates   1259 42   1317 98%
336 📆 Daymark (DaysCount)  dsfgsdfg  Sep 30      903 No updates   1259 25   1317 85%
384 ContextFocus                                  903 No updates   1259 15   1317 57%
```

### 代表元素原值

| 元素       | 字号 / 字重 | 备注                |
| ---------- | ----------- | ------------------- |
| 列头       | 12 / 450    | 比对行标题更轻      |
| 行名称     | 13 / 500    |                     |
| 行数值     | 12 / 450    | Issues 数、百分比   |
| Health     | 12 / 500    | **比同行的 450 重** |
| 负责人头像 | 9 / 400     |                     |

### 空态

**非空**（6 行）。

### 数据基数

**6** 个项目。

### 速览结论

**六页里唯一有列头行的表格式列表页**。`Health` / `Priority` / `Lead` / `Target date` /
`Status` 五列是「按项目聚合」特有的，`Status` 列还是甜甜圈 + 百分比。与 issue 列表页
（My issues）**列模型完全不同**，不能共用同一套行组件。

---

## 6. Views

- **URL**：`/bdiverifier/views/issues`
- **title**：`Issues`（注意：`<title>` 是 `Issues`，页头写的是 `Views`）
- **截图**：`/tmp/refsweep/views.png`　**快照**：`/tmp/refsweep/views.json`　**原值**：`/tmp/refsweep/views.probe.json`

### 版面骨架

| 区域 | 几何            | 内容                     |
| ---- | --------------- | ------------------------ |
| NAV  | `0,0 244x900`   | 共用                     |
| 页头 | `245,9 1187x88` | 标题 + 分段 + `New view` |
| 主体 | 居中块          | **空态**                 |

### 区块清单

| #   | 区块     | 几何              | 类型       | 内容                                                                      |
| --- | -------- | ----------------- | ---------- | ------------------------------------------------------------------------- |
| 1   | 页头     | `245,9 1187x88`   | 分段控件   | `Views` + 分段 `Issues` / `Projects` + `New view`（`x1354`）+ 右侧 1 图标 |
| 2   | 空态块   | `668,428 340x156` | 空态       | 见下                                                                      |
| 3   | 空态插画 | `668,324 66x80`   | svg        | **与文本块左对齐**（不是居中于块）                                        |
| 4   | 空态标题 | `668,428`         | 文本       | `Views`，**15px / 600**，行高 23px                                        |
| 5   | 空态正文 | `668,459 340x73`  | 文本       | **13px / 450**，行高 18.2px                                               |
| 6   | 快捷键行 | `668,547 340x36`  | 文本 + kbd | `⌥` `V` 两个 `kbd`，**11px / 450**                                        |
| 7   | 按钮行   | `668,608 340x28`  | 按钮       | `Create new view`（主，`116x28`）+ `Documentation`（次，`109x28`）        |

空态块 `x668 w340` → 中心 838 = `main` 中心（`244 + 1188/2`），**整块水平居中**。

### 可见文本（全量）

```
 23 Views                                      23 New view
 67 Issues        67 Projects
428 Views
459 Create custom views using filters to show only the issues you want to see. You can save, share,
    and favorite these views for easy access and faster team collaboration.
547 You can also save any existing view by clicking the [icon] icon or by pressing ⌥ V .
608 Create new view        608 Documentation
```

### 代表元素原值

| 元素     | 字号 / 字重 | 颜色                        |
| -------- | ----------- | --------------------------- |
| 空态标题 | 15 / 600    | `lch(19.588 1.25 282)`      |
| 空态正文 | 13 / 450    | `lch(39.176 1.25 282)`      |
| `kbd`    | 11 / 450    | `lch(39.176 1.25 282)`      |
| 主按钮   | 12 / 500    | 底 `#6d79d4` / 字 `#fffeff` |
| 次按钮   | 12 / 500    | 底 `#fefeff` / 字 `#2f2f31` |

### 空态

**是空态，且已跨分段证实。** 额外做了一次只读切换（`Issues` → `Projects`）：

- `/views/projects` 同为空态，文案平行替换为 `…only the projects you want to see`
- 结论：该 workspace **确实 0 个已保存视图**，不是某个分段为空

> 因此本页「有数据时长什么样」**在参考端无法观测** —— 空态看不见的东西不能推断为有数据时也有。
> 视图行 / 看板视图 / 分组等形态全部记 **unknown**。

### 数据基数

**0**（两个分段都是 0）。

### 速览结论

**纯空态页，六页里唯一没有任何数据形态可看的**。可用于对齐空态（插画 + 标题 + 两段说明 +
主次按钮 + 快捷键提示），但**不能用来对齐列表本身**。差异面窄，优先级最低。

---

## 7. 排序建议（供 triage 用）

按「差异面大小 × 结构性风险」降序：

| 序  | 页面              | 理由（一句话）                                                                                                       |
| --- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | **My issues**     | 分组头 + 父子层级树 + 极密元数据列，是六页里布局与交互复杂度最高的列表，候选端几乎必然缺层级树                       |
| 2   | **Inbox**         | 双栏 master-detail（不是普通列表）+ 引导横幅 + 真实「未选中」占位态，结构性差异大                                    |
| 3   | **Projects 列表** | 唯一带列头的表格，且 7 列里 5 列是项目特有聚合列，不能复用 issue 行组件                                              |
| 4   | **Reviews**       | 同为双栏，但左栏行是 **PR 不是 issue**，语义差异大于视觉差异                                                         |
| 5   | **Agent**         | 形态与前四页完全不同（composer + 示例卡 + 44 高页头），且空态**分两态、composer 会位移**；但元素总数少、没有列表语义 |
| 6   | **Views**         | 只有空态可对，数据形态不可观测，差异面最窄                                                                           |

**先做 My issues。** 它同时压住「分组」「层级」「元数据列」三件事，做完这套行模型对
Reviews / Inbox 的列表都有复用价值。Views 最后做，且**只能对齐空态**。

> §8.5 的回审没有改变这个排序。唯一被上调的是 **Agent** 的复杂度评估：它不止是
> 「一个 composer」，还有一个迟到的示例卡区、一个两态之间的 composer 位移，
> 以及一个可关闭的 `Dismiss`。但它仍然没有列表 / 层级语义，所以位次不变。

---

## 8. unknown（明确未证实项，**不要当成已知**）

1. **各页非默认分段** —— 只看了每页的默认分段。未看：
   `My issues › Created / Subscribed / Activity`、`Reviews › Created`、
   `Inbox › Other`、`Projects` 页头那个附加图标 tab。**这些分段的内容形态全部未知。**
2. **Views 有数据时的形态** —— 参考端 0 视图，任何列表 / 看板形态都无法观测。
3. **Agent 的历史会话列表** —— 导航角标显示 `2`，但本页未找到入口（未点任何 `Menu` / picker）。
4. **Reviews 详情栏有选中项时的形态** —— 只观测到空态。有意**未点击**任何 PR 行。
5. **Inbox 角标口径** —— 导航角标 `31`、标题 `(32)`、分段合计 `29 + 2 = 31`、空态自述
   `30 unread` 这四个数互不相等，未深究。
6. **Reviews 空态的 `45 reviews`** —— 与角标 `18` 不同源，未深究。
7. **行内等宽字体族** —— issue ID / 行内 code 看着是等宽，但只采了字号未采 `font-family`。
8. **hover /focus/ 激活态原值** —— 本轮按 triage 边界**完全未采**。
9. **滚动后的行** —— 只采了首屏；长列表滚动后的行为（粘性分组头等）未采。
10. **Agent 页 `Ask Linear...` 占位符的渲染机制** —— 不是 `::before`，未定位到具体元素。
11. **Agent 示例区的关闭是否持久化** —— 有 `Dismiss` 按钮，但我**没有点它**（点它会改状态）。

---

## 8.5 「不存在 / 空态」类结论的回审（2026-09-22 追加）

起因：团队 lead 指出这类结论有**两条独立出错路径** —— 采样时机（§9.1）与
`cdp-inspect.cjs` 把「忘记写 `return`」打印成 `null`（已在 commit `241749c30` 修掉）。
凡是「我看的时候没有」得出的结论都要重判。

### 方法

不用原探针重跑一遍（那是同一个方法，同一个盲区）。改用**计数法 + 正对照**：

- 数**全文档**与**仅可见**两组数，把「真的是零」和「被可见性过滤筛掉」分开
  （原探针的 `pick()` 用 `.find(VIS)`，这是它最脏的一处）
- **正对照**：在游离容器里塞入 `h1` / `aside` / `textarea` / `[role=tab]` 各一个，
  用同一条 `querySelectorAll` 路径数一遍。**六页 `controlOk` 全为 `true`**
  （各数到 1）→ 所以报告里的 0 是「确实没有」，不是「仪器坏了」
- 六页均在 `--viewport 1440x900` 下重跑，`href` 逐页核对无误

### 逐条结论

| #   | 原结论                                            | 原始读数                                                                 | 是 `null` 还是真实为空                                                                                               | 重测结果                                                                                                                                                                                                                                |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `main` 里没有 `aside`（两栏是并排 div）           | `.regions.aside = null`（六页皆是）                                      | **是 `null`** —— 但来自 `document.querySelector('aside')`，该 API 的总集查询**不跳过隐藏元素**，所以是「全文档零个」 | ✅ **成立**。计数：`aside.all = 0, visible = 0`（六页一致）                                                                                                                                                                             |
| 2   | 页标题一律 `h2`（没有 `h1`）                      | `styles` 里 `pick('h1')` 返回 `null`，被 `.filter(Boolean)` **静默丢掉** | **是 `null`**，且这个 null 更弱 —— `pick()` 用 `.find(VIS)`，会把「存在但隐藏的 h1」也丢掉                           | ✅ **成立**。计数：`h1.all = 0`（六页），`h2.all = 1`（六页），正对照能数到 h1                                                                                                                                                          |
| 3   | Agent 页没有 `textarea`，用的是 `contenteditable` | `placeholder: null, taRect: null, taStyle: null`                         | **是 `null`**（我写的显式三元表达式，不是「忘写 return」）                                                           | ✅ **成立**。计数：`textarea.all = 0`（六页）；Agent 页 `contenteditable = 1`、`.ProseMirror = 1`                                                                                                                                       |
| 4   | 各页页头是 **`tablist`**                          | 我按视觉标注，未取 role                                                  | 非 null 支撑                                                                                                         | ❌ **不成立，已改**。计数：`[role=tab]` 与 `[role=tablist]` **六页全为 0**。那些分段控件是普通链接（`main a`，12px/500）。已把全文的 `tablist` 改为「分段控件」                                                                         |
| 5   | Views 该 workspace **0 个已保存视图**             | 切到 `Projects` 分段读到平行空态文案                                     | 非 null（`mainText` 是字符串）                                                                                       | ✅ **成立**。计数复核**两个分段**：`ul/ol/table/listitem/row` **全为 0**、可点行状元素 0 条、`Create new view` CTA 与空态标题都在                                                                                                       |
| 6   | Reviews 右栏是空态                                | 右栏文本数组**只有 1 条**（`45 reviews`），不是 null                     | 非 null                                                                                                              | ✅ **成立**，且已按两时间点复核：`t0` 该区域**根本不存在**（`pane: null`，还没画），`t+9s` 存在且恰为 `1 条文本 + 1 个 svg(143x152)`。**`t0` 那个 null 正是「不能拿它下结论」的样本**：只看 `t0` 会写成「Reviews 没有右栏」，而那是假的 |
| 7   | Agent 整页只是 composer 单卡空态                  | `bodyTextLength = 219`，非 null                                          | 非 null                                                                                                              | ❌ **不成立，已改**。见下                                                                                                                                                                                                               |

### 第 7 条展开：Agent 页漏了一整块（**本轮第二个真错**）

`settle` 在 219 处宣布稳定并退出，但约 **11–20 秒**后页面才进入终态 435 ——
多出 `Get started with some examples` + **3 张示例卡**（逐字文案与几何见 §4）。

这不是 `null` 问题，是 **§9.1 的采样时机问题**，只是换了个触发条件：
内容「长了一下 → 停一会儿 → 又长」。**`settle` 只防「正在快速长」，不防「长完又长」。**

所以六页里 **Agent 的结论是错的、已被本次回审修正**；其余五页的空态 / 不存在结论经计数法复核**成立**。

---

## 9. 方法论：本轮踩到的坑（会影响后续所有采集）

### 9.1 固定等待 ≠ 渲染完成；而「等稳定」也**不等于**等到了终态

首次采 Inbox 时用「导航后 await 3.2s」采样，得到 `bodyTextLength = 2013`、
详情栏**只有 2 条文本**，据此会写出「详情栏是空的」。**几秒后的截图里详情栏是满的。**
同样的 URL、同样的视口，只差采样时机，结论相反。

第一版修法是「等稳定」：轮询 `document.body.innerText.length`，连续 4 次（间隔 400ms）
不变才采（`/tmp/refsweep/settle.js`）。**这个修法在 Agent 页失效了**（§8.5 第 7 条）：
页面在 219 处停了约 4 秒，settle 判定稳定并退出，而终态 435 要 11–20 秒才到。

**两层判别动作，都要做：**

1. 等稳定**不能只数采样次数** —— 稳定窗口按**墙钟时间**给足（建议连续 3 秒不变，且总等待不早于
   导航后 20 秒），否则「长完又长」的页面一定被截断。
2. **采完必须回看截图**，且对任何「不存在」结论**在更晚的独立时间点再采一次**。
   两次都对上才算数 —— 本轮正是靠这个把 Agent 的 435 捞回来的。

### 9.1b 稳定判据本身会被瞬态骗到

同一次回审里，`settle` 有一次锁在 `bodyTextLength = 435`，而 20 秒后的截图对应的
`innerText` 也是 435 —— 但另一轮 9 秒等待读到的是 219。**两个「稳定」读数并存**，
说明单点采样连「哪个是终态」都答不了。判据只能是**多时间点 + 截图**，不是任何单一的自动阈值。

### 9.2 渲染进程卡死时 `cdp-inspect.cjs` 会永久挂起（**已在 `fce370bad` 修掉**）

> 采集当时的行为：`TIMEOUT` 只作用于抓 `/json/list` 那一跳，`Runtime.evaluate`
> **没有逐调用超时**。本轮遇到一个主线程被卡死的标签（连 `return 1+1` 25 秒不返回、
> `Runtime.enable` 也超时），`cdp-inspect` 就无限等下去，被 Bash 工具的 120s 超时兜住，
> 现象与「正在跑」**同形**。
>
> **现在**：每次调用有 deadline，超时退出码 `124`，并打印
> `Runtime.evaluate got no response in 30000ms — the page's main thread is likely wedged`。
> 本轮回审时亲眼见过这条诊断（§8.5 期间卡死两次），**确实可判**。

**判别动作（仍然要做）**：判 **`124` 要直接读工具的退出码**。
`cmd | tail` 之后再读 `$?` 是 `tail` 的退出码，会看漏。

本轮另建了一个驱动 `/tmp/refsweep/drive.cjs`（逐调用超时 + `Page.navigate`），
因为 `cdp-inspect` 没有 `Page.navigate`。**注意它有和旧版 `cdp-inspect` 一样的
`?? null` 打印问题 —— 用它时「读到 `null`」仍不可信，优先用修好的 `cdp-inspect`。**

**恢复手法**：卡死的标签只能关掉重开 —— `Page.navigate` 走浏览器进程，对已卡死的渲染进程
无效。本轮做法：`/json/close/<id>` 关掉死标签，`/json/new` 开新标签。
关标签前先确认 `:9333` 是本会话独占（本轮确认过），且**不要碰 `:9222`**。

### 9.3 副产品：探针的盲区

`innerText` 类探针**看不见 placeholder**。Agent 页的主文案 `Ask Linear...` 就是这么漏掉的
（0 条文本被误读成「页面没内容」）。本页靠 `aria-label` 才补齐。
**后续采集 placeholder /aria-label/title 属性要单独采一遍。**

### 9.4 两个并发标签会让读数互相矛盾（本轮实际发生）

`cdp-inspect.cjs` 选标签用的是 `targets.find(t => t.type === 'page' && …)` ——
**取第一个 page 目标**。一旦浏览器里有第二个 page 标签，**连续的两次调用可能连到不同的标签**，
而两次都会回答得很正常。

本轮回审 Agent 时出现的 `219` / `435` 反复横跳，最后查明其中一个成因就是当时
**同时存在两个 page 标签**（关标签时打印出 `/agent` 与 `/inbox/priority` 两个）。

**判别动作**：每轮采集**前后都数一遍标签**：

```bash
curl -s http://127.0.0.1:9333/json/list | python3 -c "import sys,json;d=json.load(sys.stdin);print(len([t for t in d if t.get('type')=='page']))"
```

必须恰好是 1。多出来的标签要关掉再采。

**注**：六页主采集**不受此影响** —— 当时确认过只有一个标签，且六页 `href` 逐页核对无误
（§8.5 的六次重跑也逐页核对了 `href`）。

### 9.5 `--viewport` 的 override 会**留在窗口上**，污染后续「无 override」的读数

回审中实测到：窗口真实宽度是 `1200`，执行一次 `--viewport 1440x900` 之后，
**再不带 `--viewport` 调用时 `innerWidth` 仍是 `1440`**。

也就是说「我没传 `--viewport`，所以读到的是真实窗口尺寸」这个假设**不成立**。

**判别动作**：同一个测量序列里**始终显式传同一个 `--viewport`**，
并顺带回读 `innerWidth / innerHeight / devicePixelRatio` 存进证据里 ——
本文件所有几何的前提就是这三项都等于 `1440 / 900 / 2`。

---

## 10. 产物清单（本地保留，**未发布**）

| 文件                                                              | 内容                                                     |
| ----------------------------------------------------------------- | -------------------------------------------------------- |
| `/tmp/refsweep/{inbox,myissues,reviews,agent,projects,views}.png` | 1440×900 截图                                            |
| `/tmp/refsweep/{...}.json` + `.json.outline.txt`                  | 渲染后 DOM 全量（含 computed style / 几何）              |
| `/tmp/refsweep/{...}.probe.json`                                  | 本文件所有测量值的原始 JSON                              |
| `/tmp/refsweep/probe.js` / `probe-settle.js`                      | 通用探针（可复用到候选端）                               |
| `/tmp/refsweep/settle.js`                                         | 「等稳定」实现（**注意 §9.1：它不够**）                  |
| `/tmp/refsweep/drive.cjs`                                         | 带逐调用超时与 `Page.navigate` 的 CDP 驱动               |
| `/tmp/refsweep/absence-audit.js` / `audit-settle.js`              | **§8.5 的计数法审计探针（含正对照）**                    |
| `/tmp/refsweep/{slug}.audit.json`                                 | 六页审计原始计数（`controlOk` 全 `true`）                |
| `/tmp/refsweep/agent-late.png`                                    | **Agent 终态截图（含示例卡）** —— 取代早期的 `agent.png` |
| `/tmp/refsweep/agent.ex.json`                                     | Agent 终态几何原始值                                     |
| `/tmp/refsweep/views.{issues,projects}.json`                      | Views 两分段的计数复核                                   |
| `/tmp/refsweep/reviews.recheck.json`                              | Reviews 右栏两时间点复核                                 |

> `agent.png` 是**状态 A**（composer 单卡），与文档 §4 已修正的结论不符，
> 已被 `agent-late.png`（状态 B）取代。**不要再用 `agent.png` 当参考。**

`/tmp` 会被系统清理。需要长期留存的截图 / 快照**要另存**；本文件自足，不依赖这些文件也能读。
