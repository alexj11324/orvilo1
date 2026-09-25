# 缺失功能可行性研究 — Timeline / AI filter / 项目视图配置（2026-09-23）

> 只读调研产物：本轮未开 `:9666`（参考端）与 `:9222`（候选端）CDP，未改任何代码。
> 回答 `PARITY-MATRIX.md` §D「缺失功能」三行的核心问题：**能不能做成真功能、最小真实实现长什么样、缺什么依赖**。
> 参考端形态分两栏写清楚：「已知」= 既有 research 记录 + Linear 官方文档（经 `linear` MCP `search_documentation` 取得）；「待 CDP 采集」= 必须开参考端补观察的点。

---

## 1. Timeline（项目时间轴 /roadmap 形态）

### 1.1 参考端形态

**已知**

- 入口位置：项目类视图的 **Display options → Layout: List / Board / Timeline**，不是独立 tab 或独立路由。已观察页面：workspace `/bdiverifier/projects/all`（`cdp-session-2026-09-22.md:19`）与 team `/bdiverifier/team/ORV/projects/all`（`team-projects/DIFFERENCE-AND-ACCEPTANCE.md:20`、`team-pages/TEAM-SURFACES-AUDIT.md:51`）。Timeline 选项被看到但**从未被点开**。
- Linear 官方文档（`https://linear.app/docs/timeline`，MCP 检索）：
  - Timeline 只承载 project，不显示 issue（"designed to only surface projects"）。
  - Zoom：week /month/quarter/year（timeline 文档写 days/weeks/months/quarters，display-options 文档写 week\~year —— 以实测为准）。
  - 可按 initiative 或属性分组；可定制显示属性：milestones、dependencies、lead、members、priority、status、health。
  - 可把 team cycles 叠加为时间轴覆盖层；里程碑是项目内检查点标记；dependency 是项目间前后关系。
  - `https://linear.app/docs/display-options`：项目视图 Ordering 支持 manual /status/priority/updated/created + 反向；「Completed projects」过滤档位 = past week /month/year/all/none；project issue 视图默认隐藏 triage issues。

**待 CDP 采集**

- Timeline 的实际渲染：bar 几何与颜色编码（status 色？health 色？progress 填充？）、milestone 钻石标、dependency 连线 / 箭头、**无 startDate/targetDate 项目的落点**（unscheduled 侧栏还是不渲染）、zoom 控件位置与切换交互、今天标线、拖拽改日期是否可写。
- Timeline 模式下 Display options 其余项（Grouping / Ordering / Completed / 属性开关）的实际枚举与默认值。
- URL / 持久化语义：layout 选择是否进 URL、是否存入 view 定义、workspace `/projects/all` 与 team 页的默认 layout 是否独立。
- 采集位置：`/bdiverifier/projects/all` 与 `/bdiverifier/team/ORV/projects/all` 的 Display options → Timeline（只读点击可行；拖拽改日期属写操作，不采）。

### 1.2 候选端现有基础

数据层已齐，缺的是呈现与批量端点：

