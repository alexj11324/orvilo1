# RailPropertiesCard Specification

## Overview

- **Target file**：`src/features/Projects/Workspace/ProjectPropertiesCard.tsx`
- **证据条件**：2026-09-22，1440×900，light，`en-US`；参考 `:9333`，候选 `:9222`
- **用户当场提出的问题**：

  > Linear 里面的 Milestone 根本没有在 Property 里面，为什么你右边的那个侧边栏上面的
  > Property 里面有那个 Milestone 呢？这个也不对吧？…… 按道理来说不应该存在吧？
  > 你能够查出根因并修复吗？防止以后再次出现这种情况。

## 参考端右栏 `Properties` 卡的**行集合**（observed，`reference-inventory.md` §3.1）

**恰好 8 行，没有 Milestones：**

| #   | label       | value 形态                                          |
| --- | ----------- | --------------------------------------------------- |
| 1   | `Status`    | 状态按钮（icon + 文本）                             |
| 2   | `Priority`  | 优先级按钮                                          |
| 3   | `Lead`      | 负责人按钮（空态 "Add lead"）                       |
| 4   | `Members`   | 成员按钮（空态 "Add members"）                      |
| 5   | `Dates`     | **一行内两个** `role=button`（起始日期 + 目标日期） |
| 6   | `Teams`     | 团队按钮                                            |
| 7   | **`Slack`** | "Slack channel" 按钮                                |
| 8   | `Labels`    | "Add label" 按钮                                    |

几何：label 列真固定宽 `width: 90px; flex: 0 0 auto`，value 列 x=1138，
**左对齐、宽度自适应**（不右对齐到卡缘）。行 pitch 36。

> 注意：参考端**就是一行 `Dates`**，不是拆成 Start date / Target date 两行。
> 我先前在 `PAGE_TOPOLOGY.md` 里写的「参考端拆成两行」是**错的**，已在本 spec 更正；
> 候选端用一行 `Dates` 这件事与参考端**一致**，不要改。

## 候选端行集合（observed，`candidate-inventory.md` §3.1）

`Status` / `Priority` / `Lead` / `Members` / `Dates` / `Teams` / `Labels` / **`Milestones`**

### left-join 差值

| 方向           | 项                                                       | 处置                                                                                                     |
| -------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 候选端**多出** | `Milestones` 行（4 个里程碑名做成圆角 chip，全部不可点） | **删除**。Linear 的里程碑在它自己的 `Milestones` 卡里，不在 Properties 卡里                              |
| 候选端**缺失** | `Slack` 行                                               | **本轮不动**。是否需要 Slack 集成是**产品域问题**，不是样式问题；且本仓库未必有 Slack 概念（见 unknown） |
| 两侧都有       | `Dates` 一行                                             | 一致，不动（**纠正**：我先前误判为差异）                                                                 |

## 根因：这个行是怎么来的，以及为什么没被拦住

### 直接根因：一个 commit 里把 left-join 规则**单向**执行了

`git log -L` 定位到引入者：

```
6dec8cb09 💄 fix(project): Overview left-join parity — Linear row set in Properties,
           editable Description, Milestones/Progress rail cards, linear-tokens CI gate
```

该 commit 的 diff 显示，它在同一次改动里：

- **删除**了 `properties.visibility` 与 `properties.created` 两行 —— 这两行 Linear 确实没有 ✅
- **新增**了 `Milestones` 行 —— 这一行 Linear **也没有** ❌

也就是说：**同一条 left-join 规则，在「删」的方向被执行了，在「加」的方向被违反了，而且发生在同一个 commit 里。**
可推断当时的思维模型是「项目的属性栏应该放哪些元数据」（一个**功能完备性**视角），
而不是「Linear 的这一栏**实际**有哪几行」（一个**集合成员**视角）。
前者会自然地把里程碑也放进去，因为「里程碑是项目属性」听起来很合理 —— 但这跟参考端有没有这一行无关。

