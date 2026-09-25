# PropertiesInlineRow Specification

## Overview

- **Target file**：`src/features/Projects/Workspace/index.tsx`（`Properties` 内联行，约 116-135 行）
- **截图**：`docs/design-references/linear/project-overview/{reference,candidate}-overview-1440.png`（本地，不入库）
- **Interaction model**：**click-driven**（各属性 chip 各自可点，与本文要修的布局无关）
- **证据条件**：2026-09-22，1440×900，light，`en-US`；参考 `:9333`，候选 `:9222`

## 用户当场提出的问题

> 还有对齐问题，比如 Property 那个东西，应该跟第一行在一块吧？
> 你那个东西根本没有跟右边对齐，我不知道这是怎么回事。

## 参考端（observed）

容器是 **grid 两列**：

```
display:            grid
grid-template-columns: 65.4766px 587.523px     ← 标签列 65.5px + 值列 587.5px
容器 box:           x=304 y=310 w=669 h=96
容器内不同 y 值数:   5
```

标签与全部属性落在**同一条视觉行**上（`Properties` y=310，chip 行 y=316，
6px 差是基线 / 行高造成，不是换行）：

| 元素                                                     | x   |
| -------------------------------------------------------- | --- |
| `Properties`（标签，`13px/500`，`lch(39.176 1.25 282)`） | 304 |
| `In Progress`（`13px/500`，`lch(19.588 1.25 282)`）      | 415 |
| `High`                                                   | 525 |
| `Lead`                                                   | 594 |
| `Sep 21st`                                               | 665 |
| `Target date`                                            | 769 |

行末有 `⋯` —— **未点**，其内容属 unknown（可能是属性溢出菜单）。

## 候选端现状（observed）

```tsx
// src/features/Projects/Workspace/index.tsx（约 116-135 行）
<Flexbox horizontal align={'center'} gap={16}>
  <Text fontSize={13} style={{ minWidth: 72 }} type={'secondary'} weight={500}>
    {t('overview.propertiesLabel', { defaultValue: 'Properties' })}
  </Text>
  <Flexbox horizontal align={'center'} gap={8} style={{ minWidth: 0, flex: 1 }} wrap={'wrap'}>
    …chips…
  </Flexbox>
</Flexbox>
```

实测：

| 项                | 参考端                        | 候选端                                |
| ----------------- | ----------------------------- | ------------------------------------- |
| 容器 `display`    | `grid`，`65.4766px 587.523px` | `flex`，`grid-template-columns: none` |
| 容器高度          | **96px**                      | **434px**（4.5×）                     |
| 容器内不同 y 值数 | 5                             | 8                                     |

**根因**：内层 Flexbox 带 `wrap={'wrap'}`。682px 减去 72px 标签列与 16px gap 后余 594px，
装不下候选端的 7 个 chip，于是折行；折到第二行的 chip 从 x≈563 起排，
**对不齐第一行的 chip 列** —— 这就是用户说的「没有跟右边对齐」。

## 要做的改动

1. 把这一行改成**固定标签列 + 单行值列**的布局，对齐参考端的 grid 形态：
   - 标签列宽度固定（参考端实测 ≈65.5px；候选端当前 `minWidth: 72`，
     取哪个值以「让两端在同一视口下 `Properties` 与首个 chip 的 x 差可比」为准，
     并在注释里写明依据）
   - 值列**不换行**
2. 颜色改走语义 token：候选端表头当前是裸灰 `rgb(153,153,153)`、占位文案 `rgb(187,187,187)`；
   参考端走 token（`lch(39.176 1.25 282)` / `lch(19.588 1.25 282)`）。
   按仓库习惯用 `cssVar` / 语义色名，**不要硬编码 lch**。
3. 各属性的**功能不动** —— 状态、成员、优先级、负责人、日期、可见性这些入口必须仍然可用。

### 溢出行为（**未解决，须显式处理**）

参考端行末有 `⋯`，候选端没有。当属性多到一行放不下时，参考端的行为**未观测**。
因此：

- **不要**自行发明一个 `⋯` 菜单去对齐（那是抄了外观、没有行为）。
- 实现时按「单行 + 不换行」做；若内容溢出，用**已测得的手段**（截断 / 滚动）先保证不折行，
  并在代码注释里写明「溢出行为待参考端证据」。
- 把这一条留在 spec 的 unknown 里，不要声称已对齐。

## 边界

- 只改这一行的**布局与颜色**。不改各属性控件自身的逻辑（`ProjectMembersField`、
  `ProjectLabelsField`、`ProjectPlanningFields` 等都不动）。
- 不动 `ProjectPropertiesCard.tsx` 里 Dependencies 的既有逻辑。
- 不引入新组件树、不改根 layout、不新增全局 CSS。

## i18n

**不需要新键**（标签文案 `overview.propertiesLabel` 已存在）。

## 必须保住的既有测试

`src/features/Projects/Workspace/ProjectDashboard.test.tsx`
的 `project properties planning metadata`（:552）与 `project overview inline fields`（:458）
涉及这些字段，改动后必须仍通过。

## 验收（Acceptance）

1. **CDP 几何实测**（`:9222`，1440×900）：属性容器内不同 y 值数从 **8 降到 ≤ 2**（标签行 + chip 行），
   容器高度从 **434px 降到参考端量级**（约 96px，允许因 chip 数量不同而浮动）。
   两个 chip 的 x 差与参考端受测面的可比性要一并贴出。
2. 回归测试：断言属性 chip 不与标签分处两行（可断言容器 `flex-wrap` 不是 `wrap`，
   或断言所有 chip 的 `offsetTop` 相同 —— 后者更贴近用户看到的现象）。
   **该测试要在改动前失败。**
3. `bun run check <改动文件> --lint --test` 通过。

**不构成验收**：只贴代码 diff、只贴静态截图。

## Unknown（不得推断）

- 参考端 `⋯` 溢出菜单的展开内容与触发条件
- 属性极多（超出值列宽度）时参考端的确切行为
- hover /focus/ 窄窗口（768 / 390）下的折行行为