| 项                                                                                 | 位置                                                                                                                                                                                                                                                                                   | 状态                                                                                                         |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `projects.startDate` / `startDatePrecision` / `targetDate` / `targetDatePrecision` | `packages/database/src/schemas/project.ts:59-62`                                                                                                                                                                                                                                       | 已有，date + 精度（day/month/quarter/halfYear/year，`packages/types/src/project/index.ts:34-36`）            |
| `startedAt` / `completedAt` / `archivedAt`（执行生命周期，与计划日期独立）         | `packages/database/src/schemas/project.ts:121-124`                                                                                                                                                                                                                                     | 已有                                                                                                         |
| `project_milestones`（projectId, name, date, sortOrder）                           | `packages/database/src/schemas/project.ts:227-243`                                                                                                                                                                                                                                     | 已有表 + CRUD（`project.create` 收 milestones，`apps/server/src/routers/lambda/project.ts:265`）             |
| `project_dependencies`（predecessor→successor，带无环 check）                      | `packages/database/src/schemas/project.ts:200-221`                                                                                                                                                                                                                                     | 已有表 + 写入（`ProjectModel.create` 收 dependencies，`packages/database/src/models/project.ts:59,379-384`） |
| 项目列表带日期到客户端                                                             | `ProjectModel.list()` 全列 + `taskCount` + `progressPercent`（`models/project.ts:705-730`）→ `project.list`（`routers/lambda/project.ts:376-390`）→ `projectService.listAll`（`src/services/project.ts:38-54`）→ `useCurrentProjectList`（`src/features/Projects/List/index.tsx:512`） | **已可用**，Timeline bar 数据零后端改动                                                                      |
| 跨项目 milestones/dependencies 批量读取                                            | `ProjectModel.getPlanning(id)` 只服务单项目（`models/project.ts:581-649`）                                                                                                                                                                                                             | **缺批量端点**                                                                                               |
| 精度→文案                                                                          | `formatProjectDate`（`src/features/Projects/projectPlanningDate.ts:27-53`）                                                                                                                                                                                                            | 已有；但「精度→时间区间」（quarter→起止日）的 helper 没有，需补                                              |
| `WorkQueryLayout`                                                                  | `'board' \| 'list'`（`packages/types/src/workAttention.ts:249`），zod 同步在 `routers/lambda/workAttention.ts:104`                                                                                                                                                                     | 需扩 `'timeline'` 才能存进 saved view                                                                        |
| WorkQuery 项目排序字段                                                             | createdAt/id/name/status/updatedAt（`models/workQuery.ts:716-721`）                                                                                                                                                                                                                    | 无 targetDate 排序；Timeline 自身排序是客户端问题                                                            |
| 现成 gantt/timeline 组件                                                           | 无。搜到的 timeline 均为 agent/memory/discussion 无关物                                                                                                                                                                                                                                | 需新建                                                                                                       |
| 种子数据                                                                           | `linearParitySeed` 仅 1 个项目（2026-09-01→2026-12-31 + 4 milestones，`packages/database/src/fixtures/linearParitySeed.ts:366-380`）                                                                                                                                                   | 验收需加密：≥3 个日期交错项目 + 至少 1 条 dependency                                                         |

### 1.3 最小真实实现方案

- **组件**：新建 `src/features/Projects/Timeline/`。行 = 项目，横轴 = 连续日期刻度，bar = `startDate→targetDate`。自绘 flex/grid + 日期→像素换算（dayjs 已在用），不必引 gantt 库；一条 bar 约几十行渲染逻辑。
  - bar 区间推导：`startDate` 缺 → 以 `targetDate` 收尾的短 bar 或进「未排期」区；`targetDate` 缺 → 以 `startDate` 起、到今天 / 视窗末端的开口 bar（**参考端真实语义待采集后定**）。精度非 day 时把 {date, precision} 映射成区间（新 helper，`projectPlanningDate.ts` 旁）。
  - bar 上可渲染 progressPercent 填充（数据已有）与 status 色（`resolveProjectStatus`/`PROJECT_STATUS_VISUALS` 复用 `src/components/ExecutionStatus`）。
  - milestone 钻石标、dependency 连线：v1 依赖批量端点（见下），可做可裁；**裁掉也成立**，bar + 日期轴本身已是真功能。
- **入口**：`/projects` 列表页新增 Display options 的 Layout 项（与第 3 节共用同一个 popover）；saved view 持久化需扩 `WorkQueryLayout`/`workQuerySchema`/`savedViewCreate|Update` 的 layout 枚举，让 `layout:'timeline'` 随 view 定义落库。
- **数据源**：`/projects` 用 `project.listAll`（含日期）；saved project view 走 `workAttention.query`（`queryProjects` 返回全行，`models/workQuery.ts:1120`），两者都**不需要**为 bar 本身改后端。
- **状态** 归 `displayOptions`/ 页面 state：zoom（week/month/quarter/year）+「显示已完成」档位是纯客户端维度。

### 1.4 依赖

- 后端：`WorkQueryLayout` 枚举扩展（`packages/types`、`workQuerySchema` zod、`savedView` 模型透传 ——`layout` 列已是文本）；批量端点 `project.timelineOverview`（readable projects 的 milestones + dependency 边，两条 join 查询）—— 仅当 v1 要画 milestone/dependency。
- 新表：无。
- LLM：无。
- Fixture：`linearParitySeed` 增加项目数与 dependency（`scripts/seedLinearParity` 现有管线内扩展）。

