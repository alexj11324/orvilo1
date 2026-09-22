# MilestoneRow Specification

## Overview

- **Target files**（候选端有两套独立实现，必须一起改）：
  - 主列：`src/features/Projects/Workspace/ProjectDashboard.tsx:62-76`
  - 右栏：`src/features/Projects/Layout/ProjectSidePanel.tsx:120-140`（行在 127-138）
- **截图**：`docs/design-references/linear/project-overview/{reference,candidate}-overview-1440.png`（本地，不入库）
- **Interaction model**：**click-driven**（参考端每行有 2 个不同去向的 `<a>`）
- **证据条件**：2026-09-22，1440×900，light，`en-US`；参考 `:9333`，候选 `:9222`。
  两端数据基数不同（参考 4 里程碑 / 16 issue 全 Done；候选 4 里程碑 / 16 task 全未完成），
  任何**数字**差异先归 data-delta。

## 用户当场提出的问题

> Milestone 那里，在 Linear 的网站上是可以点开的，点开之后会进入另一个界面。
> 你这个是打不开的，你发现没有？根本点不动。…… 还有点击之后的行为，这些东西都应该对齐。
> 还有颜色问题：Linear 上的 Milestone 是什么颜色？你这里的 Milestone 是什么颜色？

## 参考端 DOM 结构（observed）

> **本节已按 `reference-inventory.md` §2.6 / §3.2 的细测重写。**
> 我最初那份粗测把主列里程碑当成「一行三件套」，**实测是一张卡**；
> 名称字号、右栏行的控件集也都不对。以下为细测值。

### 主列：`SECTION#milestone-list`，是**卡片**不是行

669×659，`y=2007`（首屏之外，内嵌滚动容器 `scrollTop≈1866` 才可见），`gap:4px`。
4 张卡，每张 **669×129**（名称换行的卡 3 是 **200**），卡下还有 `BUTTON "Milestone"` 95×28
（`radius 9999px`，弱化色 `lch(64.64 1.25 282)`，svg `fill="currentColor"`）。

单张卡（669×129，`border-radius 8px`）：

```
├ 头行 669×31  display:flex; align-items:center
│   ├ A[href="…/overview#milestone-<id>"]  22×16      ← 可点目标 1（icon anchor）
│   │   cursor: default；无 title / aria
│   │   └ svg 16×16  属性 fill="none"
│   │       └ path 10×12
│   │           属性 fill   lch(42.969% 59.31 288.43)
│   │           computed fill lch(42.969 59.31 288.43), stroke lch(48 59.31 288.43)
│   ├ 名称  ProseMirror 可编辑  210×23
│   │       15px / 450, color lch(19.588 1.25 282), cursor: text
│   ├ DIV[role=button][aria="Collapse"]  16×16        ← 折叠正文
│   ├ A[href="…/issues?projectMilestoneId=<id>"]  115×28  radius 9999px
│   │       文本 "N issues · 100%"  13px / 450, color lch(39.176 1.25 282)
│   │       **静止可见**；hover 时 bg → lch(92.44 0.5 282)   ← 可点目标 2
│   ├ ★ hover-only「Set target date」 DIV[role=button][aria="Choose date"] 103×28
│   └ ★ hover-only ⋯  BUTTON[aria="Open menu"] 28×28
└ 正文 669×92   ProseMirror 可编辑, cursor: text
```

**三个 hover-only 控件的隐藏写在祖先上**（祖先 `opacity: 0`，它们**自身** `opacity: 1`）：
拖拽手柄（`position:absolute` 20×129 竖条，`cursor: move`）、`Set target date`、`⋯`。
**只查元素自身 style 会把它们全判成可见可点。**

### 右栏：每行 380×42，pitch 43

