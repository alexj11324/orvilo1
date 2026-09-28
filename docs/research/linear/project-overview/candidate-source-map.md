# 候选端源码映射 — Project Overview

本文不是 spec，是**定位表**：把 CDP 量到的 DOM 位置映射回源文件与行，供写 spec 和派 builder 使用。
行号基于 `945cceafa`。

## DOM → 源码

候选端 DOM 带 `data-insp-path`（形如 `src/features/Projects/Workspace/ProjectDashboard.tsx:68:17:Icon`），
可直接读到源位置。以下是本轮涉及的组件：

| 版面           | 文件                                                        | 关键行                                                                                                                          |
| -------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 主列里程碑区   | `src/features/Projects/Workspace/ProjectDashboard.tsx`      | 62-76（section），68（图标），69-71（名称），72-76（日期）                                                                      |
| 右栏容器与分区 | `src/features/Projects/Layout/ProjectSidePanel.tsx`         | 62-96（`ProjectPanelSection`），117-119（Properties 区），120-140（Milestones 区），127-138（里程碑行），141-143（Progress 区） |
| 右栏属性卡     | `src/features/Projects/Workspace/ProjectPropertiesCard.tsx` | 202-226（各行），228-241（**多出的 Milestones chips 行**）                                                                      |
| 主列属性内联行 | `src/features/Projects/Workspace/index.tsx`                 | 90 附近（`Properties` Flexbox）                                                                                                 |
| tab 栏         | `src/features/Projects/Layout/TabsBar.tsx`                  | 187 附近（状态文案，已修）                                                                                                      |

## 里程碑在两处、两套实现（重要）

候选端里程碑**渲染了两次**，代码完全独立：

**主列** `ProjectDashboard.tsx:68-76`

```tsx
<Icon icon={DiamondIcon} size={14} />
<Text ellipsis fontSize={13} style={{ flex: 1, minWidth: 0 }} weight={500}>
  {milestone.name}
</Text>
{milestone.date && (
  <Text fontSize={12} type={'secondary'}>{formatProjectDate(milestone.date)}</Text>
)}
```

→ 量到：`lucide-diamond` 14×14、`fill: transparent`、`stroke: rgb(8,8,8)`（继承正文色）、
整行 0 个 `<a>`、0 个 `<button>`、`cursor: auto`、无 role/tabindex。

**右栏** `ProjectSidePanel.tsx:127-138`

```tsx
<Icon color={cssVar.colorPrimary} icon={DiamondIcon} size={12} />
<Text ...>{milestone.name}</Text>
{milestone.date && <Text ...>{formatProjectDate(milestone.date)}</Text>}
```

→ 尺寸不同（12 vs 14）、**有**颜色（`cssVar.colorPrimary`，主列是裸 Icon 无颜色）。
这两处必须由**同一个 builder** 改，否则会各写一套取值逻辑。

## 右栏属性卡里多出的 Milestones chips

`ProjectPropertiesCard.tsx:228-241` 把里程碑渲染成 `<Tag>` 圆角 chips。
参考端的右栏属性卡里**没有**这一行（它的里程碑在独立的 Milestones 区）。
按 left-join 口径这是候选端多出的元素 → 删除。

**删之前要确认**：这一段有没有测试或其它调用方依赖？删之前先搜断言。

## 必须保住的既有测试

`src/features/Projects/Workspace/ProjectDashboard.test.tsx` 里与本轮相关的三组：

| describe                               | 断言什么                                     | 本轮影响                             |
| -------------------------------------- | -------------------------------------------- | ------------------------------------ |
| `project dashboard milestones`         | 主列渲染里程碑名 + 空态文案                  | 改主列里程碑行时不能破               |
| `project sidebar sections`             | 右栏分区折叠关系、进度计数、创建活动         | 改 `ProjectSidePanel` 时不能破       |
| `project properties planning metadata` | 右栏属性卡渲染 priority / 日期 /labels/teams | **删 Milestones chips 行**后仍须通过 |

注意 `ProjectDashboard.test.tsx:55` 把 `Icon` mock 成 `() => null`，
`:66` 把 `Tag` mock 成 `<span>` —— 所以「图标改成链接」这类改动不会被现有测试捕捉，
**必须有新的行为层回归测试**（断言渲染出了 `<a href="#milestone-…">`）。

## 可复用的既有原语

| 原语           | 位置                                                                 | 用途                                                                                                                                              |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 日期格式化     | `src/features/Projects/projectPlanningDate.ts` → `formatProjectDate` | 里程碑日期                                                                                                                                        |
| 项目级进度派生 | `src/features/Projects/projectIssueProgress.ts:8-40`                 | 按 `workflowCategory` 计数；`canceled` 不计入 scope、`done` 计 completed、未知状态返回 `null`（不伪装成 0）。**里程碑进度若要做，口径应复用这套** |
| 进度渲染       | `src/features/Projects/Layout/ProjectIssueProgress.tsx`              | 项目级进度条                                                                                                                                      |
| 右侧分区容器   | `ProjectSidePanel.tsx:62` → `ProjectPanelSection`                    | 已有折叠 + `aria-expanded` + `aria-controls`                                                                                                      |

## i18n

命名空间 `project`。三处必须同 PR 手工同步：
`packages/locales/src/default/project.ts`（英文源）、`locales/en-US/project.json`、`locales/zh-CN/project.json`。

已存在的相关键：`overview.milestones`、`overview.milestonesEmpty`、`overview.propertiesLabel`、
`overview.progressLabel`、`properties.*`、`status.*`（本轮新增，见审计 §8）。

**builder 不得自行改 i18n** —— 需要的键由控制器统一追加（见 `PLAN.md` 共享文件所有权）。