### 1.5 风险

- **无日期项目语义未知**——Linear 怎么处理必须先看（概率高：右侧 / 底部 unscheduled 区）。
- 精度区间映射的边界（quarter 起止、halfYear）要自己定义，参考端采集时对一两个非 day 精度项目截图核对。
- 长项目列表 + 宽时间轴的双向滚动：v1 用 WorkSurface 现有 scrollHost 横向滚动即可，不做虚拟化。
- dependency 连线在分组 / 排序下的重叠绘制复杂度高 —— 建议 v1 只做 milestone 标 + hover 显示依赖文案，连线放 v2。

---

## 2. AI filter（自然语言 → 筛选）

### 2.1 参考端形态

**已知**

- 入口：`Add filter` 可搜索菜单的**第一项**「AI filter」，第二项是「Advanced filter」。三个页面均已观察（未点击）：My issues（`my-issues/BEHAVIORS.md:18-41`，其后是 Team/Status/Assignee/Agent/…/Template 共 21 项）、Views detail（`views-page/BEHAVIORS.md:5-8`）、Team projects（`team-projects/DIFFERENCE-AND-ACCEPTANCE.md:20`，项目域清单为 AI filter、Advanced filter、Status、Priority、Labels、Lead、Members、Creator、Health、Dates、Milestones、Relations、Template、Title & summary、Specific project）。
- Linear 官方文档（`https://linear.app/docs/filters`）：「Filter with AI」用自然语言让视图自动带上最合适的筛选参数，官方示例："Show me issues assigned to me"、"what issues are due next week"；生成的 filter 落到 URL（"applied filters are reflected in the browser URL"），可再编辑。
- Advanced filter（同页文档）支持 AND/OR 分组嵌套 —— 候选端 AST 同构（`filter.all`/`filter.any` 递归，`packages/types/src/workAttention.ts:237-240`）。

**待 CDP 采集**

- 点「AI filter」之后的弹层形态：输入框位置 / 占位文案、loading 态、**生成结果如何呈现**（直接套用成 filter chips？还是先预览可编辑？）、错误 / 无解态、是否追加还是替换现有 filter。
- 生成后 chips 的可编辑性（点击 chip 改算子 / 值 —— 文档说 filter 公式各部分可点改）。
- 采集位置：My issues、Projects、任一 saved view 的 Add filter → AI filter。输入自然语言是读操作（不发 LLM 写库），但会消耗参考端配额，采一两次即可。

### 2.2 候选端现有基础

筛选 AST 与执行链路完整，LLM 通路存在但有绑定门禁：