### 系统性根因：同 commit 引入的 CI gate 在结构上抓不到这类缺陷

同一个 commit 还引入了 `.github/scripts/require-linear-tokens.mjs` + workflow。读它的实现：

```js
const RULES = [
  { name: 'fontSize', pattern: /fontSize(?:=|:)\s*...(\d{2,3})/g, max: 22 },
  { name: 'iconSize', pattern: /\bsize=\{(\d{2,3})\}/g, max: 28 },
];
```

它只检查**新增字面量是否超过尺寸上限**。也就是说它是一个**上界**检查，且**只覆盖尺寸**：

- 没有下界
- 不检查颜色
- 不检查图标身份
- **完全不检查「这个元素该不该存在」**

「Properties 卡里多了一行 Linear 没有的 Milestones」在这套规则下**必然通过** ——
那行代码里没有任何超限的 `fontSize` 或 `size`。

**所以仓库有一道 `linear-tokens` gate，它给人的感觉是「parity 已被强制」，
但它在结构上无法表达 parity 里最要紧的那一类违规：集合成员违规。**

### 这与我自己犯的错是同一个元错误

我先前用**整页样式直方图**当 parity 证据（见 `tasks/lessons.md`），
和这道 gate 用**尺寸上界**当 parity 证据，是同一个错误：
**为一个它无法回答的问题产出了一个绿色的信号。**

## 要做的改动

1. 删除 `ProjectPropertiesCard.tsx:228-241` 的 `Milestones` 行（`{detail.milestones && ...}` 整块）。
2. 删除后确认 `properties.milestones` 这个 i18n 键是否还有调用点 ——
   实测它**已经零调用点**（卡片用的是 `overview.milestones`），属既有死键。
   **本轮不删 i18n 键**（删键要三处同步，且与本任务无关），只记录。
3. **不要**顺手加 `Slack` 行、**不要**改 `Dates` 行。

## 防复发（本 spec 要求的第二件交付物）

`require-linear-tokens` 的规则**不支持**这类检查，而它的注释说自己是
"Linear token gate"，容易被读成「parity 已强制」。要求：

1. **加一个行集合回归测试**（单元测试，不是 CI 脚本）：
   断言 `ProjectPropertiesCard` 渲染出的 label 键集合**恰好等于**一个显式期望集合。
   这样将来任何人往里加一行，测试立刻红，必须**显式**更新期望集合并说明理由。
   —— 关键点是它断言**集合成员**，而不是尺寸。
2. **在 `require-linear-tokens.mjs` 的头部注释里写明它的边界**：
   它只检查尺寸上界，不检查集合成员、颜色、图标身份；
   不要把它当作 parity 的完备保证。**不改它的规则**（改规则超出本轮范围，
   且会影响其它 surface），只补边界说明。

## 边界

- 不动 `PROJECT_STATUS_META` 的 `writable` 语义（它决定状态可否编辑 —— 是**行为**，不是样式）。
- 不动 `ProjectPropertiesCard.tsx` 里 Dependencies 的既有逻辑。
- 不引入第二套组件树、不改根 layout、不新增全局 CSS。

## i18n

不需要新键。

## 验收（Acceptance）

1. **新的行集合回归测试**，且**在删除前失败**（删之前多一行，集合不等）。
2. **CDP 实测**（`:9222`，1440×900）：右栏 Properties 卡渲染出的 label 集合为
   `Status/Priority/Lead/Members/Dates/Teams/Labels`，**不含 `Milestones`**；
   且该卡下方**仍有**独立的 `Milestones` 卡（不能连带删掉）。
3. `bun run check <改动文件> --lint --test` 通过。

## Unknown（不得推断）

- 参考端 `Slack` 行在**未连接 Slack** 时是否仍渲染（本 workspace 已连接，空态未观测）
- 本仓库是否存在 Slack 集成概念；若无，`Slack` 行属**产品域缺口**而非样式缺口
- 参考端 `Dates` 行在只填了一个日期时的形态