```
DIV[role="button"]  380×42  tabindex="-1"  无 aria-label  cursor: default
 └ DIV[role="button"]  380×42  bg lch(100 0 282); border-radius 8px   ← 两层 role=button
     ├ svg 16×16  属性 fill="none"
     ├ SPAN(名称)  12px / 450, color lch(20 1 282)
     ├ 进度组（右对齐在 1327）：SPAN "100% of" 12px/450 lch(40 1 282)
     │                          + BUTTON 8×24 内含 "N" ← **N 是个 BUTTON**
     └ ★ BUTTON[aria-label="Milestone actions"]  24×24  radius 9999px
              x=1382（行右缘内缩 12px），**静止即可见**（与主列的 hover-only ⋯ 不同）
```

第 5 行是**空态占位行**：`380×42`，svg 属性 `fill lch(66% 1 282 / 1)` +
`SPAN "No milestone"` 12px/450 `lch(40 1 282)`，**没有 ⋯**。

右栏还有两个 hover-only：`BUTTON "See issues"`（静止 `display:none` → hover `display:flex`
1278,468 104×24）与拖拽手柄（`opacity 0 → 1`）。
**`See issues` 是 `BUTTON` 不是 `<a>`**，而主列里语义相同的那条是 `<a href>`。

> 主列与右栏**不是同一套组件**：高度 129/200 vs 42；文案 `N issues · 100%` vs `100% of N`；
> 名称 15px/450 可编辑 vs 12px/450 只读。同一份数据在本页**同时存在两种文案变体**。

## 参考端实测值（`getComputedStyle` 原值）

| 元素               | 值                                                                                |
| ------------------ | --------------------------------------------------------------------------------- |
| 图标尺寸           | `16×16`（主列与右栏同）                                                           |
| 图标 path `fill`   | `lch(42.969% 59.31 288.43)`（紫）                                                 |
| 图标 path `stroke` | `lch(48% 59.31 288.43)`（紫）                                                     |
| 图标外层（主列）   | `<a href="…/overview#milestone-<id>">`                                            |
| 名称（主列）       | ProseMirror 可编辑，`15px/450`，`lch(19.588 1.25 282)`                            |
| 名称（右栏）       | SPAN，`12px/450`，`lch(20 1 282)`                                                 |
| 主列进度外层       | `<a href="…/issues?projectMilestoneId=<id>">`，`13px/450`，`lch(39.176 1.25 282)` |
| 右栏进度           | `100% of N`，`12px/450`，`lch(40 1 282)`                                          |
| 卡片圆角           | `8px`                                                                             |

### ⚠️ `cursor` **不是**可点性信号（重要，纠正我最初的判据）

`reference-inventory.md` §4.1 实测：全页可点元素**几乎全是 `cursor: default`** ——
包括 `<a>` tab、`<button>`、`role=button` 的行；只有外部链接是 `pointer`。
反向的例子：内联 Properties 行第 6 个 `⋯` 是**无 role / 无 tabindex 的纯 `DIV`**，
但 `getEventListeners` 返回 `{click: 1}`。

**所以：判「能不能点」必须看 `role` / `tabindex` / `href` / 事件监听器 / 实测点击效果，
不能看 `cursor`。** 我先前 spec 里把「候选端 `cursor: auto` vs 参考端 `default`」列为差异，
那条**不作为证据** —— 真正的证据是参考端有 `<a href>` 而候选端是 0 个。

## 候选端现状（observed）

| 项                  | 主列 `ProjectDashboard.tsx:68`          | 右栏 `ProjectSidePanel.tsx:128`                                     |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------- |
| 图标                | `<Icon icon={DiamondIcon} size={14} />` | `<Icon color={cssVar.colorPrimary} icon={DiamondIcon} size={12} />` |
| 实测尺寸            | `14×14`                                 | 未单独测（源码为 12）                                               |
| 实测 `fill`         | `transparent`                           | 未单独测                                                            |
| 实测 `stroke`       | `rgb(8, 8, 8)`（继承正文色）            | 未单独测                                                            |
| 行内 `<a>`          | **0**                                   | **0**                                                               |
| 行内 `<button>`     | **0**                                   | **0**                                                               |
| `role` / `tabindex` | `null` / `null`                         | `null` / `null`                                                     |
| 行 `cursor`         | `auto`                                  | `auto`                                                              |
| 名称                | `13px/500`                              | 源码未传 weight                                                     |
| 右侧                | 日期 `12px` secondary                   | 日期                                                                |

