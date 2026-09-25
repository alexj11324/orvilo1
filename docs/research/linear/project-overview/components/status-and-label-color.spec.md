# StatusIcon & LabelColor Specification

## Overview

- **目标**：消灭「同一个语义在应用内长得不一样」，并把项目页的标签色 / 字重对齐参考端实测值。
- **证据条件**：2026-09-22，1440×900，light，`en-US`；参考 `:9333`，候选 `:9222`。
- **交互模型**：N/A（本 spec 只涉及颜色与图标，不涉及行为）。

## 用户当场提出的问题

> `description` 那行字，明明 Linear 里面那个地方用的是浅色，但你这里用的是黑色。
> 这些东西当时为什么没有查出来？
> 还有 `in progress` 之类的图标，按道理应该和 `task issues` 里看板对应的那些 icon 对齐，
> 为什么你这边重新画了一套呢？

## 一、状态图标：候选端自己画了两套（observed）

`src/components/ExecutionStatus.ts` **已经导出** `PROJECT_STATUS_VISUALS`
（项目**列表**在用，见 `src/features/Projects/List/index.tsx:31`），
但 `src/features/Projects/Workspace/ProjectPropertiesCard.tsx:80` 又自建了一份 `PROJECT_STATUS_META`
（项目**详情**在用）。逐状态对比：

| status    | 规范版 `PROJECT_STATUS_VISUALS`                         | 重复版 `PROJECT_STATUS_META`      | 是否一致         |
| --------- | ------------------------------------------------------- | --------------------------------- | ---------------- |
| active    | `VISUALS.running` = `CircleDot` + `colorWarning`        | `PlayCircleIcon` + `'processing'` | ✗ 图标与色都不同 |
| archived  | `VISUALS.archived` = `Archive` + `colorTextDescription` | `ArchiveIcon`（无 color）         | ✗ 色不同         |
| backlog   | `VISUALS.backlog` = `CircleDot` + `colorTextQuaternary` | `CircleDashedIcon`（无 color）    | ✗ 图标与色都不同 |
| canceled  | `VISUALS.canceled` = `CirclePause` + `colorOrange`      | `CircleSlashIcon`（无 color）     | ✗ 图标与色都不同 |
| completed | `VISUALS.completed` = `CircleCheck` + `colorSuccess`    | `CheckCircle2Icon` + `'success'`  | ✗ 图标不同       |
| paused    | `PauseCircle` + `colorTextSecondary`                    | `PauseCircleIcon` + `'warning'`   | ✗ 色不同         |
| planned   | `CircleDot` + `purple`                                  | `CircleDotIcon`（无 color）       | ✗ 色不同         |
| reviewing | `VISUALS.waitingForHuman` = `HandIcon` + `colorInfo`    | `CircleDotIcon` + `'warning'`     | ✗ 图标与色都不同 |

**8 个状态里 7 个图标不同。** 同一个项目状态，在项目列表和项目详情里画的是两套东西。

**同类问题不止这一处**（自检扫描结果，`rg` 状态映射定义）：
`src/features/AgentTasks/AgentTaskDetail/TaskProperties.tsx:29` 还有一份
`STATUS_META: Record<TaskStatus, StatusMeta>`，与规范版 `TASK_STATUS_VISUALS` 并行。

### 要做的改动

1. `ProjectPropertiesCard.tsx` **不再自建图标 / 颜色**，改读 `PROJECT_STATUS_VISUALS`
   （`@/components/ExecutionStatus`）。`PROJECT_STATUS_META` 保留的**只有** `writable`
   这一项 —— 它表达的是**可编辑性**，是真正属于本地的语义，不是外观。
2. 连带调用点需同步：`ProjectPropertiesCard.tsx`、`Workspace/index.tsx`、
   `Layout/TabsBar.tsx`、`SavedViews/SavedViewPage.tsx`（用 `rg` 确认，以实际为准）。
3. **`TaskProperties.tsx:29` 的重复**：先只**记录**，不要顺手改 ——
   它属任务域，本轮没有该域的参考端证据。写进 unknown。

## 二、文字颜色：候选端在同一语义上朝两个相反方向都错了（observed）

参考端全站只有一套弱化文字梯度（画布栅格化实测，非换算）：

| 参考端 token | 实测 sRGB     | 用在哪                                 |
| ------------ | ------------- | -------------------------------------- |
| 正文主色     | `#1b1b1b`     | H1 /tab 激活 / 已填写的值              |
| 次级文字     | `#2f2f31`     |                                        |
| **三级文字** | **`#5c5c5e`** | **H3 区块标题 /tab 非激活 / 卡内链接** |
| 四级文字     | `#5e5e60`     | 右栏 label / 空态值 / 进度文字         |
| 弱化占位     | `#9c9d9f`     | 占位符                                 |

候选端实测（`getComputedStyle`，`:9222`）：