| 项                                                                                          | 位置                                                                                                                                                                                                                                                                               | 状态                                                                                                                         |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| WorkQuery AST（entityType/filter.all/any 递归 /groupBy/layout/sort/sortMode/schemaVersion） | `packages/types/src/workAttention.ts:209-290`                                                                                                                                                                                                                                      | 已有，服务端权威格式                                                                                                         |
| 字段能力表（builder 与 prompt 的唯一真相源）                                                | `WORK_QUERY_TASK_FIELD_SPECS`（:353-409，9 字段：status/workflowCategory/priority/assigneeUserId/createdByUserId/reviewerUserId/projectId/teamId/cycleId/triageStatus）与 `WORK_QUERY_PROJECT_FIELD_SPECS`（:411-434，4 字段：status/teamId/ownerUserId/visibility）               | 已有；`{ref:'currentUser'}` 值形态原生支持（:229,60-68）                                                                     |
| zod 入口校验                                                                                | `workQuerySchema`/`workQueryFilterSchema`/`workQueryPredicateSchema`（`apps/server/src/routers/lambda/workAttention.ts:55-133`）                                                                                                                                                   | 已有，AI 产物可直接过这层                                                                                                    |
| 服务端编译 + 限制                                                                           | `validateWorkQuery`（`packages/database/src/models/workQuery.ts:394-410`）：depth≤3、predicates≤20、in-values≤100（常量 `packages/types/src/workAttention.ts:610-613`）                                                                                                            | 已有                                                                                                                         |
| 任意 WorkQuery 执行端点                                                                     | `workAttention.query`/`count`/`facet`（`routers/lambda/workAttention.ts:410-486`），客户端 `workAttentionService.query`（`src/services/workAttention.ts:58-64`）                                                                                                                   | **应用侧零新后端**                                                                                                           |
| 可视化 builder（生成结果回填编辑）                                                          | `WorkQueryFilterBuilder.tsx` + `workQueryBuilder.ts`（`filterToBuilder`/`builderToFilter`），不可表达节点渲染为锁定 chip 且保存时保留（`WorkQueryFilterBuilder.tsx:374-377`）                                                                                                      | 已有，AI 产物可直接进 builder 再编辑                                                                                         |
| LLM 调用通路                                                                                | 客户端 `aiChatService.generateJSON`（`src/services/aiChat.ts:25-30`）→ `aiChat.outputJSON`（`apps/server/src/routers/lambda/aiChat.ts:148-222`，带 schema 约束输出 + tracingId）→ `AiGenerationService.generateObject`（`apps/server/src/services/aiGeneration/index.ts:146-193`） | 已有且被 SuggestionChips 等真实使用（`src/features/AgentBuilder/SuggestionChips/useBuilderSuggestions.ts:74-88` 是调用范式） |
| 调用者 taxonomy                                                                             | `kind:'judgment'` 走 ACP 绑定（agentId /builtin slug /env `ACP_JUDGMENT_AGENT_ID` 兜底，`judgment.ts:135-185`）；`kind:'basic'` 只有 9 个枚举例外且被 `acpJudgmentGuards.test.ts` 强制                                                                                             | AI filter 属 judgment，须走绑定                                                                                              |
| prompt 链安放处                                                                             | `packages/prompts/src/chains/`（builderSuggestion 模式：返回 `{messages, schema}`）                                                                                                                                                                                                | 新增 `workQueryFilter` 链即可                                                                                                |
| tracing scenario                                                                            | `TRACING_SCENARIOS`（`packages/const/src/llmGenerationTracing.ts:9-51`）无 filter 场景                                                                                                                                                                                             | 需加 `AiFilter` 枚举值                                                                                                       |
| i18n 词汇表                                                                                 | 字段 / 算子标签已齐（`packages/locales/src/default/common.ts:792-836`）                                                                                                                                                                                                            | 复用做 prompt 与生成结果渲染                                                                                                 |

**关键缺口**：`WorkQueryField` 没有日期类字段（无 dueDate/targetDate/createdAt 谓词），也没有 labels/content/milestone。Linear 官方示例「due next week」在候选端 AST 中**不可表达**。v1 只能覆盖现有字段域；扩字段 = 扩 `WorkQueryField` + field spec + `compilePredicate`（`models/workQuery.ts`）+ zod enum，是独立工作量。

### 2.3 最小真实实现方案

- **服务端**：`workAttention` 新增 `aiFilter` procedure（推荐，而非让客户端直连 `outputJSON`—— 服务端可以注入字段注册表与选项表，prompt 不受客户端篡改）。输入 `{entityType, text}`；服务端构造 prompt：
  - system：WorkQueryFilter JSON schema（只含 `all`/`any` 一层嵌套）+ 字段表（从 `workQueryFieldSpecs(entityType)` 生成，含每个字段的合法 ops 与枚举值）+ 选项映射（teams、workspace 成员名→userId、项目名→id、cycle 名→id，复用 `team.teams`、`useWorkspaceMembersQuery` 背后的成员端点、`workAttention.projectOptions`/`cycleOptions` 对应 model 方法；「me/my」→ `{ref:'currentUser'}`）。
  - `generateObject` 走 `kind:'judgment'`，`binding:{slug: <builtin>}`（`getBuiltinAgent` 对不存在行会自愈创建，`models/agent.ts:1714`+）；模型 / 提供方用该 builtin agent 的 persist config。输出先过 `workQuerySchema` zod，再按 field spec 逐条丢弃非法 field/op/value（白名单收缩而非报错 —— 生成错误宁可少给不可错给），返回 `WorkQueryFilter`。