**结论**：两个里程碑表面都是**纯展示的壳子** —— 有图标有文字，但既不可点、颜色也不对。

## 要做的改动

### 1. 主列图标成为锚点（行为层）

把 `<Icon icon={DiamondIcon} size={14} />` 包进指向该里程碑锚点的链接：

```tsx
<a href={`#milestone-${milestone.id}`} …>
  <Icon icon={DiamondIcon} size={16} />
</a>
```

并给主列每个里程碑行加落点 `id={`milestone-${milestone.id}`}`，
这样右栏（或别处）指向 `#milestone-<id>` 时能滚到这里。

> **待确认（unknown）**：`#milestone-<uuid>` 在参考端的实际效果（滚动？展开？高亮？）
> **未直接验证**。采集者若已点到，以它的观测为准；没有的话按「页内锚点」实现并在测试里断言 href 正确，
> **不要**声称已经复现了参考端的落地效果。

### 2. 图标规格对齐（颜色层）

- 尺寸 `14 → 16`（右栏 `12 → 16`）。**两端实测都是 `16×16`** ——
  参考端右栏 §3.2 实测 `svg 16×16 @1048,491`，主列 §2.6 实测 `svg 16×16`。
  所以「右栏也取 16」是**有证据的**，不是照主列推出来的。
- 颜色：参考端 path **同时**有 `fill lch(42.969% 59.31 288.43)` 与
  `stroke lch(48% 59.31 288.43)` —— 是一个**实心**紫菱形。
  候选端 lucide `diamond` 的 svg 是 `fill="none"`，**只改 `color` 只能得到描边菱形**，
  形状层仍有可眼见的差异。
- **按仓库既有习惯用语义色 token**，不要硬编码 `lch(...)`。找不到等价语义 token 时用 `cssVar`，
  并在注释里写明取了哪个值、为什么。
- 两处必须读**同一份共享规格**，否则又会长成两个样。

### 2b. ⚠️ 右栏的图标**不是**锚点（纠正本 spec 的初版）

实测（`reference-inventory.md` §3.2 / §5.2）：参考端右栏行里那个 `svg 16×16`
**没有被 `<a>` 包**。参考端右栏的行为是**整行可点**：

- 行 = **两层嵌套** `DIV[role="button"]`，`tabindex="-1"`，无 aria-label
- 点击整行（或 hover 出的 `BUTTON "See issues"`）→ 导航到项目的 **Issues 页**
- 那一行的两个独立控件是 `BUTTON[aria-label="Milestone actions"]`（24×24，静止可见）与
  hover 才出现的 `See issues`

只有**主列卡片的图标**才是 `<a href="…/overview#milestone-<id>">`。

**所以右栏不要包锚点。** 本 spec 初版 §1 只说了「主列图标成为锚点」、§2 说「右栏统一到同一套规格」，
被读成「右栏也包锚点」—— 那制造出一个死链：右栏是**跨 tab 的持久面板**，
在 Activity / Issues 上根本没有主列的落点。正确做法是「整行是按钮 + 跳 Issues」，
既有证据，也不会产生死链。

### 3. **不要**在本任务做进度读数

`N issues · 100%` / `100% of N` 依赖 milestone↔task 关联，而候选端
**全仓库不存在该关联**（审计 §4.3 已判定）。造进度 = 造假数据，违反 Global Constraints。
进度属于后续独立任务。

### 4. 右栏 `⋯` 菜单与 `No milestone` 行

参考端有，候选端没有。本任务**不实现**，因为：

- `⋯` 菜单展开后的内容**未观测**（未知动作，未点）
- `No milestone` 依赖同一个 milestone↔task 关联

这两项写进 spec 的 unknown，**不得**凭猜测补。

## 边界

- 不改 `formatProjectDate` 的既有行为（主列和右栏都在用它）。
- 不改 `ProjectPanelSection` 的折叠语义（既有测试 `project sidebar sections` 依赖它）。
- 不引入新组件树、不改根 layout、不新增全局 CSS。

