# Project 三 tab 对齐审计（Overview / Activity / Issues）

审计对象：PR #209 分支 `devin/v6-linear-polish`，候选端为本机隔离 Electron 实例。
参考端：真实 Linear（`bdiverifier` workspace）已登录页面。

本文只记录**可复现的观测**，并显式区分：

- **observed** — 两端都在屏幕上量到过
- **data-delta** — 两端数据不同造成，**不是实现缺陷**
- **unknown** — 尚未验证，不得据空态推断

> 契约提醒（ORV-125）：空态缺失的控件不能推断为有数据时也缺失；测试通过不等于 parity；
> 单次 observed-match 不是整页证书。本文不构成验收通过。

## 1. 复现环境

| 项       | 值                                                                              |
| -------- | ------------------------------------------------------------------------------- |
| 候选端   | 本工作树 Electron，CDP `:9222`，seed 账号 `agent-testing@orvilo.aspectlabs.com` |
| 参考端   | Brave + CDP `:9333`，复用已登录 profile 的 Cookies                              |
| 视口     | 参考 `1200×824`，候选 `1200×800`（**未对齐，见 §4**）                           |
| 界面语言 | 两端均为 en-US                                                                  |
| 候选数据 | 合成 fixture：1 项目 / 4 里程碑 / 16 已完成 issue（**明确标注为合成**）         |
| 参考数据 | 真实项目：4 里程碑 / 16 issue（含真实里程碑进度）                               |

## 2. 采集与对比工具

新增两个可复用脚本（纯 RAW CDP，不依赖 agent-browser daemon）：

- `.agents/acceptance/scripts/cdp-dom-probe.cjs`
  结构层（压缩单子节点链的元素树，tag/role/aria/ 文本哈希）+ 样式层（**仅可见文本**的
  computed style 直方图）。两个设计决定来自实测：
  1. **按深度裁剪是错的度量** —— 框架容器会形成长单链，按 depth 截断会同时砍掉真实内容与噪音；
     改为压缩「无文本、无 role、单子节点」的容器链。
  2. **必须只统计可见文本** —— 候选端实测有 `5985` 个隐藏文本节点（参考端 `26`），
     统计隐藏内容等于拿「已渲染 UI」对比「未挂载标记」。
- `.agents/acceptance/scripts/parity-diff.cjs`
  按 left-join 口径输出：参考端有而候选端没有的标签、候选端多出的标签、样式刻度差异。
  内含**环境噪音过滤**（DevDock 的 FPS/CLS 读数、`Agent Mock` 等按钮、URL 回显），
  否则开发工具会被当成「我方多出的元素」。

用法：

```bash
node .agents/acceptance/scripts/cdp-dom-probe.cjs --port 9333 --max-depth 30 --out ref.json
node .agents/acceptance/scripts/cdp-dom-probe.cjs --port 9222 --max-depth 30 --out cand.json
node .agents/acceptance/scripts/parity-diff.cjs --reference ref.json --candidate cand.json --out diff.json
```

## 3. 规模对比

| tab      | 参考端 nodes / 可见文本 | 候选端 nodes / 可见文本 |
| -------- | ----------------------- | ----------------------- |
| Overview | 554 / 213               | 293 / 98                |
| Activity | 361 / 167               | 235 / 77                |
| Issues   | 498 / 177               | 275 / 86                |

候选端在三个 tab 上都显著更小。**归因未定**：可能是数据量差异、可能是密度差异，
需要同数据基数的复采才能定性 —— 不能直接读作「我们缺控件」。

## 4. 已确认的差异

### 4.1 视口未对齐（observed，工具问题）

参考端 `1200×824`、候选端 `1200×800`。像素层对比要求同等窗口宽度，当前**不满足**。
下轮必须在两端固定同一视口后重采。

### 4.2 状态术语不一致（observed）

候选端把 `active` 渲染为 **`Active`**，参考端同一语义显示 **`In Progress`**。
两端状态机同构（候选端枚举为 `backlog|planned|active|paused|reviewing|completed|canceled|archived`），
差异在**文案层**。需定位候选端项目页所用的 i18n 键并改为 `In Progress`。
（`Active` 文案疑似来自 `acceptance.status.active` 一类的相邻命名空间，未确认，见 §6。）

### 4.3 里程碑缺进度（observed）