- **客户端**：Add filter 菜单首项「AI filter」→ 输入框（Enter 提交，Escape 关闭，提交后 loading）→ 产物经 `filterToBuilder` 进 builder 行展示为可编辑 chips（预览 - 确认或直接套用两态，参考端形态待采集后对齐）→ `workAttentionService.query` 执行。
- **落点选择**：SavedViewPage 的 filters popover（owner 草稿）接入最自然 ——`ViewEditorState.builder` 已是同一 AST。`/projects` 与 MyWork 的常驻 filter 条需先有承载 UI（MyWork 当前只有 noProject/delegated 两个 chip + URL 参数，`MyWorkPage.tsx:234-264`；任意 AST 进 URL 需新增 `?query=` 编码或保持内存态）。

### 2.4 依赖

- 后端：新 tRPC procedure（`workAttention.aiFilter` 或独立 router）；`TRACING_SCENARIOS.AiFilter`；`@orvilo/prompts` 新 chain。
- LLM / 绑定：**需要判定用的 builtin agent slug**—— 现有 14 个 builtin（`packages/builtin-agents/src/types.ts:12-27`）无正对口的，可新建轻量 builtin（如 `work-filter`）或显式复用一个（需主人裁决）；`ACP_JUDGMENT_AGENT_ID` env 兜底在 Electron parity 本地环境是否已配置需运行时确认。
- 新表：无。
- 数据：`?query=` 编码或列表页 filter 状态承载（产品决策）。

### 2.5 风险

- **字段域差距**：候选 AST 无日期 /labels/content/milestone 字段 ——「due next week」「labeled bug」类 NL 必败。v1 需要在 prompt 中诚实限定可表达域 + 失败时回显「无法表达」而非幻觉出假谓词。要追平需先扩 `WorkQueryField` 注册表（独立 slice）。
- **名称→id 解析**：选项表注入体积有界（项目≤250、成员数百级）但仍是 prompt 成本；mis-resolution 会产出看似合法但实际错人的 filter—— 生成结果必须回显 chips 让用户看到「Assignee is 张三」再确认。
- **judgment 延迟**：ACP judgment 是一次 agent operation（`runAcpJudgment`），比裸 generateObject 重；若延迟不可接受，替代是加 `BasicGenerationCaller` 枚举值 + 更新 `acp-judgment-closure.md` 例外表 + guard 测试 —— 但 taxonomy 上 filter 生成确属 judgment，走 basic 是架构债。
- 绑定缺失时功能须显式降级（隐藏入口），不能留死按钮。

---

## 3. 项目视图配置（Display options / 视图配置项）

### 3.1 参考端形态

**已知**