## i18n

本任务**不需要新键** —— 里程碑名与日期都来自数据，锚点不需要文案。
若 builder 认为确实需要新键，**停下来报告**，由控制器统一追加（见 `PLAN.md`）。

## 必须保住的既有测试

`src/features/Projects/Workspace/ProjectDashboard.test.tsx`

- `project dashboard milestones`（:506）—— 主列渲染里程碑名 + 空态
- `project sidebar sections`（:317）—— 右栏分区折叠 + 进度计数

注意该文件 `:55` 把 `Icon` mock 成 `() => null`，所以**现有测试抓不到「图标不可点」**。

## 验收（Acceptance）

必须给出**行为层**证据，不接受只看代码：

1. **新回归测试**：断言主列里程碑行渲染出 `<a href="#milestone-<id>">`，
   且该测试**在改动前失败**（AGENTS.md 要求 bug fix 附能证明修复前失败的回归测试）。
2. **CDP 实测**（`:9222`，1440×900）：主列里程碑行的 `<a>` 数量从 `0` 变为 `≥1`；
   右栏同一位置同样。
3. **颜色实测**：主列图标的 computed `stroke` 不再是 `rgb(8, 8, 8)`，且两端尺寸一致为 `16×16`。
4. `bun run check <改动文件> --lint --test` 通过。

**不构成验收**：只贴代码 diff、只贴单张静态截图、只跑通测试。
**`cursor` 值不算行为层证据**（见上文「`cursor` 不是可点性信号」）。

## Unknown（不得推断为不存在）

- 参考端 `#milestone-<uuid>` 锚点点下去**实际发生了什么**（未观测）
- 三个菜单 —— 主列 `⋯[aria="Open menu"]`、右栏 `BUTTON[aria-label="Milestone actions"]`、
  `Set target date[aria="Choose date"]` —— 的**展开内容**（按只读边界未点）
- 拖拽手柄的排序行为
- 参考端**空态完全未观测**（该 workspace 4 里程碑 / 8 属性行，全非空）
- 点里程碑行跳到 Issues 页后**是否带里程碑过滤**（URL 无 query，过滤可能在客户端状态）
- 1 个里程碑 / 极多里程碑、名称超长时右栏列宽如何让步

## 已记录、**本轮有意不做**的缺口（不计入本任务未完成）

细测后才看清的参考端构成。不做的理由是**它们的交互内容未观测**，凭空补等于造假：

| 缺口                                                                             | 位置                   | 为什么不做                                                       |
| -------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| 主列里程碑的**卡片**结构（描述正文、`Collapse`、卡高随名称换行 129→200）         | `ProjectDashboard.tsx` | 结构性重写；且描述字段的编辑语义未验证                           |
| 主列卡下 `BUTTON "Milestone"`（95×28，弱化色 `lch(64.64 1.25 282)`）             | `ProjectDashboard.tsx` | 点击后的新建流程未观测                                           |
| 右栏 `BUTTON[aria-label="Milestone actions"]`（24×24，**静止可见**）             | `ProjectSidePanel.tsx` | 按 left-join 它**应该**有，但不能凭空造菜单                      |
| 右栏 hover-only `BUTTON "See issues"`（`display:none` → `flex`）                 | `ProjectSidePanel.tsx` | 同上；且它跳转**不带过滤**，与主列那条 `<a>` 语义不同            |
| 右栏第 5 行 `No milestone` 空态占位行                                            | `ProjectSidePanel.tsx` | 依赖 milestone↔task 关联（审计 §4.3）                            |
| 主列卡内 hover-only `Set target date`、`⋯`、拖拽手柄                             | `ProjectDashboard.tsx` | 内容未观测                                                       |
| 右栏整行 `role=button`（**两层** `tabindex="-1"`）→ 点击导航 `/<project>/issues` | `ProjectSidePanel.tsx` | **有证据、可实现** —— 已作为可选项发给 builder；本轮未做则下轮补 |