参考端里程碑带**完成度**（`2 issues  100 %`、`7 issues  100 %` 等）；
候选端里程碑只显示名称与日期。候选端 `project_milestones` 表有 `name/description/date/sort_order`，
**没有进度字段的观测入口** —— 需判定是「派生计算未做」还是「模型缺字段」。

### 4.4 资源入口形态不同（observed，比「文案」更深）

初判为尾部省略号差异（`Add document or link` vs `Add document or link…`），**实测后被推翻**：

|        | Resources 行的实际内容                                   |
| ------ | -------------------------------------------------------- |
| 参考端 | 只有 `Resources` 标签；入口是 `+` 图标，**没有**这段文案 |
| 候选端 | `Resources` + 一个带文案的按钮 `Add document or link…`   |

差异不在标点，而在**入口形态**（图标 vs 带文案按钮）。按 left-join 口径，
候选端多出的这行文案应改造成参考端的形态。

**但改之前必须先确认一件事**：当前参考项目**有资源**（非空态），上面看到的是非空态形态；
参考端在**空资源**状态下是否改用带文案的入口**尚未验证**。
在拿到空态证据前动手，可能把正确实现改坏 —— 这正是契约里「空态缺失的控件不能推断为
有数据时也缺失」的反向陷阱。

### 4.5 Issues tab 路由不同（observed）

候选端 `/project/:id/tasks`，参考端 `/project/:id/issues`。
**这是否为有意设计未确认**（候选端领域模型是 task）。深链可用性需按 ORV-14 的既有结论核对，不得直接判为缺陷。

### 4.6 候选端隐藏文本体量（observed）

候选端 `5985` 个带文本的不可见节点，参考端 `26`。候选端把大量未展示内容留在 DOM 中。
**影响未知**：可能是未挂载 tab 的常驻渲染，也可能是虚拟列表实现。需单独定位，
它同时会污染任何按 `querySelectorAll` 做的统计。

## 5. data-delta（不是缺陷，但会污染 diff）

以下差异**全部由两端数据不同造成**，在差值表里占据了绝大多数条目：

- 参考端 issue 标题、项目名、里程碑名、成员人名（真实业务内容）
- 参考端的活动流（`created the project` / `added milestone` / `Milestone completed` / `commented`）
  —— 候选 fixture 是新建项目，没有历史事件
- 参考端侧栏的 workspace 级条目（`Favorites` / `Drafts` / `Cycles` / `Assignees`），
  属**侧栏**而非 Project tab；采集整页时会混入，应改用区域限定采集

要得到可用的差值表，下一轮需要：**同视口 + 同数据基数（补活动流）+ 区域限定**。

## 6. unknown（未验证，不得推断）

- 参考端存在而候选端没有的控件，是否在**有数据**的候选状态下出现
- Activity 的事件类型覆盖度（候选端 `task_activities` 是否承载项目级事件）
- Issues tab 的列表 / 看板默认视图与分组口径
- 焦点态、hover 态、加载态、错误态的对照
- 窄窗口（768 / 390）下的行为
- 两端字体渲染是否同源（历史已知 Geist vs Inter 差异）

## 7. 下一步

1. 固定同视口并复采（消除 §4.1）
2. 补候选端活动流 fixture，使 §5 的 data-delta 收敛
3. 区域限定采集（主内容区 / 右栏 / 侧栏分开），避免侧栏噪音
4. 逐条解决 §4 的 observed 差异，每条附前后对照
5. 行为层与像素层探针补齐后，才谈得上整页验收

## 8. 已完成的修复

| 差异          | 改动                                                                                                                     | 验证                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §4.2 状态术语 | 项目状态不再借用 `acceptance.status.*`，改用自有键 `status.*`；`active` 文案由 `Active` 改为 `In Progress`（9 处调用点） | Electron 实测：头部 chip、属性行、右栏三处均显示 `In Progress`；新增回归测试 `src/features/Projects/projectStatusLabels.test.ts`，**已确认修复前失败**（3 项中 1 项 fail）；lint clean |

该修复同时消除了一个更严重的隐患：zh-CN 下 `acceptance.status.completed` 是
「已完成并**通过验收**」、`reviewing` 是「等待你的验收」，项目状态借用它们意味着
一个普通完成的项目会显示成「已通过验收」。这不是文案风格问题，是语义错误。