- 项目列表 Display options（`/projects/all` 与 team projects 同款）：Layout List/Board/**Timeline**；Grouping；Ordering；Show closed projects；属性开关：**ID, Milestones, Summary, Priority, Status, Health, Teams, Lead, Members, Dependencies, Start date, Target date, Issues, Created, Updated, Completed, Labels**（`team-projects/DIFFERENCE-AND-ACCEPTANCE.md:20`、`TEAM-SURFACES-AUDIT.md:51`、`cdp-session-2026-09-22.md:19`）。
- Issue 类视图（My issues /saved view detail）：302×568 popover，Layout List/Board、Grouping（status/assignee/project/priority/cycle/label/parent/team 等）、Sub-grouping、Ordering（status/manual/priority/created/updated/due date/link count + 反向）、completed issues 可见性、sub-issues 开关、triage issues、empty groups、属性开关（ID/Status/Assignee/Priority/Project/Due date/Milestone/Labels/Links/Time in status/Created/Updated/Pull requests，`my-issues/BEHAVIORS.md:44-50`、`views-page/BEHAVIORS.md:9-12`）。
- Views 目录页自己的 Display options：Ordering（Name）+ Direction + Created/Updated/Owner 属性开关（`team-views/components/directory-editor.spec.md:11`）。
- 官方文档（display-options）：改动即个人持久化；「Set as default」把当前配置存为该页 workspace 默认；「Reset to default」还原。项目视图还有 Timeline zoom 与 Completed projects 档位。

**待 CDP 采集**

- 项目视图 Grouping/Ordering 的实际枚举全集（文档给了 lead/member/status/health/start date/target date/initiative 与 manual/status/priority/updated/created，需逐页核对弹层文案）。
- 属性开关默认值（哪些属性默认开）。
- 「Set as default」在 `/projects/all` 内置页是否出现（内置页有没有 workspace-default 概念）。
- 窄屏下 popover 形态。

### 3.2 候选端现有基础

| 项                                     | 位置                                                                                                                                                                                      | 状态                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `saved_views.display_options` jsonb 列 | `packages/database/src/schemas/workAttention.ts:139`                                                                                                                                      | **已建表，默认 `{}`**                                                                    |
| create/update 透传                     | `savedViewModel.create`/`update`（`packages/database/src/models/savedView.ts:312-330,347-369`）；tRPC 入参 `savedViewCreate`:`routers/lambda/workAttention.ts:487`、`savedViewUpdate`:699 | **链路已通，编辑器没用它**                                                               |
| 客户端类型                             | `SavedViewDefinition.displayOptions`（`packages/types/src/workAttention.ts:662`）                                                                                                         | 已有                                                                                     |
| 视图编辑器 display 区                  | `ViewDefinitionEditor.tsx:156-224`：layout (list/board) + groupBy (none/status/workflowCategory) + sort 预设 (createdAt/updatedAt/name ±) + board sortMode (manual/field)                 | 已有，且已按 `showFilters`/`showDisplay` 拆成两个 popover（`SavedViewPage.tsx:607-670`） |
| saved view 详情页 display popover      | `SavedViewPage.tsx:639-670`（Settings2 图标，owner-only）                                                                                                                                 | 已有真控件                                                                               |
| Team views 目录 display popover        | `TeamViewsSurface.tsx:245-293`：仅 sort 六项                                                                                                                                              | 部分实现                                                                                 |
| `/projects` 列表页                     | `src/features/Projects/List/index.tsx:562-573`：**toolbar 只有 SearchBar，无任何 Add filter / Display options**；7 列固定 grid（:81-88）                                                  | 需新建                                                                                   |
| MyWork filter chips                    | `MyWorkPage.tsx:234-264`：noProject/delegated chip + list/board segmented + save-as，URL 参数承载                                                                                         | 已有模式可复用（URL 参数即 Linear「filters in URL」雏形）                                |
| 项目 board 布局                        | `SavedViewProjectBoard`（`SavedViewPage.tsx:220-259`，按 status 分列、只读卡片）                                                                                                          | 已存在，可复用于 `/projects` 的 board 选项                                               |
| `project.list` 过滤面                  | `statuses` 数组参数（`routers/lambda/project.ts:376-390`）                                                                                                                                | 「Show closed projects」可直接映射 statuses 白名单                                       |
| 用户偏好持久化（内置页用）             | `packages/types/src/user/preference.ts:195` 起的 preference schema + `labPreferSelectors`                                                                                                 | 有模式可循；或学 MyWork 用 URL 参数                                                      |

### 3.3 最小真实实现方案

- **`/projects` 页**（收益最大、参考端最先被看的面）：在 `WorkSurfaceToolbar` 的 `aside` 槽放 Display options popover：
  - Layout：list（现表）/board（复用 `SavedViewProjectBoard` 思路按 status 分组）/timeline（依赖第 1 节）。
  - Ordering：name/created/updated 升降序 ——`project.list` 目前不支持排序参数，最小改法是给 `project.list` 加 `sort` 入参（或客户端内存排序：项目数 <100 时完全可接受，且 `listAll` 已全量拉取 ——**建议先客户端排序，零后端**）。
  - Show closed projects：`statuses` 入参已支持（排除 / 包含 completed+canceled+archived）。
  - 属性开关：7 列的显隐是纯客户端渲染维度，`columns` grid 模板按可见列生成。
  - 持久化：URL 参数（对齐 MyWork 模式 + Linear「URL 反映 filter」语义）或 user preference；内置页无 view 行可写。
- **Saved view**：`ViewEditorState` 加 `displayOptions` 字段 + `ViewDefinitionEditor` 加属性开关区（per entityType 的开关清单常量）→ `savedViewUpdate` 落库（链路已通）→ `SavedViewPage`/`WorkQueryResults` 读 `view.displayOptions` 控制行内属性显隐与 sub-issues 类开关。项目域视图额外接 layout:'timeline' 后的 zoom/completed 档位。
- **Issue 行属性开关**：`WorkQueryResults` 的行是固定富行（identifier/status/title/ 时间，`WorkQueryResults.tsx:192` 注释）；属性显隐需要在行组件加 `visibleProps` 集 —— 前端局部改动。
- **Add filter 菜单本身**（与第 2 节同入口）：`/projects` 目前没有 WorkQuery 驱动的项目筛选；若接 `workAttention.query(entityType:'project')` 则需补 `taskCount/progressPercent` 投影（`team-projects/DIFFERENCE-AND-ACCEPTANCE.md:30` 已记录该缺口：`queryProjects` 返回裸行）。短期替代：`/projects` 上把 AI / 普通 filter 先限定到已支持的服务端参数（statuses）+ 客户端谓词，或只做 SavedView 域的完整 filter。

### 3.4 依赖

- 后端：若 `/projects` 换到 `workAttention.query`——`queryProjects` 需补 taskCount/progressPercent 投影（`ProjectModel.list` 的 SQL 片段可抽用）；`project.list` 加 sort 参数是备选。`WorkQueryLayout` 扩 `'timeline'` 见第 1 节。
- 新表：无（`display_options` 列已在）。
- LLM：无。
- 新 i18n 键：分组 / 排序 / 属性名清单（参考端 17 个属性开关里候选端数据能支撑的子集先行 ——ID/Status/Priority/Lead/Start date/Target date/Issues/Created/Updated/Summary 可即做；Milestones/Dependencies/Teams/Members/Health 需要行级数据补充或批量端点）。

### 3.5 风险

- `/projects` 走 `project.list`（非 WorkQuery）决定了它的 display options 与 saved view 的 displayOptions 是两套持久化路径 —— 需明确「内置页配置存 preference/URL，saved view 存 `display_options` 列」的边界，避免双重真相。
- 属性开关子集 vs 参考端全集：候选缺 project labels 绑定查询、milestone 行内数据、teams 列表在行上的投影 ——v1 只能做数据已在 `listAll` 载荷里的属性，其余属性开关要先有数据再开，禁止做无数据假开关。
- 「Set as default / Reset to default」是 workspace 级写权限语义（Linear 语义待采集确认权限）；候选 workspace preference 体系是否支持 workspace-scope 默认值需单独核实，v1 可先只做个人档。

---

## 4. 横向结论与建议顺序

1. **三者有共同前置**：`/projects` 页的 Add filter + Display options 工具条壳（`WorkSurfaceToolbar.aside`）是 Timeline 入口、AI filter 入口、视图配置入口的同一个家 —— 先把这个壳 + 真排序 / 过滤 / 属性开关做出来（第 3 节 v1），三项都受益。
2. **工作量排序**：项目视图配置（纯前端为主，`displayOptions` 链路已通）< Timeline（新组件 + 可选批量端点，数据已齐）< AI filter（功能本身小，但字段域差距 + ACP 绑定 / 降级是硬依赖）。
3. **CDP 采集清单**（下轮 `:9666` 一次采完）：① `/projects/all` Display options → Timeline 全景（含无日期项目、zoom、属性开关枚举）；② 任意列表 Add filter → AI filter 的弹层与一个真实生成（如 "assigned to me"）；③ 项目视图 Display options 全枚举截图 + 默认值；④ 「Set as default」是否存在及其权限提示。
4. **红线复述**（PARITY-MATRIX §D 规则）：三者都不得落地为静态仿制 ——Timeline 必须渲染真日期 bar；AI filter 必须真调 LLM 并产出可执行 AST（无绑定时显式降级，不放死按钮）；视图配置的每一项必须改变真实渲染 / 查询。
