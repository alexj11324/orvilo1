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

**判定结论（已查证，`2026-09-22`）**：是**模型缺关联**，不是派生未做。
候选端全仓库**不存在任何 milestone↔task 的关联**：`tasks` 只有 `project_id` / `cycle_ref_id` /
`workflow_state_ref_id`，无 milestone 列；224 张表里只有 `project_milestones` 自身提到 milestone；
`project_links` 只存项目外部 URL；`BriefMetadata` 是各功能自留 jsonb 且无读写方。
即**没有分母可算**，进度无法派生。参考端则相反 —— 关联在 **issue** 侧（Linear issue 带
`projectMilestone`），百分比是 Linear **服务端**算好返回的 `progress` 字段。
两端不是「同一模型少画一个字段」，而是**模型形态不同**。

推论（对 §4.7 的 2 号链接同样成立）：参考端那条「点进度 → 按里程碑过滤的 issue 列表」
依赖同一个关联，因此**没有关联就没有这个页面可跳**。

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

### 4.7 里程碑整行不可交互（observed，**行为层缺陷**）

这是本轮前两个探针**测不出来**的一层：结构层与样式层都只看「有没有这个东西、长什么样」，
不看「能不能点、点了去哪」。`cdp-dom-probe.cjs` 因此把一个纯装饰的里程碑行与一个可交互的
里程碑行报成同一个结果。用户实测「根本点不动」后补测：

| 项                   | 参考端    | 候选端          |
| -------------------- | --------- | --------------- |
| 行内 `<a>` 数量      | **2**     | **0**           |
| 行内 `<button>` 数量 | —         | **0**           |
| `role` / `tabindex`  | 有        | `null` / `null` |
| 行 `cursor`          | `default` | `auto`          |

参考端的两个可点目标是**不同去向**（不是同一个链接画两遍）：

1. **菱形图标** → `<a href="…/overview#milestone-<uuid>">` —— 页内锚点跳转。
   DOM 实测于 `:9333`，`Gate A` / `Gate B` 两行均是此形态。
2. **进度行** `2 issues · 100%` → `<a href="…/issues?projectMilestoneId=<uuid>">`
   —— **跳到按该里程碑过滤的 Issues 视图**。这就是「点开进入另一个界面」。

候选端同位置是 `<span class="anticon" role="img">`，纯展示。**结论：候选端里程碑是壳子。**

### 4.8 里程碑图标颜色与规格不同（observed，**颜色层缺陷**）

| 项   | 参考端                             | 候选端                                     |
| ---- | ---------------------------------- | ------------------------------------------ |
| 形状 | 菱形（`<path d="M7.34 2.32C…Z">`） | lucide `diamond`（`d="M2.7 10.3a2.41…Z"`） |
| 尺寸 | `16×16`                            | `14×14`                                    |
| 填充 | `fill: lch(42.969% 59.31 288.43)`  | `fill: transparent`                        |
| 描边 | `stroke: lch(48% 59.31 288.43)`    | `stroke: rgb(8, 8, 8)`（继承文本色）       |
| 外层 | `<a>`                              | `<span role="img">`                        |

参考端是**紫色实心 + 描边**；候选端是**继承正文黑的描边轮廓**。两端并非同一个视觉语义，
这也解释了为什么它在页面上不像一个「里程碑」标识。

### 4.9 Properties 纵向堆叠 vs 单行内联（observed，**布局层缺陷**）

| 项                | 参考端                                                                                                                    | 候选端                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 容器 `display`    | `grid`，`grid-template-columns: 65.4766px 587.523px`                                                                      | `flex`，`grid-template-columns: none`         |
| 容器高度          | **96px**                                                                                                                  | **434px**（4.5×）                             |
| 容器内不同 y 值数 | 5                                                                                                                         | 8                                             |
| 属性行            | 全部落在**同一条 y=316** 上（`In Progress` x=415 → `High` x=525 → `Lead` x=594 → `Sep 21st` x=665 → `Target date` x=769） | 逐行下移（y=292/309/319/327/373/441/501/536） |

参考端把属性**横向排在一行内**（`Properties` 是它上方的独立表头，y=310）；
候选端把每个属性**堆成纵向表单**。这正是用户说的「Property 那个东西应该跟第一行在一块」。

颜色层同样有差：候选端表头用裸灰 `rgb(153,153,153)`、占位文案 `rgb(187,187,187)`，
参考端走 token（`lch(39.176 1.25 282)` / `lch(19.588 1.25 282)`）。

### 4.10 Project Overview 的加载态是转圈，不是骨架（observed 候选端 / **unknown 参考端**）

用户指出「Skeleton 好像没有对齐」。查证候选端：

- `src/features/Projects/Workspace/index.tsx:72-77` —— overview 的加载分支返回
  `<Center height={'100%'}><NeuralNetworkLoading /></Center>`，即**整页居中转圈**。
- 仓库**另有**一套骨架系统：`src/components/Skeleton/Surface.tsx` 的
  `createSurfaceSkeleton`，支持 `detail | editor | form | grid | list` 五种变体，
  用 `cssVar.colorFillQuaternary` / `borderRadiusLG` 等 token 绘制。
- 但它**没有覆盖 overview 路由**：`src/features/Projects/routeMeta.ts` 只注册了
  projects 列表（`grid`）、project Activity（`list`）、project Resources（`list`）、
  项目内知识库（`list`）四条，**没有 project overview /workspace 这一条**。

所以候选端 overview 在加载时与已加载后的布局**完全无关**（一个居中转圈 vs 三栏布局）。

**参考端是什么样 —— 尚未观测**。这正是契约里「空态 / 加载态缺失不能推断」的同类陷阱：
不能拿已加载态的三栏布局去推参考端骨架的形状。已让 ref-collector 在 `:9333` 上
用限速 + 抢拍的方式采参考端 loading 骨架态（要采的包括骨架块的位置 / 颜色 / 圆角、
有无 shimmer 动画及其 duration/timing-function、覆盖范围是主列还是主列 + 右栏）。
**在拿到该证据前不动这一项。**

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