| 标签                 | 源码位置                     | 参考端                         | 候选端实测                | 判定                       |
| -------------------- | ---------------------------- | ------------------------------ | ------------------------- | -------------------------- |
| 主列 `Properties`    | `Workspace/index.tsx:117`    | 三级 `#5c5c5e`，`13px/500`     | `#999999`，`13px/500`     | 颜色**太浅**               |
| 主列 `Resources`     | `Workspace/index.tsx:153`    | 三级 `#5c5c5e`，`13px/500`     | `#999999`，`13px/500`     | 颜色**太浅**               |
| `Description` 标签   | `ProjectDescription.tsx:112` | 三级 `#5c5c5e`，`13px/500`     | **`#080808`**，`13px/500` | 颜色**太深**（近正文主色） |
| 主列 `Milestones` H3 | `ProjectDashboard.tsx:61`    | 三级 `#5c5c5e`，**`13px/500`** | `#080808`，**`15px/600`** | 颜色**与**字号字重**都错** |

**根因**：候选端**没有共享的弱化文字 token**，每个面各自挑了一个灰 ——
于是同一个「区块标签」语义，`Properties` 是 `#999999`、`Description` 是 `#080808`，
**自己跟自己都不一致**，而且两个方向都偏离参考端。

最近邻判定（sRGB 欧氏距离，用真实渲染色算）：
`#999999` 最近的是参考端**弱化占位** `#9c9d9f`（距离 8）；
`#080808` 最近的是参考端**正文主色** `#1b1b1b`（距离 33）。两个都不是三级文字。

### 要做的改动

1. 统一到语义 token：三级文字 `#5c5c5e` 在 antd 词表里最近的既有 token 是
   **`cssVar.colorTextSecondary`**（`rgba(0,0,0,0.65)` 白底 ≈ `#595959`）。
   **实施前必须实测该 token 在本应用的实际渲染值**，不要假定 antd 默认值 ——
   本应用的调色板已被定制过（见第三节的 purple 反例）。若距离仍大，用带注释的常量。
2. 主列 `Milestones` H3：`15px/600 → 13px/500`，颜色同上。
3. `Description` 标签：`#080808 → 三级文字`。

## 三、里程碑图标颜色：色相错了，不是深浅错了（observed）

|               | 实测 sRGB                    |
| ------------- | ---------------------------- |
| 参考端 fill   | `#505ec4`                    |
| 参考端 stroke | **`#5e6ad2`**                |
| 候选端当前    | `#bd54c6`（`cssVar.purple`） |

**`#5e6ad2` 是 Linear 的品牌靛蓝**；候选端的 `#bd54c6` 是**洋红**。两者色相不同，
不是同一色系的深浅差 —— 所以「换个深浅」修不好。

同时参考端是**实心**菱形（`fill` + `stroke` 两个值都有），候选端 lucide `diamond` 只有描边。

### 要做的改动

按仓库既有先例用**带注释的常量**：`src/features/AgentSidebar/Topic/List/Item/metaCardData.ts:40-42`
已有 `const MERGED_PURPLE = '#8957e5'`，注释写明「antd's token set has no semantic color」。
照此办理，常量旁必须写明它的来源（Linear 里程碑实测值）**以及这是一处品牌色借用**，
方便日后一行改回 Orvilo 自有色。

## 边界

- 不改 `ExecutionStatus.ts` 的既有导出签名（其他调用方依赖它）。
- 不改任务 / 主题域的重复映射（见 unknown）。
- 不引入第二套组件树、不改根 layout、不新增全局 CSS。
- `PROJECT_STATUS_META` 的 `writable` 语义必须保留 —— 丢掉它会让状态变成可编辑，
  这是**行为变更**，不是样式变更。

## i18n

不需要新键。

## 必须保住的既有测试

`src/features/Projects/Workspace/ProjectDashboard.test.tsx`
的 `project properties planning metadata`（:552）断言了 priority / 日期 /labels/teams 的渲染，
且该文件把 `Icon` mock 成 `() => null`。**图标替换不会被既有测试捕捉**，
所以必须有新的回归测试断言「详情页状态图标 === 列表页状态图标」。

## 验收（Acceptance）

1. **回归测试**：断言 `ProjectPropertiesCard` 与 `Projects/List` 对同一 status 渲染出
   **同一个 lucide 图标**（不是断言某个具体图标名，而是断言两者**相等** ——
   这样将来任何一边改动都会红）。该测试要在改动前失败。
2. **CDP 实测**（`:9222`，1440×900）：
   - `Description` 标签的 computed color 不再是 `rgb(8, 8, 8)`
   - 主列 `Milestones` H3 的 `font-size/weight` 变成 `13px/500`
   - 同一 status 的图标在 `/projects` 列表页与项目详情页**一致**
3. **自检断言**：`rg` 确认项目域内不再有第二份「status → icon」映射。
4. `bun run check <改动文件> --lint --test` 通过。

**不构成验收**：只贴代码 diff、只贴静态截图、只跑通测试。

## Unknown（不得推断）

- 任务域（`TaskProperties.tsx:29`）的重复映射是否也该收敛 —— 缺该域的参考端证据
- 深色主题下这些 token 的实际值（本轮只测了 light）
- hover /focus/ 窄窗口下的表现
