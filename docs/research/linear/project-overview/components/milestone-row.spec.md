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

主列每一行的三件套：

```
<a href="…/overview#milestone-<uuid>">        ← 可点目标 1
  <svg 16×16>
    <path fill="lch(42.969% 59.31 288.43)"
          stroke="lch(48% 59.31 288.43)"
          stroke-width="2" stroke-linejoin="round"
          d="M7.3406 2.32C7.68741 1.89333 8.31259 1.89333 8.6594 2.32L12.7903 7.402…Z"/>
  </svg>
</a>
<div>
  <p>Gate A — Census &amp; Boundary</p>          ← 名称
  …
</div>
<a href="…/issues?projectMilestoneId=<uuid>">  ← 可点目标 2
  2 issues · 100%
</a>
```

右栏每一行：紫菱形图标 + 名称 + 进度读数 **`100% of N`** + `⋯` 更多菜单。
右栏列表**底部还有一行 `✦ No milestone`**（未分配里程碑的 issue 分组）。

> **两个进度形态不是同一个控件**：右栏可见形态是 `100% of N`；
> `N issues · 100%` 是主列那条（是 `<a>`）。写实现时不要合并成一个。

## 参考端实测值（`getComputedStyle`，非目测）

| 元素          | 值                                               |
| ------------- | ------------------------------------------------ |
| 图标尺寸      | `16×16`                                          |
| 图标 `fill`   | `lch(42.969% 59.31 288.43)`（紫）                |
| 图标 `stroke` | `lch(48% 59.31 288.43)`（紫）                    |
| 图标外层      | `<a href="…/overview#milestone-<uuid>">`         |
| 名称          | `<P>`，`15px/600`，`color: lch(19.588 1.25 282)` |
| 主列进度文字  | `13px/450`，`color: lch(39.176 1.25 282)`        |
| 主列进度外层  | `<a href="…/issues?projectMilestoneId=<uuid>">`  |
| 行 `cursor`   | `default`（**不是** `pointer`）                  |

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

- 尺寸 `14 → 16`
- 颜色：参考端是紫色实心 + 描边。候选端主列当前无颜色（继承正文黑）。
  **按仓库既有习惯用语义色 token**，不要硬编码 `lch(...)`：
  `ProjectPropertiesCard.tsx:84-91` 的 `PROJECT_STATUS_META` 用的是
  `'processing' | 'success' | 'warning'` 这类 antd 语义名。找不到等价语义 token 时，
  用 `cssVar` 并在注释里写明取了哪个值、为什么。
- 右栏图标（`color={cssVar.colorPrimary}`，size 12）与主列必须**同一套规格**，
  否则两处又会长得不一样。

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

## Unknown（不得推断为不存在）

- 参考端 `#milestone-<uuid>` 锚点的实际落地效果
- 参考端右栏 `⋯` 菜单展开后的内容
- 参考端 `No milestone` 行的可点性
- 0 里程碑 / 1 个里程碑时的形态
- hover /focus/ 窄窗口（768 / 390）下的行行为
