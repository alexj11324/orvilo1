# PAGE\_TOPOLOGY — Linear Project Overview vs Orvilo

采于 `2026-09-22`，两端均 **1440×900**，light theme，`en-US`。
参考 `:9333`／候选 `:9222`。截图本地保留在 `docs/design-references/linear/project-overview/`
（不入库，理由见 `PLAN.md`）。

约定：**observed** = 屏幕上量到过；**inferred** = 从 observed 推的，未直接验证；
**unknown** = 没测，不得当成不存在。契约要求空态 / 单条 / 多条是不同状态，本文标注了基数。

## 数据基数（两端不同，任何数字差异先归 data-delta）

|            | 参考                 | 候选                                   |
| ---------- | -------------------- | -------------------------------------- |
| 项目       | 1 个真实项目（私有） | 1 个合成 fixture `Parity Test Project` |
| 里程碑     | 4                    | 4（名称不同，合成）                    |
| issue/task | 16，**全部 Done**    | 16，**全部未完成**                     |
| 项目成员   | 有真实成员           | 只有当前用户                           |

## 版面骨架（observed，两端同构）

```
┌────────────┬────────────────────────────────────────────┬──────────────┐
│ 左栏        │ 主列（可滚动，内嵌滚动容器）                  │ 右栏（可滚动） │
│ 工作区导航   │  头部（图标 / 标题 / 右侧图标组）             │  属性卡        │
│            │  tab 栏（Overview | Activity | Issues | …）   │  里程碑卡      │
│            │  ────────────────────────────────────      │  进度卡        │
│            │  项目图标 → H1 → 摘要                        │              │
│            │  属性内联行                                  │              │
│            │  资源行                                     │              │
│            │  update composer                            │              │
│            │  Description 折叠区                         │              │
│            │  里程碑区（首屏之下）                        │              │
└────────────┴────────────────────────────────────────────┴──────────────┘
              底部状态条（DevDock：Agent Mock / Feature Flags / … / 性能读数）
```

**交互模型**：主体是 **click-driven**（tab 切换、折叠展开、行内编辑）；
不是 scroll-driven。`Description ⌄` 是折叠开关（默认展开，observed）。
里程碑区在参考端首屏之下（y≈2044），需要**滚动内嵌容器**才能看到 ——
`captureBeyondViewport` 无效，因为 document 本身不比视口高。

## 参考端（observed）

### 主列

| 区块            | 构成                                                                                                         | 备注                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 头部            | 项目图标 + 标题 + ☆ + ⋯；右侧 `🔗` `⚙` 与面板开关                                                            | **无状态 chip**                        |
| tab 栏          | `Overview`(active pill) `Activity` `Issues` + 一个 layered 图标                                              |                                        |
| 项目图标        | 大号立方体图标 ≈64px                                                                                         |                                        |
| H1              | 项目名                                                                                                       |                                        |
| 摘要            | 一段中文描述                                                                                                 |                                        |
| **属性内联行**  | `Properties` 标签 + 一组 chip：`In Progress` / `High` / `Lead` / `Sep 21st` / `Target date` / `orvilo` / `⋯` | **全部落在同一条 y=316 上**；容器 h=96 |
| 资源行          | `Resources` 标签 + 2 个资源项 + `+`                                                                          | 非空态                                 |
| update composer | 虚线框 `Write first project update`                                                                          |                                        |
| Description     | `Description ⌄` + 富文本（目标 / 与现有 ACP Project 的关系 / 前置项目 …）                                    |                                        |
| 里程碑区        | 名称 + `N issues · 100%`（是 `<a>`），共 4 行                                                                | y≈2044，首屏之下                       |

### 右栏

| 卡             | 构成                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Properties** | 头部 `Properties ⌄` + `+`；行：Status / Priority / Lead / Members / Start date / Target date / Teams / Slack / Labels |
| **Milestones** | 头部 `Milestones ⌄` + `+`；4 行，每行 `💎 名称 … 100% of N ⋯`；**底部还有一行 `✦ No milestone`**                      |
| **Progress**   | 头部 `Progress ⌄`；`Scope 16` / `Started 0` / `Completed 16` + 折线图                                                 |

**右栏里程碑行的完整构成**（observed，这是被漏掉最多的一处）：
紫色实心菱形图标 + 里程碑名 + 进度读数 + **`⋯` 更多菜单**。
进度的**可见**形态在右栏是 `100% of N`；`N issues · 100%` 是**主列**那条的形态（是 `<a>`）。
两者不是同一个控件画两遍 —— **是两处不同的渲染**。

## 候选端（observed）

### 与参考同构的部分

左栏 / 头部 /tab 栏 / 项目图标 / H1 /update composer / Description / 右栏三卡
的**骨架一致**。

### 已确认的差异

| #   | 位置         | 差异                                                                                                                      | 审计节                     |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1   | 头部         | 多一个 **`In Progress` 状态 chip** + 一个锁图标；参考端头部没有状态 chip                                                  | 多出元素（left-join 违规） |
| 2   | 主列属性行   | **换行成两行**（`Properties [In Progress][Add members] High [Add lead] Sep 1, 2026` / `Dec 31, 2026 Public`）；参考端一行 | §4.9                       |
| 3   | 主列里程碑行 | `◇ 名称 … 日期`（日期右对齐）；**图标是黑色描边菱形、无进度、无链接、不可点**                                             | §4.7 §4.8                  |
| 4   | 右栏里程碑卡 | 同 3：`◇ 名称 … 日期`，**无进度读数、无 `⋯` 菜单、无 `No milestone` 行**                                                  | §4.7 §4.8                  |
| 5   | 右栏属性卡   | 多一列 **`Milestones` 标签 chips**（4 个里程碑名当 tag 渲染）；参考端该卡无此项                                           | 多出元素                   |
| 6   | 资源行       | 带文案按钮 `Add document or link…`；参考端是 `+` 图标                                                                     | §4.4（**待空态证据**）     |
| 7   | 右栏属性卡   | `Dates` 行把起止日期挤成两行 + 箭头；参考端拆成 `Start date` / `Target date` 两行                                         | 待单独确认                 |

### 候选端多出的元素（left-join 要求「Linear 没有的不允许出现」）

- 头部右上角的 **`In Progress` chip 与锁图标**
- 右栏属性卡内的 **`Milestones` chips**
- 底部 **DevDock**（Agent Mock / Feature Flags / Render Gallery / Tab Routers / FPS 等）

> DevDock 是**开发工具**，不是产品 UI。它在参考端不存在属于预期，**不应**被当作 parity 缺陷，
> 但整页 diff 必须把它过滤掉（`parity-diff.cjs` 已有对应噪音规则）。

## unknown（未验证，不得推断）

- 参考端**空资源态**的入口形态（§4.4 的前置；未取得 → 该项不得动手）
- 参考端 **0 里程碑**时的右栏形态（是否还渲染 `No milestone` 行）
- 参考端**单条**里程碑 /issue 时的布局
- 里程碑 `⋯` 菜单展开后的内容（未点，属未知动作）
- 里程碑点击后的落地页（主列 `N issues · 100%` 指向 `issues?projectMilestoneId=<uuid>`，
  是 observed 的 href；但**落地页本身未打开验证**）
- 窄窗口（768 / 390）下两端各自的换行行为
- hover /focus/loading /error 态
