# Task-First 产品收敛・实施记录

> 本文是 \[Orvilo\_Task\_First\_Codex\_Implementation\_Plan] 的执行记录：当前 SHA、依赖清单、
> 各工作包状态、验证证据与未解决项。产品边界见 [product-scope.md](./product-scope.md)。
>
> **执行原则**：分阶段提交，每个工作包都必须可构建、可回滚。禁止「先删，后面再补」的破损中间态。

---

## 0. 基线

| 项           | 值                                                          |
| ------------ | ----------------------------------------------------------- |
| 仓库         | `alexj11324/orvilo1`                                        |
| 工作分支     | `feat/task-first-convergence`                               |
| 基线 commit  | `ea01df13045e4d092610aac985205e9d2bd47ea7`（`origin/main`） |
| worktree     | `/Users/alexjiang/Desktop/vibe/orvilo1-task-first`          |
| 基线状态     | 工作区干净，无脏改动，无 submodule                          |
| 方案引用基线 | 一致（方案写 `main` @ `ea01df1`，等于 `origin/main`）       |

### 0.1 保护项（不得回退）

`ea01df1` 引入的两项改动是本轮的**保护对象**，不得为了对齐方案快照而回退：

- Agent 中心的 composer 输入（非模型选择器为中心的旧交互）
- Orvilo 引擎 harness（引擎设置、运行身份、会话恢复）

### 0.2 方案点名的风险 —— 已逐条核实

| 方案引用                                | 实际证据                                                                                                                                                                                        | 结论                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| E03 `build:vercel` 含迁移               | `package.json:58` `"build:vercel": "... bun run build:raw && bun run db:migrate"`                                                                                                               | **确认**。测试部署不得直接使用，S80 需分离纯构建与迁移 |
| E03 `description` 含 work-and-lifestyle | `package.json:4` `"Orvilo is a work-and-lifestyle space to find, build, and collaborate with agent teams that grow with you."`                                                                  | **确认**。S70 文案靶点                                 |
| E12 Test CI 有重复运行跳过              | `.github/workflows/test.yml:22` `fkirc/skip-duplicate-actions@v5`，`:25` `skip_after_successful_duplicate: 'true'`；7 个 job 均带 `if: needs.check-duplicate-run.outputs.should_skip != 'true'` | **确认**。绿色总状态**不能**证明目标提交真跑过         |
| E04 默认任务视图为 list                 | `src/store/global/selectors/systemStatus.ts:119` `taskListViewMode = s.status.taskListViewMode ?? 'list'`                                                                                       | **确认**                                               |
| E05 AgentTasksPage 集合与范围           | `AgentTasksPage.tsx` 508 行；`collection` 默认 `tasks`；`scope` 默认 `assigned`                                                                                                                 | **确认**，细节见 §2.2                                  |

### 0.3 范围裁决（2026-09-16，用户确认，覆盖方案 §6.1）

| 项                                       | 裁决                                                |
| ---------------------------------------- | --------------------------------------------------- |
| **社区 / 文稿退役（方案 §6.1 / S30.1）** | **由另一个 Agent 负责**，本分支不实施、不清理其残留 |
| **AgentTopics 管理页删除**               | 本分支不管                                          |
| 其余 S10–S80                             | 本分支实施                                          |

**已知重叠风险**：社区 / 文稿删除工作已由另一 agent 提交为
`bbd6ead3 🔥 refactor: remove community and pages workspaces`（352 文件 / +623 / −22942，
基线 `3ef8ea60`，**尚未推送**）。该提交修改了下列**本分支 S10 也要修改**的文件：

- `packages/app-config/src/routes/index.ts`
- `src/hooks/useNavLayout.ts`
- `src/features/CommandMenu/MainMenu.tsx`
- `src/features/CommandMenu/useCommandMenu.ts`
- `src/store/global/selectors/systemStatus.ts`
- `src/spa/router/desktopRouter.shared.tsx`

两边改动的**目标条目不同**（对方移除 `community` / `page`，本分支移除 `image` / `memory` 并修改默认值与偏好迁移），预期是机械性小冲突。**本分支的每个提交都会在信息中标注重叠文件**，便于合并时对账。

### 0.4 本轮硬约束（来自方案 §0.1）

- 不在本机跑 CI / 全仓测试 / 类型检查 / 生产构建 / Docker 集成 / 桌面打包
- 不碰生产数据；不执行 `db:migrate`；不 DROP/TRUNCATE
- 不 `reset --hard` / `git clean -fd` / 强制推送 / 自动暂存无关脏文件
- 不重写技术栈；不新建第二套任务 / 聊天 / 文件 / 评测产品
- 不混淆「隐藏」与「删除」：退役要覆盖入口、路由、命令、搜索、持久化状态和无消费者代码

**补充（2026-09-16，实测）：本机可用的定向验证手段，以及被环境挡住的那一个。**
「不跑全仓」不等于「无法验证服务端」。本轮实际用过的两条路径：

| 手段                               | 命令                                               | 说明                                                                                                                                                                                                                                |
| ---------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 按包跑 PGlite 测试（**推荐**）     | `cd packages/database && bunx vitest run <file>`   | 真实 Postgres 引擎、内存实例，schema 与查询都能验。本轮用它验证了项目产物过滤的 4 个新用例                                                                                                                                          |
| 按包整包测试                       | `cd packages/builtin-tool-task && bunx vitest run` | 45 项通过                                                                                                                                                                                                                           |
| 服务端类型检查                     | `cd apps/server && bunx tsc --noEmit`              | **可用**。`packages/database` 的 `exports` 指向 `./src/index.ts`，所以这一次同时检查了 database 源码，不只是服务端。耗时约 45 分钟（本项目规模），须后台跑                                                                          |
| `pnpm type-check`（`apps/server`） | —                                                  | **本机不可用**：pnpm 会在执行脚本前先校验依赖，触发 `packages/electron-mac-notifications` 的 `node-gyp`/`libtool` 原生编译并失败（`libtool: unrecognised option: '-static'`），与改动无关。绕开办法就是上一条的 `bunx tsc --noEmit` |
| 全仓类型检查 / 全仓测试 / 构建     | —                                                  | 仍按方案禁止                                                                                                                                                                                                                        |

实测后确认**未被改动**：该次失败的 `pnpm` 调用没有写 `package.json` / `pnpm-lock.yaml` / 任何依赖清单（已用 `git status` 核对）。

---

## 1. S00 依赖清单

分类词表（沿用方案 §3）：

`DELETE_UI` 专用 UI 删除・`NEST` 下沉・`KEEP_SHARED` 共享能力保留・
`KEEP_COMPAT` 兼容 / 历史读取・`STOP_PRODUCER` 停独立生产流程・`NEEDS_TRACE` 依赖未确定（**不可直接删**）

### 1.1 导航配置与路由（S10）

**`packages/app-config/src/routes/index.ts`**（171 行，别名 `@/config/routes`，映射见 `tsconfig.json:26`）

- `NAVIGATION_ROUTES` :39-131，9 项 id：`community`(:44)、`video`(:54)、`image`(:64)、`resource`(:74)、`page`(:84)、`memory`(:95)、`tasks`(:105)、`automations`(:115)、`settings`(:125)
- `getRouteById` :136-137
- `getNavigableRoutes` :149-171 —— 白名单 `['community','image','resource','page','memory','automations']`，**排除了 `tasks`**，并把 `image` 改写成 `cmdkKey: 'tab.generation'` 合并 video 关键词
- ⚠️ **`electronKey` 字段是死字段**：除本定义文件外全仓零消费者 → S70 候选

**`src/hooks/useNavLayout.ts`**（133 行）—— **7 处 `!` 断言全在此文件**

| 行号 | route id      | 处置                                         |
| ---- | ------------- | -------------------------------------------- |
| :58  | `tasks`       | 保留（主入口）                               |
| :64  | `automations` | 保留（整合后仍为一级入口，显示名「自动化」） |
| :70  | `resource`    | 下沉为次级入口                               |
| :83  | `image`       | `DELETE_UI`                                  |
| :90  | `community`   | `DELETE_UI`（已退役，清残留）                |
| :96  | `page`        | `DELETE_UI`（已退役，清残留）                |
| :103 | `memory`      | `DELETE_UI`                                  |

> ⚠️ 方案 §4 第 5 点：**不得先删 `getRouteById()` 的条目** —— 这 7 处 `!` 会在运行时崩。
> 必须先迁移调用者，再删数据。

**其他 `getNavigableRoutes` / `getRouteById` 调用者**（用可选链，较安全）：
`src/features/CommandMenu/MainMenu.tsx:105`（settings）、`:132`（map 全量）；
`src/features/HomeSidebar/Body/CustomizeSidebarModal.tsx:185`、`:346`

### 1.2 偏好持久化（S10 —— 最容易做错的部分）

**`src/store/global/selectors/systemStatus.ts`**

- `DEFAULT_SIDEBAR_ITEMS` :179-192，12 项：
  `['tasks','automations','resource','recents','project','private','agent',__spacer__,'image','community','pages','memory']`
  注意：`video` **不在**列表里（已并入 image/generation）
- `withAllKnownKeys` :237-274 —— **模块私有，只补不删**。遍历默认列表，缺哪个补哪个
  - 调用者仅 2 处：:351（正常读取）、:375（legacy 迁移路径）
- `SIDEBAR_ACCORDION_KEYS` :197 · `DEFAULT_BOTTOM_KEYS` :199-201 ·
  `normalizeSpacerPosition` :214-230 · `reorderSidebarItems` :339（导出，拖拽用）
- `DEFAULT_SIDEBAR_ITEMS` 的其他引用：`src/store/global/actions/general.ts:220`（reset 写回）、
  `src/features/HomeSidebar/Body/CustomizeSidebarModal.tsx:437`（Reset to default）

> ⚠️ **核心结论**：`withAllKnownKeys` 只补不删。老用户的 `status.sidebarItems` 里**本来就存着**
> `image` / `community` / `pages` / `memory`，改默认列表只影响新用户。
> 必须新增一个**移除退役 key 的幂等正规化步骤**，且个人与工作区 overlay 两处都要过。

**偏好字段分布**

| 状态               | store / 字段                                                                                                                                                                                  | 位置                                                                                                                                                                | 补回逻辑                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 侧栏顺序           | `SystemStatus.sidebarItems`                                                                                                                                                                   | `initialState.ts:352`                                                                                                                                               | ✅ `withAllKnownKeys` + spacer 重锚                                  |
| 隐藏项             | `SystemStatus.hiddenSidebarSections`                                                                                                                                                          | `initialState.ts:216`；读 `systemStatus.ts:149-167`                                                                                                                 | ❌ 仅 workspace 叠加 `WORKSPACE_DEFAULT_HIDDEN_SECTIONS`(:141)       |
| 展开项             | `SystemStatus.sidebarExpandedKeys`                                                                                                                                                            | `initialState.ts:351`；读 `systemStatus.ts:169-173`                                                                                                                 | ❌ 纯 `?? DEFAULT_HOME_SIDEBAR_EXPANDED_KEYS`(`initialState.ts:144`) |
| 侧栏（legacy）     | `sidebarSectionOrder`                                                                                                                                                                         | `initialState.ts:357`（`@deprecated`）                                                                                                                              | 一次性迁移 `systemStatus.ts:356-377`                                 |
| 最近访问           | **无本地持久化**                                                                                                                                                                              | 渲染自 `@/features/Home/Recents`（`HomeSidebar/Body/index.tsx:12,58`）                                                                                              | 服务端数据                                                           |
| **桌面固定标签页** | **不在 `SystemStatus`**                                                                                                                                                                       | `src/features/Electron/titlebar/TabBar/storage.ts:4-6`，key `lobechat:desktop:tab-pages:v3:<scope>`；`pinned` 操作 `src/store/electron/actions/tabPages.ts:418-433` | ❌ 仅结构校验，**无已知键补回**                                      |
| 首页设置           | `showHomeRail`:385 / `showHomePortrait`:386 / `hiddenHomeWidgets`:387 / `homeGoalsCollapsed`:388 / `homeRecentsCount`:389 / `homeTaskCount`:390；`homeSelectedAgentId`(`initialState.ts:231`) | `systemStatus.ts`                                                                                                                                                   | ❌ 纯 `?? default`                                                   |

- 持久化介质：`LOBE_SYSTEM_STATUS` key，经 `AsyncLocalStorage`（`initialState.ts:593`）
- `WORKSPACE_OVERRIDABLE_FIELDS`（`initialState.ts:458-463`）= `['expandSessionGroupKeys','hiddenSidebarSections','sidebarExpandedKeys','sidebarItems']`
- overlay 读写：`readOverridableField`（`systemStatus.ts:21-31`）、`routeOverlayWrites`（`:43-63`）

> **桌面固定标签页是独立迁移路径**，与侧栏偏好不共用存储，S10 必须单独处理。

### 1.3 首页与看板（S20）

**`src/features/Home/index.tsx`**

- `DEFAULT_HOME_MODE = 'chat'` — :35（**S20 主要靶点**）
- `resolveInitialHomeMode` :39-44 只认 `?onboarding=task` 一个覆盖入口，:46-54 立刻 `history.replaceState` 抹掉参数

| 行号     | 子模块                              | 交互性                                        | 分类                                 |
| -------- | ----------------------------------- | --------------------------------------------- | ------------------------------------ |
| :402     | `HomeHeader`（问候 + Agent 切换器） | 半交互                                        | `NEEDS_TRACE`（切 agent 能力需保留） |
| :408     | `PortraitBubble`                    | **纯装饰**                                    | `DELETE_UI`                          |
| :411     | `HomePortrait`                      | **纯装饰**（`pointer-events:none`，:243-248） | `DELETE_UI`                          |
| :423     | `InputArea`（Composer）             | **真实交互**                                  | `KEEP_SHARED`                        |
| :431     | `HomeModeContent`                   | 半交互                                        | `NEEDS_TRACE`                        |
| :448     | `HomeInbox variant='rail'`          | 半交互                                        | `NEST`（收件箱迁移）                 |
| :455-459 | `TopicChatDrawer`                   | **真实交互宿主**                              | `KEEP_SHARED`（迁移宿主）            |
| :460-464 | `AcceptancePortalDrawer`            | **真实交互宿主**                              | `KEEP_SHARED`（迁移宿主）            |

> ⚠️ **静默失效风险（`:56-60` 注释确认）**：brief 卡片的 "View run" 只往 task store 写抽屉状态，
> **必须有组件挂载抽屉 shell**。TaskDetailPage 自己挂了一个，Home 也挂了一个。
> 迁移时必须保证「每个页面 / 标签页恰好一个宿主」—— 少了点击无反应，多了会重复弹窗。

**`src/routes/(main)/_layout/index.tsx:57-64`** —— Home 全局常驻的机制

```tsx
<DesktopLayoutContainer>
  <DesktopHomeLayout>
    <DesktopHome />
  </DesktopHomeLayout>
  <Suspense fallback={<RouteSegmentSkeleton />}>
    <Outlet />
  </Suspense>
</DesktopLayoutContainer>
```

`DesktopHomeLayout` **无条件包在 `<Outlet />` 外面**，靠 `src/features/HomeLayout/index.tsx:22-26`
判断 `isHomeRoute`（`pathname === '/'` 或 `/${activeSlug}`），再包进 React `<Activity mode={isHomeRoute ? 'visible' : 'hidden'}>`；
`:44-50` 对非首页额外加 `display: none`。**这就是 S20 要拆的「主导地位」。**

**必须保留的同文件全局能力**（与 Home 去留无关）：

| 行号   | 能力                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| :43    | `HotkeysProvider`（`HotkeyScopeEnum.Global` 初始 scope）                                                           |
| :44    | `DesktopAutoOidcOnFirstOpen`（桌面兜底重登）                                                                       |
| :45    | `AuthRequiredModal`（认证恢复）                                                                                    |
| :46    | `WorkspaceContextSlot`（工作区上下文）                                                                             |
| :47    | `RouteMetaBridge`                                                                                                  |
| :48    | `CloudBanner`（`showCloudPromotion` 门控）                                                                         |
| :49    | `DndContextWrapper`（**拖拽宿主**，见 §1.5）                                                                       |
| :56    | `NavPanelShell`                                                                                                    |
| :68-71 | `HotkeyHelperPanel` / `RegisterHotkeys` / `CmdkLazy`（**命令菜单**）/ `GlobalApprovalNotification`（**全局审批**） |

Electron 版 `index.desktop.tsx:77-97` 同结构，但把 `DesktopHomeLayout + DesktopHome` 换成 `<TabHost />`（:86-88）。

**`src/features/AgentTasks/AgentTaskList/AgentTasksPage.tsx`**（508 行）

| 参数         | 解析处                          | 取值                           | 默认           |
| ------------ | ------------------------------- | ------------------------------ | -------------- |
| `collection` | :95-105 `resolveTaskCollection` | `tasks` / `scheduled` / `mine` | **`tasks`**    |
| `scope`      | :107-108 `resolveMyTaskScope`   | `assigned` / `created`         | **`assigned`** |
| `agentId`    | :84                             | **props，非 query**            | —              |
| `projectId`  | :87                             | **props，非 query**            | —              |

- :102-103 `mine` 仅在 `allowMine` 时生效；:181 `showMineCollection = !!activeWorkspaceId && !agentId && !projectId`
  → 个人模式或 agent/project 作用域下，深链 `?collection=mine` **静默退回 `tasks`**
- :317-345 切 collection 且目标非 `mine` 时顺手 `next.delete('scope')`（:326）
- :131-138 `scheduled` 固定 `groupBy='automationMode'` 不可配；:393-399 对 scheduled **不渲染** TasksGroupConfig
- :164-166 kanban 在 scheduled 下被排除
- :188-190 注释佐证服务端分组

**`src/features/AgentTasks/AgentTaskList/KanbanBoard.tsx`**（738 行）

- :141-143 `useFetchTaskGroupList(buildKanbanGroupQuery({...}))` —— 服务端分组，一次拿回全部列的头 + 首页数据
- :660-678 每列 footer "load more" 调 `loadMoreTaskGroup(col.key)` —— **按列独立翻页**
- :28 `KANBAN_GROUP_PAGE_SIZE`；:667-668 上限 `kanbanGroupLimitCap(groupBy)`，到顶后 disabled

### 1.4 生成工作台（S30.2）

**路由**（web 与 Electron **共用同一处注册**，删一处即两端同时退役）

| 路径     | 位置                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `/video` | `src/spa/router/desktopRouter.shared.tsx:820-838`                                                                          |
| `/image` | `src/spa/router/desktopRouter.shared.tsx:840-862`（:848 `meta: routeMeta({ icon: Image, titleKey: 'navigation.image' })`） |

- `handle.meta` 均为 `GenerationSkeleton`（:836、:859，来自 `src/components/Skeleton/Generation.tsx:64`）
- 懒加载为双层（element + layout 各一 chunk）：:824/:831（video）、:844/:854（image），
  `preloadId` 由 `src/spa/router/routePreloadRegistry.ts:5-16` 消费（全文件 16 行）
- **移动端无 image/video 路由** —— 已逐条核对 `mobileRouter.config.tsx` 的 40 个 `path:`
- 页面组件：`src/routes/(main)/(create)/image/{index.tsx,_layout/index.tsx}`、`.../video/{index.tsx,_layout/index.tsx}`

> ⚠️ **陷阱**：`/resource/images`（`desktopRouter.shared.tsx:106`）与 `/resource/videos`（:107）
> 是**资源库分类**，与生成工作台无关，不得误删。

**`src/routes/(main)/(create)/` 路由组 = 111 个文件**

| 路径                                                                                   | 归属     | 依据                                           |
| -------------------------------------------------------------------------------------- | -------- | ---------------------------------------------- |
| `components/{GenerationModelItem,PromptTitle}.tsx`                                     | 组内共享 | image/video 各引一次                           |
| `features/{GenerationLayout,GenerationWorkspace,GenerationInput,CreateGenerationPage}` | 组内共享 | 全仓符号搜索确认 `(create)` 之外消费者为 **0** |
| `image/**`（76 文件）                                                                  | 混合     | —                                              |
| `video/**`（22 文件）                                                                  | 专属     | —                                              |

- 依赖是**单向 `video → image`**，非对等共享：
  `video/features/GenerationFeed/VideoSuccessItem.tsx:6,7` → image 的 ActionButtons/styles；
  `VideoErrorItem.tsx:10,11` 同；`VideoLoadingItem.tsx:8` → image 的 ElapsedTime；
  `video/features/PromptInput/index.tsx:29,30` → image 的 ConfigPanel / Select
- 反向引用为 **0**

**共享后端链路 —— 已逐环验证，真实存在**

> ⚠️ **这不是 HTTP 契约，是进程内调用**。`imageGeneration.ts:49-53` 用 `router.createCaller(ctx)`；
> `lambda/image/index.ts:339` 用 `asyncCaller.image.createImage(...)`。
> **删错东西不会在运行时暴露，只会在 `apps/server` 的 tsc 里报错。**
> 而本轮禁止在本机跑类型检查 —— 这是一个**真实的风险敞口**，见 §4 未解决项。

链路起点 `apps/server/src/services/toolExecution/serverRuntimes/imageGeneration.ts:7-11`：

```ts
import { aiModelRouter } from '@/server/routers/lambda/aiModel';
import { aiProviderRouter } from '@/server/routers/lambda/aiProvider';
import { generationRouter } from '@/server/routers/lambda/generation';
import { generationTopicRouter } from '@/server/routers/lambda/generationTopic';
import { imageRouter } from '@/server/routers/lambda/image';
```

:49-53 五个 `createCaller(callerContext)`；:55-115 注入 `ImageGenerationExecutionRuntime`。
**分类**：整条链 `KEEP_SHARED`。禁止对 `generation*` / `image*` 按名称批量删除。

### 1.5 资源（S50）

| 目录                            | 规模                     | 职责                                                                                                          |
| ------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `src/features/ResourceHome/`    | 2213 行 / 28 文件        | 资源首页与分类页外壳。`index.tsx:6` 渲染 `<ResourceManager>`                                                  |
| `src/features/ResourceLibrary/` | 682 行 / 14 文件         | 知识库详情页外壳。`index.tsx:61` 渲染 `<ResourceManager>`                                                     |
| `src/features/ResourceManager/` | **13532 行 / \~90 文件** | 真正的资源管理器（Explorer 双视图、ToolBar、LibraryHierarchy、ChunkDrawer、Editor、store、DndContextWrapper） |

**已知重复**：ResourceHome 与 ResourceLibrary 是两套平行外壳（各一份 Sidebar/Header/`style.ts`）；
库级操作菜单两套；上传入口两套。

**路由**（`desktopRouter.shared.tsx:628` 起 `// Resource routes`）：

- `resource/_layout` → `ResourceManager/Layout`（只挂 hotkeys，`ResourceManager/Layout/index.tsx:8`）
- index / `page` / `:category` / `resourceCategoryRoutes`(:103-115) → `ResourceHome`
- `resource/library`、`resource/library/[slug]`、`resource/library/permission` → `ResourceLibrary`
- 项目内复用：`/project/:projectId/library/:id` → `src/routes/(main)/project/[projectId]/library/[id]/index.tsx:1` 直接 re-export `ResourceLibrary`
- `BusinessResourceRoutes` 是空数组（`src/business/client/BusinessDesktopRoutes.tsx:6`），shared.tsx:650 展开
- **移动端无资源路由**（`mobileRouter.config.tsx` 零匹配）

**导航入口**：`HomeSidebar/Body/index.tsx:40`（`GroupKey.Resource`）、`CustomizeSidebarModal.tsx:75`、
`src/features/NavPanel/routeKey.ts:48-49`

> ⚠️ **S50 最关键耦合**
>
> `DndContextWrapper` 物理位置在 `src/features/ResourceManager/DndContextWrapper.tsx`，
> 但挂在**两个主布局**上：`src/routes/(main)/_layout/index.tsx:19,49` 与 `index.desktop.tsx:32,77`。
>
> 它依赖（全在 ResourceManager 命名空间内）：
>
> - `./store` → `useResourceManagerStore` 的 `selectedFileIds` / `setSelectedFileIds`（`DndContextWrapper.tsx:84-87`）
> - `@/store/tree` → `useTreeStore` 的 `moveItem` / `moveItems`（:166-171）
> - `@/hooks/usePermission('edit_own_content')`（:58, :107-110）
> - `@/components/FileIcon`（:19）、`CUSTOM_DOCUMENT_FILE_TYPE` / `CUSTOM_FOLDER_FILE_TYPE`（:4）
>
> **下沉 ResourceManager 之前，必须先把 DndContextWrapper（或其 `selectedFileIds` 切片 + move 程序）
> 提到共享层，否则主布局 import 直接断。**
>
> 另有一个**独立的全局拖拽宿主**（非资源专有）：`src/components/DragUploadZone/DragUploadProvider.tsx`，
> 挂在 `src/layout/SPAGlobalProvider/index.tsx:98-119`；`ResourceManager/index.tsx:147` 只是它的一个 zone。

### 1.6 自动化与周期任务（S40）

**`src/features/Automations/` = 17 文件 / 约 2500 行**

| 文件                         | 行数   | 作用                                                                             |
| ---------------------------- | ------ | -------------------------------------------------------------------------------- |
| `AutomationsPage.tsx`        | 516    | 列表主页（表格 + 批量 + 模板画廊）                                               |
| `AutomationRunsPage.tsx`     | 325    | 全工作区运行历史 `/automations/runs`                                             |
| `AutomationDetailPage.tsx`   | 306    | 详情壳：tab=runs/settings                                                        |
| `automationTemplates.ts`     | 302    | 模板定义                                                                         |
| `AutomationTriggerDraft.tsx` | 246    | 触发器编辑草稿                                                                   |
| `AutomationCreatePage.tsx`   | 206    | 新建页                                                                           |
| `shared.ts`                  | 181    | 状态映射、触发摘要、下次执行、run 归一化、路径 helper                            |
| 其余 10 个文件               | 39–149 | 画廊 / 运行列表 / 两个测试 /settings tab / 徽章 / 面包屑 /routeMeta/actions hook |

**两套视图能力差异（整合的真实工作量）**

| 能力                       | Automations                                                            | `collection=scheduled`                                                                   |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 数据源                     | `automated:true`（`AutomationsPage.tsx:221-228`）                      | `automated:true` + agentId/projectId 收窄（`AgentTasksPage.tsx:232-239`）                |
| 分页                       | 25 / 页（`:46,217,223-227`）                                           | 50 / 页（`AgentTasksPage.tsx:93,254-256`）                                               |
| 分组                       | —                                                                      | 固定 `groupBy='automationMode'`                                                          |
| active/paused 状态过滤     | ✅ `:274-278,362-397`                                                  | ❌                                                                                       |
| `scope=created`            | ✅ `:266-272`                                                          | ❌（与 agentId/projectId 收窄**互斥**）                                                  |
| 搜索                       | ✅ 客户端 `:234-241`                                                   | ❌（服务端 `list` 无 `search` 参数）                                                     |
| 批量 pause/resume/delete   | ✅ `:290-310,494-509`                                                  | ❌                                                                                       |
| 行内 run-now /pause/delete | ✅ `:166-203`                                                          | 部分：`useTaskItemContextMenu.tsx:178-187,242-247` 有 runNow/delete，**无 pause/resume** |
| 创建者列                   | ✅ `:124-134,158`                                                      | ❌                                                                                       |
| 执行 Agent 列              | ❌（仅 run-now 时 fallback，`useAutomationActions.ts:38-40`）          | 行内 assignee 选择器                                                                     |
| 时区编辑 UI                | ❌（仅 `automationNextRun` 隐式用 `scheduleTimezone`，`shared.ts:67`） | —                                                                                        |
| 运行历史                   | ✅ 入口 `:398-402`；详情 tab `AutomationDetailPage.tsx:212-218`        | 右键 open run                                                                            |
| 权限门                     | `create_content`（`:146,211,403-413`）                                 | —                                                                                        |

> 两套视图**数据源是同一个**（`automated:true`），所以「不是把链接改掉就完成整合」——
> 真正的工作量在把 Automations 独有的 5 项能力（状态过滤、`scope=created`、搜索、批量操作、
> 行内 pause/resume）搬到统一视图，且不能新建第二个 store、不能同时挂两套轮询。

> **用户裁决（覆盖方案 §7）**：整合后的界面**名称仍取「自动化」/ Automation**，
> 而非方案写的「周期任务」。落地细节待 S40 确认。

### 1.6b S30.3 / S30.4 规模（本次补测）

方案 §6.4 要求退役 `/eval` 的通用实验 / 数据集 / 基准 / 案例 UI。实测规模**与 S30.2 同级**，不是「顺手可删」：

| 项                                       | 证据                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/routes/(main)/eval/` **111 个文件** | `find "src/routes/(main)/eval" -type f \| wc -l` = 111                                                              |
| 路由注册                                 | `desktopRouter.shared.tsx:878` 起，含 `experiments/:id`、`datasets/:id`、`cases/:id`、`bench/:id/runs/:runId/...`   |
| **删除前必须先迁移的生产者**             | `Conversation/Messages/components/MessageActionBar/actions/saveAsEvalCase.ts`（消息操作「存为评测用例」，面向用户） |
| 同上                                     | `src/features/HomeSidebar/Footer/index.tsx`（侧栏页脚入口）                                                         |
| 同上                                     | `src/features/NavPanel/routeKey.ts` + 对应测试                                                                      |

方案 §6.4 同时明确「`Acceptance` / `Verify` / 任务测试报告 / 证据 / 失败追踪是任务产品核心，**保留**」—— 即 eval 与 Acceptance 必须切开，不能按 `eval` 目录名连带处理。

> ⚠️ **S30.2 与 S30.4 都受同一个验证缺口约束**：两者的后台链路都是**进程内调用**
> （`router.createCaller` / `asyncCaller.image.createImage`，见 §1.4），删错东西不会在运行时暴露，
> 只在 `apps/server` 的 tsc 里报错，而方案 §0.1 禁止本机跑类型检查。
> 这类删除的「删对了」证据只能由 GHA 的 Typecheck job 提供。

### 1.7 待补清单

以下功能域的清单仍在收集中，收集完成后补入本节：

- [ ] 社区 / 文稿残留（S30.1）
- [ ] 个人画像（S30.3）、通用评测（S30.4）、公共访客分享（S30.5）
- [ ] Goal（S60.1）与规则 / 经验（S60.2）
- [ ] 设置分组与渠道（S70）

---

## 2. 工作包状态

| 工作包                   | 实现状态     | 验证状态         | commit / 证据                                          | 保留依赖 / 阻塞                                                                                                                                                                                                                                      |     |     |
| ------------------------ | ------------ | ---------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --- |
| S00 基线与依赖清单       | IN\_PROGRESS | NOT\_RUN         | 本文                                                   | 见 §1.7 待补                                                                                                                                                                                                                                         |     |     |
| S10 统一入口与偏好迁移   | IMPLEMENTED  | REVIEW\_APPROVED | `e66656d4` `440f1bc2` `880af5de`                       | review 通过；本机 550+ 项测试通过；待 CI 类型检查；跟进项已挂工作包见 §5                                                                                                                                                                             |     |     |
| S20 默认看板、旧首页卸载 | IN\_PROGRESS | CI\_PENDING      | `fb1a52a6`（视图偏好部分）                             | 旧首页卸载未做，见 §2.2                                                                                                                                                                                                                              |     |     |
| S30 独立功能退役         | IMPLEMENTED  | CI\_PENDING      | `e965e3e5` `99528daa` `aaec4243` `c95f9ba6`            | S30.5 的服务端收口已完成（可证完备的单一收口点）；发布 UI 与访客页在云端业务实现里，不在此仓库，见 §2.5                                                                                                                                              |     |     |
| S40 自动化整合           | IMPLEMENTED  | CI\_PENDING      | `03d606a0` `c27ab198` `f4605a81`                       | 数据层已统一、名称已改「自动化」，视图合并与方案 §7 的 5 项能力两个入口都有；入口按 §2.3 的可验证理由保留 `/automations`（`useActiveTabKey` 只取 pathname 第一段、不读 query，改成 `/tasks?collection=scheduled` 会让该导航项永远不会高亮，见 §2.3） |     |     |
| S50 资源与产物归位       | IN\_PROGRESS | CI\_PENDING      | `b017069b` `2957b55b` `a870f37e` `263ebf78` `15d06a28` | 客户端、项目资料面、项目产物列表、关联失败的恢复态与引用保护均已完成并在本机验证；仅剩产物的**运行级**追溯（需生产者 + 读取者 + UI 三件一起，含一个产品决定），见 §2.6                                                                               |     |     |
| S60 Goal 与规则下沉      | IMPLEMENTED  | CI\_PENDING      | `23751be7` `7c565528` `3126df0d`                       | Goal 与详情 / 对话关联两侧经审计均为**已满足**（非待办）；规则面已下沉，见 §2.7                                                                                                                                                                      |     |     |
| S70 设置、文案与依赖清理 | IMPLEMENTED  | CI\_PENDING      | `2d9ee3a6` `3242086a`                                  | 文案、死代码、统计页与设置分组已做；Onboarding 文案属另一 agent 的在途改动（§0.3），见 §2.8                                                                                                                                                          |     |     |
| S80 远端验收与证据       | TODO         | NOT\_RUN         | —                                                      | 覆盖全部                                                                                                                                                                                                                                             |     |     |

---

### 2.1 S10 实施记录

**设计决定**

1. **退役在共享注册表里声明一次，而不是每个导航面各隐藏一次。**
   `NavigationRoute` 新增必填 `tier: 'primary' | 'secondary' | 'retired'`，
   `getNavigableRoutes()` 改为 `filter(r => r.tier !== 'retired' && r.id !== 'settings')`。
   这样侧栏、命令菜单、Electron 菜单、移动入口都从同一份声明派生，不会漂移。

2. **`retired` 条目保留在注册表里，不删除。**
   `getRouteById()` 仍需解析旧深链接与旧持久化偏好里的 id；直接删条目会让
   `useNavLayout` 的 `!` 断言在运行时崩，也会让旧数据失去解析目标。
   退役 ≠ 从数据里消失。

3. **退役需要两道闸门，缺一不可。**

   - _渲染闸门_：`useNavLayout` 里删除条目。`HomeSidebar/Body/index.tsx:136-139`
     用持久化 `sidebarItems` 的 key 去查一个由 `topNavItems` + `bottomMenuItems`
     合成的 Map —— key 查不到就不渲染。
   - _数据闸门_：`systemStatus.ts` 读路径上的 `withoutRetiredItems()`。

   只有渲染闸门不够：方案 §4 已指出 `withAllKnownKeys` **只补不删**，老用户存储里
   的 `image` / `memory` 会一直留着；只有数据闸门也不够：渲染面会各自为政。

4. **`withoutRetiredItems()` 在无退役 key 时返回原引用**，保证幂等
   （`normalize(normalize(x)) === normalize(x)`）且不破坏下游的引用相等优化。

5. **`DEFAULT_SIDEBAR_ITEMS` 的 bottom 组被清空是不可避免的**：
   退役的 4 个 key 恰好构成整个 bottom 组，而 `withAllKnownKeys` 会把
   `DEFAULT_SIDEBAR_ITEMS` 里的每一项都补回来，所以退役 key 必须离开该列表。
   连带 `DEFAULT_BOTTOM_KEYS` 变为空集。

**改动文件**

| 文件                                                         | 改动                                                                                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/app-config/src/routes/index.ts`                    | 新增 `NavigationTier` + 每条目 `tier`；新增 `project` 条目；重写 `getNavigableRoutes()`                                                                                   |
| `packages/app-config/src/routes/index.test.ts`               | 新增                                                                                                                                                                      |
| `src/hooks/useNavLayout.ts`                                  | 移除 4 个退役入口；`bottomMenuItems` 变为空数组（**移除而非 `hidden: true`**）                                                                                            |
| `src/hooks/useNavLayout.test.tsx`                            | 旧测试只覆盖已删行为 → 换为新不变量（退役项不出现、任务与自动化入口可达）                                                                                                 |
| `src/store/global/selectors/systemStatus.ts`                 | `DEFAULT_SIDEBAR_ITEMS` 去 4 项；新增 `RETIRED_SIDEBAR_ITEMS` + `withoutRetiredItems()`；接入 `sidebarItems` / `hiddenSidebarSections` / `sidebarExpandedKeys` 三个读路径 |
| `src/store/global/selectors/systemStatus.test.ts`            | 6 个失效期望值更新；新增「retired sidebar items」组（幂等、旧客户端回写、workspace overlay、无退役项时不动、隐藏项与展开项）                                              |
| `src/routes/(mobile)/_layout/NavBar.tsx`                     | Community tab → Tasks tab（`/tasks` 在移动端已注册）；顺带补上此前缺失的任务入口                                                                                          |
| `src/features/CommandMenu/MainMenu.tsx`、`useCommandMenu.ts` | 新增「新建任务」命令，置顶；复用 `taskCreateInlineCollapsed`，不新建第二条创建路径                                                                                        |
| i18n ×7 key ×3 处                                            | `cmdk.project` / `cmdk.keywords.project` / `cmdk.newTask` / `tab.project` / `navigation.project`                                                                          |

**未做（有意）**

- `src/features/CommandMenu/MainMenu.tsx` 的 `newPage` 命令（文稿）留给负责社区 / 文稿的 agent
- `resource` 标为 `secondary` 是**目标态声明**，实际从主导航下沉在 S50 完成；当前保持可达
- `electronKey` 已证实为死字段，清理留给 S70
- `SidebarTabKey` 中 `Community` / `Image` / `Memory` / `Pages` / `Video` 成员现已无引用，清理留给 S70

### 2.2 S20 实施记录

**已完成（`fb1a52a6`）—— 默认视图与完成项可见性**

方案 §2.2 要求「新用户或没有有效偏好时使用 `'kanban'`」并「让完成列可见」。实测发现这些默认值**散落在两层的 5 个位置**：

| 位置                                                                                                                              | 原值                                      | 新值                                  |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------- |
| `src/store/global/initialState.ts` `INITIAL_STATUS.taskListViewMode`                                                              | `'list'`                                  | `'kanban'`                            |
| `src/store/global/initialState.ts` `INITIAL_STATUS.taskListViewOptions.hideCompleted`                                             | `true`                                    | `false`                               |
| `src/store/global/initialState.ts` `INITIAL_STATUS.taskKanbanHiddenColumns`                                                       | `['done','canceled']`                     | `['canceled']`                        |
| `src/features/AgentTasks/AgentTaskList/listViewOptions.ts` `DEFAULT_TASK_LIST_VIEW_OPTIONS.hideCompleted`                         | `true`                                    | `false`                               |
| `src/store/global/selectors/systemStatus.ts`（`taskListViewOptions` 兜底 / `taskListViewMode` / `DEFAULT_KANBAN_HIDDEN_COLUMNS`） | `true` / `'list'` / `['done','canceled']` | `false` / `'kanban'` / `['canceled']` |

> ⚠️ **两层默认值的陷阱**：`INITIAL_STATUS` 是**显式种下**这些值的，所以 selector 里的 `?? 'list'` 兜底对新用户**根本不会触发**。只改 selector 会完全没有效果。已加测试直接断言 `INITIAL_STATUS`，防止将来只改一层造成默认值静默分裂。

**语义后果（已处理）**：`general.test.ts` 原有一个「切到 kanban 应持久化」的用例，因为 kanban 现在是默认值，切换到它成了空操作而失败。已改为从非默认值出发，保住原意图。

**已完成 —— Web 首页改为任务列表（S20 剩余部分）**

「Task-First」的用户可见结果 —— `/` 打开任务列表而不是聊天收件箱 —— 已落地；**旧 Home 组件本身尚未删除**（原因见下）。

改动：

| 位置                                                                    | 改动                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/features/GlobalOverlays/`（新）                                    | App 级覆盖层与后台同步的**唯一宿主**：`RecentSync` + `TopicChatDrawer` + `AcceptancePortalDrawer` |
| `src/spa/router/WebHomeRedirect.tsx`（新）                              | Web 索引槽的落地行为：工作区感知地跳 `/tasks`                                                     |
| `src/spa/router/desktopRouter.config.tsx`                               | 首次为 Web 提供 `createHomeElement`（此前 Web 该槽为空）                                          |
| `src/routes/(main)/_layout/index.tsx`（Web）                            | 摘掉 `DesktopHomeLayout` + `DesktopHome`，改挂 `<GlobalOverlays />`                               |
| `src/routes/(main)/_layout/index.desktop.tsx`（Electron）               | 同样挂上 `<GlobalOverlays />`                                                                     |
| `src/features/Home/index.tsx` / `HomeLayout/index.tsx`                  | 交出三个宿主；Home 变成纯展示组件                                                                 |
| `src/features/Home/{AcceptancePortalDrawer,acceptancePortalView}.ts(x)` | 移到 `GlobalOverlays/`（`git mv`，保留历史）                                                      |

**关键事实（本轮查清，且修正了原计划的判断）**

1. **这是 Web-only 改动，Electron 一行都不用改。** `src/routes/(main)/_layout/index.desktop.tsx`
   **从来不渲染** `DesktopHomeLayout` / `DesktopHome` —— 它渲染的是 `TabHost`。Electron 的首页来自
   index 槽的 `createHomeElement` → `DesktopHomeRoute`，而后者自己就是
   `HomeLayout + Home`（`src/spa/router/DesktopHomeRoute.tsx:6-10`）。
   所以「Web 侧卸载 Home」与「Electron 每标签页 Home」互不影响。

2. **`AcceptancePortalDrawer` 是和 `RecentSync` 同级的静默失效项，原计划没点到。**
   它的**唯一挂载点是 Home**（`Home/index.tsx:462`），而且它自己的文件**就住在 `features/Home/` 里**。
   `Home/index.tsx:58` 的注释对 `TopicChatDrawer` 说得更直白：
   「TaskDetailPage mounts its own; **home needs one too, or the click is a silent no-op**」。
   → 两个抽屉都是**承重**的，不是装饰。

3. **`FloatingPanel` 的 `getContainer={false}` 不是「就地渲染」。**
   库里是 `const container = getContainer === false ? void 0 : getContainer;`，然后仍交给
   `ModalPortal`（`node_modules/@lobehub/ui/es/base-ui/FloatingPanel/FloatingPanel.mjs:168,263`）。
   即 `false` 只是省略显式容器，**仍然 portal 到 document**。
   这条正是「把宿主从 `Activity hidden` 的 `display:none` 容器里挪到常驻布局」能保持行为等价的依据 ——
   宿主从来就没有被那个 `display:none` 遮住过。

4. **旧 Home 仍不能删。** Electron 的 index 槽仍注入 `DesktopHomeRoute`，它包着
   `HomeLayout + Home`。删掉 `features/Home` 会**直接打掉每个 Electron 标签页的开屏内容**。
   因此 `HomePortrait` / `PortraitBubble` 的删除不是「推迟」，而是**当前不可达** ——
   要么先决定 Electron 首页的去向，要么不动。

**尚未做（已知，非回退）**

- 每页「恰好一个宿主」：`TopicChatDrawer` 仍有 4 处页面级宿主
  （`Portal/TaskDetail/Body.tsx:51`、`Portal/TaskResult/Body.tsx:77`、
  `AgentTaskDetail/TaskDetailPage.tsx:118`、`Automations/AutomationDetailPage.tsx:301`）。
  它们**在改动前就与 Home 的宿主并存**，且因内容相同而完全重叠，所以不构成本次回退。

  ⚠️ **修法已经查清，且「直接删掉这 4 处」是错的。** `GlobalOverlays`（`src/features/GlobalOverlays/index.tsx:39`）
  的注释写着「exactly one host is mounted for the whole app」，但它只在 **`(main)`** 两处布局里挂载
  （`routes/(main)/_layout/index.tsx:68`、`index.desktop.tsx:98`）—— `(mobile)` 树有自己的 `_layout`，
  **没有挂它**。因此这 4 处页面级宿主在移动端是**唯一**宿主，删掉它们会让移动端的任务会话抽屉彻底没有宿主。
  两个平台各自成立，冲突只发生在 `(main)`：全局宿主一旦因首次打开而挂载就**常驻**（`topicMounted` 只置真），
  此时再从任务列表点进任务详情页，页面级宿主与它读同一份 `activeTopicDrawerTopicId`，抽屉打开时会渲染两层。
  正确做法二选一：①把宿主统一到 `GlobalOverlays` 并**先给移动端布局也挂上**，再删 4 处页面宿主；
  ②让页面级宿主在全局宿主存在时渲染 `null`（需要一个「已被全局托管」的 context，移动端无 provider 故行为不变）。
  两条都需要在真实 Web + 移动端上验证「抽屉只出现一层」，属 §13.1 的 S80。

- 移动端：`(mobile)` 树不使用 `(main)/_layout`，因此 `GlobalOverlays` 的三个子项在移动端**本来就没有**，
  行为未变 —— 上面的宿主问题是同一件事的另一面。

**验证**：`src/spa/router/`、`src/features/{GlobalOverlays,Home,HomeLayout}/` 共 **207 个用例全绿**；
`desktopRouter.sync.test.tsx` 中断言「Web 索引槽为空」的那条**按新契约改写**为
「Web 落地到任务列表、Electron 落地到自己的 Home」。
新建 `GlobalOverlays/index.test.tsx` 承接了原先挂在 Home 上的「验收抽屉只在验收门户打开时加载」契约，
并补上 `RecentSync` 与运行抽屉的宿主断言。

⚠️ **既有失败（非本次引入）**：`src/routes/(main)/_layout/authMount.test.ts` 的 **desktop** 用例会撞满
自带的 20s 预算。已用对照法确认 —— 在 `f4605a81` 上还原原版布局与原版测试后运行，**同样失败**。
本次改动反而让它的 web 用例从失败转为通过（少了一条 `../home` 导入链）。

---

### 附：改动前的调研记录（保留，供核对）

1. **根路径 `/` 的 index 路由在 Web 上是空的**：
   `src/spa/router/desktopRouter.shared.tsx:1603-1616` 的 index 元素是
   `deferPlatformElement(options.createHomeElement)`，注释明说「Web leaves this element
   empty; **Electron injects the per-tab Home route**」。
   所以 Web 的首页内容**不是路由渲染的**，而是下一项那个无条件挂载；而 Electron 往**同一个**
   index 注入每标签页自己的 Home。**「改 `/` 跳转」与「卸载 Home」在两端是两件事，不能一刀切。**

2. **`src/routes/(main)/_layout/index.tsx:57-64` 无条件组合 Home**：
   `DesktopHomeLayout` + `DesktopHome` 包在 `<Outlet/>` 外面。同文件 `:43-71` 的全局能力
   （HotkeysProvider / DesktopAutoOidcOnFirstOpen / AuthRequiredModal / WorkspaceContextSlot /
   RouteMetaBridge / CloudBanner / DndContextWrapper / NavPanelShell / HotkeyHelperPanel /
   RegisterHotkeys / CmdkLazy / GlobalApprovalNotification）**必须原样保留**。

3. **`src/features/HomeLayout/index.tsx` 不只是外壳 —— 两个同步组件的用途已查清**（`:64-65`）：

   | 组件                       | 行为                                                                                             | 处置                                                                                                                                                                                                         |
   | -------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | `HomeAgentIdSync`（32 行） | 把 `activeAgentId` 钉成 `inboxAgentId`，并在**卸载时清空**为 `undefined`                         | Home 专属语义，Home 移除后失去意义。⚠️ 与 `AgentIdSync` 有 `useLayoutEffect` **顺序耦合**（注释说明：同一次路由切换的提交里，被移除树的 layout cleanup 总在新树的 layout effect 之前跑），迁移时须保持该顺序 |
   | `RecentSync`（9 行）       | 调用 `useSyncRecents()` → `useFetchRecents(isLogin, scope, recentPageSize)`，写入 `useHomeStore` | ⚠️ **必须迁移，不能随 Home 一起删** —— 见下                                                                                                                                                                  |

   > **`RecentSync` 是真实的静默失效风险**：它的**唯一挂载点**就是 `HomeLayout/index.tsx:65`，
   > 而 `src/features/HomeSidebar/Body/index.tsx:12,58` 渲染 `@/features/Home/Recents`，
   > 侧栏的「最近访问」区间依赖这份数据。直接删掉 Home 会让该区间**静默变空** ——
   > 不报错、不崩，现有测试也不会红（它们断言渲染，不断言数据来源）。
   >
   > **迁移目标**：把它移到常驻的 `src/routes/(main)/_layout/index.tsx`（与其它全局能力并列），
   > 而不是留在即将被删的 `HomeLayout` 里。
   > 另需迁移 `TopicChatDrawer`、`AcceptancePortalDrawer` 两个真实交互宿主
   > （`src/features/Home/index.tsx:455-464`），并保证「每页恰好一个宿主」。

4. **移动路由**需一并核对（`mobileRouter.config.tsx`）。

**建议顺序**：先查清 `HomeAgentIdSync` / `RecentSync` → 迁移两个抽屉宿主到独立挂载点 →
处理 Web index 跳转（保持 Electron 的每标签页注入不变）→ 再卸载
`DesktopHomeLayout` + `DesktopHome` → 最后删 `HomePortrait` / `PortraitBubble` 与装饰预设。

### 2.3 S40 实施记录

**已完成 —— 数据层统一（`03d606a0`）**

`scheduledList` 与 `automationList` 曾是**两个 hook 打在同一个查询上**：都调 `fetchTaskList({ automated: true, orderBy: 'updatedAt' })`，在无筛选、无 agent/project 作用域时**发出的请求逐字节相同**，却挂在两个 key 根下 —— 同一页被缓存两次、失效两次。

改动：

- `taskKeys.scheduledList` 增加 `scope` / `statuses` 两个槽位（照 `myList` 已有的 `statuses ? [...].sort().join(',') : 'all'` 模式，保证同一集合不同顺序是同一 key）
- `useFetchScheduledTaskList` 接收 `scope` / `statuses` 并透传
- 删除 `useFetchAutomationList`、`taskKeys.automationList`、`isAutomationListKey`
- `action.ts` 的失效调用减少一处（`isScheduledTaskListKey` 已覆盖）
- `AutomationsPage` 改用统一 hook

**已完成 —— 命名取「自动化」（`03d606a0` 之后）**

用户裁决：合并后界面名仍取「自动化」。实现方式是**只改 i18n 值，不动标识符与路由** —— `collection=scheduled` 是查询标识也是路由，改名会破坏已存储的深链接：

| 位置                                                              | 原值                        | 新值                    |
| ----------------------------------------------------------------- | --------------------------- | ----------------------- |
| `packages/locales/src/default/chat.ts` `taskList.scheduled.title` | `'Scheduled tasks'`         | `'Automations'`         |
| `packages/locales/src/default/chat.ts` `taskList.scheduled.empty` | `'No scheduled tasks yet'`  | `'No automations yet'`  |
| `locales/en-US/chat.json` 同上两条                                | 同上                        | 同上                    |
| `locales/zh-CN/chat.json` 同上两条                                | `定时任务` / `暂无定时任务` | `自动化` / `暂无自动化` |

**已完成 —— 视图合并（S40-c）**

`/automations` 从 519 行独立表格改成薄壳，与 tasks 页的「自动化」tab **共用同一份视图与同一份读取**：

| 新增 / 改动                                       | 职责                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| `Automations/useScheduledTaskPage.ts`（新）       | 唯一的 scheduled 读取；统一 page size，令两个入口落进同一个 SWR key       |
| `Automations/AutomationScheduleFilters.tsx`（新） | 受控的 `AutomationScopeSwitch` / `AutomationStatusSelect`                 |
| `Automations/AutomationScheduleList.tsx`（新）    | 共享主体：搜索、表格、勾选、批量条、行内菜单、分页；**自身不发请求**      |
| `Automations/shared.ts`（扩展）                   | `AutomationScope` / `AutomationStatusFilter` / 两个 resolver / 页尺寸常量 |
| `AutomationsPage.tsx`（重写 519→140 行）          | 只剩标题行、「全部运行」链接、新建按钮，以及筛选写入的 URL 参数           |
| `AgentTasksPage.tsx`                              | scheduled 分支挂 `AutomationScheduleList` + 两个页头筛选控件              |

方案 §7 要求逐项对照的 5 项能力，现在**两个入口都有**：

| 能力                        | 实现                                                                     |
| --------------------------- | ------------------------------------------------------------------------ |
| active/paused 状态过滤      | `?status=active\|paused` → `automationStatusesFor()` → 服务端 `statuses` |
| `scope=created`「由我创建」 | `?scope=created` → 服务端 `scope`                                        |
| 客户端搜索                  | `AutomationScheduleList` 内，按 `name ?? identifier` 过滤**当前页**      |
| 批量 pause/resume/delete    | 勾选 + 底部 sticky 批量条                                                |
| 行内 pause/resume           | 每行 `DropdownMenu`：立即运行 / 暂停・恢复 / 删除                        |

**关键决定：scheduled 集合整体改用自动化表格，而不是给 `TaskList` 打补丁。**

原自动化表格有「创建者 / 状态 / 触发方式 / 下次运行」四列，`TaskList` 的行没有。
若只把筛选与批量搬过去、保留 `TaskList`，切入口时这四列会**静默消失** —— 所以 scheduled 分支整体换掉。
代价：`getScheduledTaskViewOptions`（`groupBy: 'automationMode'` 那份 view options 覆盖）成为死代码，
已删除，`AgentTasksPage.test.ts` 中对应的 2 个用例一并移除。

**入口保持 `/automations` 不动（与方案 §7 的写法不同）。**

`src/hooks/useActiveTabKey.ts` 只取 pathname 第一段、**不读 query**，所以方案 §7 的
「入口 = `/tasks?collection=scheduled`」会让「自动化」导航项永远不高亮（点它，高亮跑到「任务」上）。
让 `/automations` 保留独立路径、渲染同一套视图，则「一个实现 + 一份数据 + 两个入口 + 高亮正确」
同时成立，且已存在的深链接不破坏。

**本次顺带修掉的真实缺陷**：`clampCollectionPage` 内部硬编码 `COLLECTION_PAGE_SIZE`(50)。
scheduled tab 改为 25 / 页后，总数落在 26–50 时第 2 页**存在却会被该 effect 强制弹回第 1 页**。
现已把 `pageSize` 提为必填参数并补用例。

**已知未覆盖**：服务端 `taskService.list` 没有 `search` 参数，所以搜索只作用于当前已取回的一页。
这是沿用原 `/automations` 的行为，不是本次引入；要真正全局搜索需先给服务端加 `search`。

**不需要动的**：`useFetchAutomationRuns` / `taskKeys.automationRuns` —— 它走 `task.automationRuns` **独立 procedure**（run 维度，不是 task 维度），与本次统一无关。
`/automations/new`、`/automations/runs`、`/automations/:taskId` 按方案 §7 分别处理；`:taskId` 是 `T-<seq>` 可读标识符，服务端 `getTaskDetail` 双解析，**不需要转换 helper**。

**复核确认：`Home/HomeModeContent.tsx:415` 那处直调不构成「第二套读取」，不要再去改它。**
它用 `useFetchScheduledTaskList({ limit: taskCount })` 渲染首页的定时任务块（要 `total` 加前 N 条做徽标与预览），参数与列表页**天然不同**（列表页是分页 + 作用域 + 状态过滤），因此本就无法共用同一个 key —— 与 `03d606a0` 修掉的「两个 hook 发出逐字节相同请求却挂在两个 key 根下」不是同一件事。
真正需要确认的是失效是否漏掉一份，答案是**不漏**：`isScheduledTaskListKey` 只比 key 根（`key[0] === 'task:scheduledList'`），`mutate(isScheduledTaskListKey)` 会同时失效所有参数组合，两处缓存永远一起失效。

### 2.4 S70 部分实施记录（文案 + 无消费者标识）

S70 的完整范围（方案 §10）还包括**设置重新分组**（账户 / 外观、工作区与成员、执行环境与 Agent、工具 / 技能 / 连接器、通知 / 渠道、用量 / 成本、安全 / 权限 / 审计、数据管理）—— 那部分尚未开始。本次完成的是其中可完全静态验证的两块：

**(a) 定位文案（`75fde2ae`）**

`work-and-lifestyle` 定位与「泛聊天」卖点已从产品文案移除，改为任务优先表述：

| 文件                                                          | 说明                                 |
| ------------------------------------------------------------- | ------------------------------------ |
| `package.json:4`                                              | 描述改为任务优先（§0.2 的 E03 靶点） |
| `packages/locales/src/default/metadata.ts`                    | `chat.description` 英文源            |
| `locales/en-US/metadata.json` / `locales/zh-CN/metadata.json` | 分别手工同步                         |
| `src/app/manifest.ts`                                         | PWA manifest 描述                    |
| `src/libs/metadata/ld.ts`                                     | JSON-LD 描述                         |

同一句话原本**内联在四处**（`package.json`、metadata 命名空间、manifest、JSON-LD），且已经开始漂移。后两处改为**读 metadata 命名空间并插值 `{{appName}}`**，于是 App 自身描述只有一个来源。

> ⚠️ **不要顺手替换的字符串**：`locales/en-US/models.json:966` 与
> `packages/model-bank/src/aiModels/infiniai.ts:332` 里的 "work and lifestyle" 是
> **MiniMax-M2.1 这个第三方模型自己的简介**，不是我们的定位文案。按字符串全局替换会篡改厂商描述。

**(b) 无消费者标识（`0a4f0b05`）**

见 §5 表格第 4–7 行。要点：`electronKey` 在 `src/` / `apps/` / `packages/` 三处复核为零消费者后删除；两个死枚举同上；`showMarket` **决定保留**并说明理由。

---

### 2.5 S30 实施记录

**已完成 S30.2 —— 图片 / 视频工作台（`e965e3e5`）**

`/image`、`/video` 与 `src/routes/(main)/(create)`（**实测 100 个文件**，§1.4 原先记的 111 偏高）一并退役。外部消费者只有 router 的 4 处懒加载，`GenerationSkeleton` 只被这两条路由的 `handle.meta` 使用 —— 是闭合集合。

**保留**：整条进程内后端链（`imageGeneration.ts` → `generationRouter`/`imageRouter`/`aiModelRouter`）、生成模型配置、以及工具仍调用的共享能力。`apps/server` 一行未改。
**注意**：`/resource/images`、`/resource/videos` 是资源库分类，未受影响。

**已完成 S30.3 —— 个人画像浏览层（`99528daa`）**

删除 `identities` / `contexts` / `experiences` / `activities` 四个浏览层与 `(home)` 首页仪表盘（44 个文件），侧栏改为只列 preferences。

⚠️ **本轮的一次自我修正**：第一版把整个 `/memory` 路由组删掉了。但 §6.3 的原文是删「**浏览** UI、首页入口和个人画像成长展示」，同时要求「保持用户读取、导出、更正 / 删除数据的**受控路径**」—— 而 `/memory/preferences` 正是那条路径（服务端 `deleteAll`/`updatePreference`/`listPersonaVersions` 等过程只有它在前端调用）。删掉它等于移除了用户删除自己数据的唯一入口。已改为只删浏览层，保留 preferences 管理器，`/memory` 索引重定向到它。

其余入口同步处理：用户面板的「记忆」（指向已删的首页仪表盘）移除；`ManageMemoryButton` 保留并改指 `/memory/preferences`；`AgentSignalReceiptList` 只保留 Preference 一条路径，其余四层改为纯状态卡（不再给「打开」按钮）；命令面板的 `memory` 作用域与结果类型保留。

**后台未动，按 §6.3 的规矩**：它要求先区分「个人画像提取」与「任务 / 项目 / Agent 上下文」再停产出，且「若无法明确区分，标记为共享依赖保留」。现有触发点是 `router-hono/workflows/memory-user-memory`（`call-cron-hourly-analysis`、`pipelines/persona/update-writing`、四条 `chat-topic/*`）与 `router-hono/webhooks`。其中 chat-topic 链明显喂 Agent 上下文；persona 链是否有存活读者，仅凭客户端代码无法证否 —— 故**未停任何生产者**。

**已完成 S30.4 —— 通用评测（`aaec4243`）**

`(main)/eval`（111 文件，与 S30.2 同级，不是「顺手可删」）与 `features/EvalCapture`（7 文件）退役；`saveAsEvalCase` 消息动作、侧栏页脚两处「Evaluation Lab」、命令面板 `eval` 路由键、`enableEvalCapture` Labs 开关与其 selector 一并移除（开关留着会变成「拨了没用」的静默空操作）。

**§6.4 要求保留的**：`Acceptance` / `Verify` / 任务测试报告 / 证据 / 失败追踪全部未动；`apps/cli/src/commands/eval.ts` 是内部消费者，其库保留；`store/eval` 被 `store/utils/userDataStores` 注册，保留；`agentEval` / `ragEval` 服务端 router 未动；`ragEvalService` 属知识库，与本次无关。

⚠️ **`src/proxy.ts` 特意不改**：它的 matcher 里列着 `/eval`、`/image`、`/video`，看起来是死条目。但那是「哪些路径走 middleware」的白名单（不是鉴权放行），删掉退役段会把「旧深链接由 SPA 兜底重定向回家」变成框架层硬 404。

**已完成 S30.5 第一步 —— 服务端收口（`c95f9ba6`）**

方案 §6.5 把顺序写死为：**服务端先禁止新发布 / 新的访客执行** → 入口同步移除 → 旧链接返回安全说明 → 历史运行与审计继续读取 → 依赖清零后删代码。本轮完成第一步。

两处拒绝都是**无条件**的：不是把原来的 flag 判断取反，而是删掉 —— §6.5 要求「旧持久化 feature flag、旧客户端或尚未过期的访客 token 不能绕过退役策略」，留一个分支就等于留一个开关。原先的创建门读 `enableAgentShare`，那个分支现在不存在。

**`shareChat.execAgent` 是可证完备的收口点**（不是「多处之一」）：运行态里每一个访客标记都派生自 `execAgent` 内部构造的那个 `shareGate`（`services/aiAgent/pipeline/startOperation.ts:141` 把它读成 `agentShareVisitor`），而全仓**只有这一处**构造 `shareGate`。所以没有任何其它过程能发起访客运行；拒绝它也一并拒绝了流式输入、继续生成、异步派发与工具调用 —— 它们都在「起不来的运行」下游。

**刻意不退役的**（§6.5 明文保留）：读取路径 `share.getSharedAgent`、`shareChat.getTopics` / `getMessages`；`agentShare.disableShare` 与 `updateVisibility` 回到 `private`；`shareChat.interruptTask` 与两个 gateway token 过程 —— 最后一项是为了「已有运行按发布时的明确策略完成或取消」，掐掉在途运行的流或它的话费都不属于退役目标。

**四类分享在代码里保持可区分**：`getSharedTopic` 走 `TopicShareModel`（会话分享，另一张表、另一个能力），`AgentShareModel` 才是「公开可交互 Agent」这一类。本轮只动后者。

**客户端侧的关键发现：本仓库没有可移除的发布入口，因为入口本来就已隐藏。**
`useAgentShareSupported`（`src/business/client/useAgentShareSupported.ts`）是**业务槽位**，其开源默认返回
`{ publishable: false, supported: false, visible: false }`，注释明说「这隐藏了所有分享入口（profile tab、header action、settings page）」。
三个消费者（`features/AgentProfileTabs/index.tsx:70`、`routes/(main)/agent/profile/features/Header/index.tsx:254`、
`AgentShareSettingsPage`）读的都是它。也就是说真正的发布 UI 与访客页在**云端业务实现**（该槽位的覆盖者）里，不在此仓库 ——
「入口同步移除」属于那次云端改动。同理 `agentShareService`（`src/services/agentShare.ts`）与 `ShareShell` 全仓均**零消费者**。

**旧链接为什么不动读路径**：`share.getSharedAgent` 同时服务三件事 —— 访客历史页面的解析、所有者的预览（`isOwner` 分支）、以及「审查与撤销」所需的读取。封掉它等于同时打断 §6.5 要求保留的历史读取与撤销路径，正是那节警告的「误伤」。旧链接的**安全说明**因此落在访客**尝试运行时**：`execAgent` 返回 FORBIDDEN，而客户端既有范式 `features/Share/ErrorView.tsx:58` 的 FORBIDDEN 分支（403 说明页，经 `ShareShell` 渲染）已经在处理这类响应。

**仍未做（属云端仓库或 S80）**：云端发布 UI 与访客页的入口移除与「已退役」文案；以及 §6.5 最后一步「依赖清零后删除无用代码」—— `execAgent` 的实现体、`services/aiAgent/shareGate.ts` 的工具白名单、`AgentRuntime` 里的访客分支与 `apps/share` 都还在。本轮**刻意保留**：§6.5 把删除排在最后，而删 `AgentRuntime` 的访客分支要动 §0.1 保护的引擎 harness，且本机没有运行时可验证。代价是**那 12 个 `execAgent` 用例随之退役、实现体暂时无覆盖** —— 被移除的覆盖点已逐条写进测试注释与提交信息（花费准入、访客 topic/turn 上限、creator 作用域派发、prompt 尺寸、失败脱敏、`interactiveStart: false` 存活契约），重新开放该能力时据此恢复。

### 2.6 S50 实施记录

先做了一次**已有的能力审计**，因为 §8 的规矩是「能复用就零新增表」—— 判断缺口在哪一层，比设计关系模型更省事。结论：

| §8 的要求                          | 审计结论                      | 证据                                                                  |
| ---------------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| 任务输入与产物在界面上区分         | ✅ **已满足**                 | `TaskInstruction`（输入附件内联）+ `TaskArtifacts`（产物区块）        |
| 从任务打开产物                     | ✅ **已满足**                 | `TaskArtifacts.tsx:70` → `openDocumentModal`                          |
| 产物追溯到**任务**                 | ✅ **已满足**                 | `task_documents` + 递归子树投影出 `sourceTaskId`，UI 是 `T-12` Tag    |
| 产物追溯到**具体运行**             | ❌ **缺口**                   | `task_documents` 无 `topicId`/`operationId` 列                        |
| 共享同一文件用引用而非复制         | ✅ **已满足**                 | `task_documents` / `topic_documents` / `knowledge_base_files` 皆 join |
| 删引用 ≠ 删底层文件                | ✅ **已满足**                 | `unpinDocument` 只删 join 行                                          |
| 物理删除遵守引用保护               | ❌ **缺口**                   | 从资源库删文档 → cascade 静默摘掉所有任务引用，无计数提示             |
| 关联失败的可恢复状态               | ❌ **缺口**（且含一处真缺陷） | 见下                                                                  |
| 服务端校验目标与资源都在授权范围内 | ✅ **已满足**                 | model 层 `findManageableById` + `buildWorkspaceWhere` 双重校验        |
| 项目提供「资料与上下文」           | ❌ 缺口（本轮已补）           | 服务端三件套齐备，客户端与 UI 零接线                                  |

**已完成 S50.1 —— 资料下沉为次级入口（`b017069b`）**

`NAVIGATION_ROUTES` 里 `resource` 早已是唯一的 `secondary`，但侧栏默认顺序仍把它列在 `tasks`/`automations` 旁边 —— 声明与实际相左。改为放到 spacer 之下：spacer 本来就是「主工作集 / 下沉项」的分界，`withAllKnownKeys` 也已能把 bottom-group 默认值补到 spacer 之下。

**只改默认值**。`withAllKnownKeys` 只补不重排，所以已存顺序保持原样 —— 这是刻意的：`reorderSidebarItems` 的存在就是为了让用户自己排，读路径上强制重锚会在每次渲染里悄悄推翻用户的排布。`HomeSidebar/Body/index.test.tsx` 里那条「拖过 spacer 的项保持在新位置」的测试正是这个保证。

**已完成 S50.2 —— 项目资料面（`2957b55b`）**

`project_knowledge_bases`（`project.ts:217`）与 model 层 `listKnowledgeBases` / `addKnowledgeBase` / `removeKnowledgeBase` 都在，且带 workspace-aware 双重校验；`addKnowledgeBase` 用 `onConflictDoUpdate` 因此幂等。**零新增表**，缺的是用户能碰到的每一层：客户端 service 没暴露过程、项目侧栏没有入口、没有任何东西调用那个已经躺在 `src/routes` 下的路由模块。

顺带修掉两处：

- `/project/:projectId/library/:id` **有路由文件、有路径 helper，但从未注册** —— `getProjectLibraryPath` 拼出的 URL 无人能解析。已注册，且 sync 测试改为断言 URL 能匹配，而不只是列子路径：`src/routes` 下存在一个路由模块，本身并不等于它可达，这正是它一直没被发现的原因。
- 选择器会在首次请求全程声称「你没有知识库」。知识库 store 的 SWR 带 `fallbackData: []`，`isLoading` 从第一帧就是 false，于是空数据判断被当成已落定。既有的 `getLibraryListAsyncState` 已经写对了这条规则（其测试名就叫「treats fallback empty data during validation as unsettled loading」），所以把它从 `ResourceHome` 提到 `src/utils` 供两处共用。回归测试在朴素实现下**确认失败**。

**顺带清理 S30.4 遗留（`dba4287d`）**：`NAV_SKELETON_SHAPES` 里的 `eval` / `evalBench` 已不可达 —— eval 退役时其 nav key 一并离开了 `resolveNavPanelKey`，`evalBench` 更是全仓零引用。`image` / `video` **保留**：它们的路由也没了，但 resolver 仍会为陈旧深链接返回这两个 key，骨架在那里是「解析期间不空白」，不是残留。

**已完成 —— 项目产物列表查错了数据源（`a870f37e`）**

§8 要求产物归位到项目。项目工作台那张「最新产物」卡原按 `originAgentId: coordinatorAgentId` 取数，而项目与产物的关联在 `project_works`（多对多）里 —— 凡是**不由协调者产生**的产物都看不到，协调者未配置时更连请求都不发（SWR key 为 `null`）。

复核后的诊断与最初记录的不同，且更有约束力：`works` 表**没有** project 列，所以「按项目过滤」只能走关联表；而卡片渲染的是 `WorkSummaryItem`（带服务端从 `work_versions` 组装的 `event` 与 `totalCost`），裸关联行给不出这个形状 —— 因此不能改成读 `project.detail` 里那份 `works`（顺带查明它**零消费者**，服务端一直在发一份没人读的 payload）。

最终在既有 `listByWorkspace` 上加 `projectId`，用 `exists` 子查询过滤：保住行形状、keyset 游标与 limit（换 inner join 会让 `limit` 数成 join 匹配数）。四项新用例在 PGlite 下覆盖过滤、一 Work 挂两项目、分页穿透、空项目与跨用户 projectId；客户端两项断言**已验证对 HEAD 版本失败**。

**已完成 —— 关联失败的可恢复态（`263ebf78`）与引用保护（`15d06a28`）**

**关联失败那处真缺陷已修，且修法是把整类问题消掉、而不是把调用顺序调一下。**
`pinToTask` 原先包在 `withDocumentOutcome` **外面**，所以 outcome 在 attach 之前就发出、可以报 `succeeded`；
attach 抛错时整个工具调用又抛给 agent —— 一次操作三份互相矛盾的信号（库里说成功、任务没有产物、agent 看到失败）。
现在 attach 移进 outcome **内部**、在发出之前执行，并且**报告而不抛出**：

- outcome 不会再把「任务没收到」的产物记成干净的 success；
- attach 失败也不会落进外层 catch 被记成 `failed` —— 那会**丢失真实产物**，是方向相反的错误；
- 只有 `relation === 'created'` 才 attach，与原 `pinToTask` 包住的那三个方法**完全等价**。若改成无条件，
  是安静的回归：修改或删除已有文档也会去挂引用，而删除时的 pin 会让任务指向一个已经不存在的文档。

恢复动作**不需要新增面**：§8 要的「只重挂、不重生成」就是既有的 `task.pinDocument`（带写权限校验、`onConflictDoNothing` 幂等、按 `(taskId, documentId)` 重挂），
它的客户端 service 与 store action 早已存在，`TaskArtifacts` 也已接好反向的 `unpinDocument`。outcome 的 summary 直接点名这条路径。

回归测试的形状值得记：四条里**只有一条**对旧实现失败，报 `promise rejected "Error: pin exploded" instead of resolving` ——
另外三条（attach 先于 outcome、非创建不 attach、无任务不 attach）在改动前后都成立，是不变式而非新行为。

**引用保护已加，并沿用同层的既有范式。** `task_documents.documentId` 是 cascade，删文档会静默摘掉**每个**任务上的产物引用。
新增 `assertDocumentsNotPinnedToTasks`（`apps/server/src/services/document/taskReferences.ts`），与它旁边那半个
`assertContentsNotInRestrictedKnowledgeBase` 同形：同一条 `_helpers/` barrel 再导出、同样 `FORBIDDEN` 拒绝、同样按 `docs_` 前缀分流 id。
计数**不限于调用者自己的**引用 —— cascade 是全局的，调用者看不见的那条引用一样会被他们的删除销毁。

PGlite 而非伪造 db，因为它验的正是那条 count 查询与它挡在前面的 cascade；其中一条测试**把前提本身证明了**：
挂上引用 → 删文档 → 引用消失而任务仍在，所以这个守卫存在的理由是被演示出来的，不是被断言的。

**已知边界（与邻居守卫共有，已在代码注释里写明）**：`deleteDocument` 还会递归删除子页面，而这里只检查调用者点名的 id，
所以「父页面未被挂、子页面被挂」这种情况不会被拦住；更完整的版本可以用 `DocumentModel.collectSubtree`。

**仍未做 —— 产物的运行级追溯（诊断已更正：数据早就在库里）**

⚠️ **本节原先的诊断是错的，且基于它得出的方案会做错事。** 原文写「库里有 run 级关联的只有 `topic_documents` 与
`work_versions.rootOperationId`」，并据此计划「在 `topic_documents` 上补一个生产者」。复核发现这条路不该走 ——
关联已经在另一处、而且更完整：

- `RegisterDocumentWorkParams` 同时接收 `documentId`、`topicId`、`rootOperationId`（`packages/types/src/work.ts:258-275`）；
- 运行时的注册路径把 `topicId` 与 `rootOperationId` **都传了进去**（`apps/server/src/modules/AgentRuntime/executorHelpers.ts:120-165` 的注册上下文）；
- 落库处 `works.originTopicId` 有独立索引（`packages/database/src/schemas/work.ts:83,131`）。

也就是说「某个文档产物来自哪次运行」对一个文档类 Work 而言**已经落库**：`works.originTopicId` 是运行所在的会话，
`work_versions.rootOperationId` 是同一次操作。按原计划去 `topic_documents` 补生产者，等于为已经记录的关系再造一套并行关联 ——
而 `topic_documents` 至今零读取者。

**所以剩下的不是「补数据」，是「把已有关系投影出来并显示」**：

| 层       | 要做的事                                                                                                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 服务端   | 任务详情的产物投影（`TaskDetailWorkspaceNode`）带上该产物 Work 的 `originTopicId` / `rootOperationId`。按 `documentId` 关联 `works`（`type='document'`）即可，**不新增表、不新增生产者** |
| 客户端   | `TaskArtifacts` 渲染这一条并可点进那次会话                                                                                                                                               |
| 产品决定 | 「哪一次运行」呈现成什么（会话标题、运行序号，还是可点进会话的链接）—— 这是决定，不是实现细节                                                                                            |

这一项仍与 S80 同批：要动任务详情的服务端投影与客户端渲染，且需要真实运行中的任务来确认呈现效果。

**为什么这一项仍停在这里**：不是「改不动」，而是三件必须一起落才不是造假面 —— 生产者（运行时已有 `context.topicId`，
可复用 `topic_documents`）、读取者（该表至今**零读取者**）、UI（任务详情要显示「来自哪次运行」）。
只补生产者会造出一张没人读的表；只补读取者则没有数据。而「哪一次运行」在界面上呈现成什么（topic 标题、运行序号，
还是可点进会话的链接）是一个产品决定，不是实现细节，所以它与 S80 同批。

> ⚠️ **本节原先的阻塞理由已不成立，予以更正**：原文写「三项都要动服务端、失败路径没有本地测试挂载点」。
> 本轮实际在本机用 PGlite 把第 2、3 项做完并验证了（`263ebf78`、`15d06a28`）—— 失败路径**有**挂载点，
> `apps/server` 的 `bunx tsc --noEmit` 也跑通了。可用的定向验证手段见 §0.4 的补充表。
> §5 跟进项 1（「S30/S50 删除缺本地类型检查兜底」）因此也已过时，见该项的更新。

**结论**：S50 余项与 S30.5 同属一个执行位置 —— 方案 §13.1 的 S80。

### 2.7 S60 实施记录

**S60.1 Goal —— 审计结论是「已满足」，不是待办**

方案 §9.1 说「顶层独立目标列表下沉」。审计发现**这个列表根本不存在**，所以没有可下沉的东西：

| §9.1 的要求                                    | 实际                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| 普通任务创建不再要求先建 Goal                  | ✅ `CreateTaskContent.tsx`（699 行主表单）grep `goal` 零命中       |
| 服务端不接受经 task.create 建 goal             | ✅ `task.ts:820-828` 显式抛 `BAD_REQUEST`                          |
| 顶层独立目标列表下沉                           | ✅ 不存在。只有 `/agent/:aid/goals` 与 `/project/:projectId/goals` |
| 不删除协调器 / 依赖图 / 回溯 / 预算 / 终止规则 | ✅ 未动。20 个 goal procedure 全在，客户端实现全部只依赖 `goalId`  |
| 旧 Goal 能查到关联才导航                       | ✅ 会话里的 GoalTaskCard 从 tool 结果解析 `goalId` 再链接          |

`src/proxy.ts:47-48` 里预留了 `/goals` 白名单但 `src/routes/(main)/goals/` 不存在 —— 是空壳，不是断链。

⚠️ **顺带发现的残留注释，已完成（`3126df0d`）**：`src/services/task.ts:125` 与
`src/store/task/slices/detail/action.ts:296` 都写着 “Bind a goal entity (`goals` row) to the
created task”，但所在参数根本没有 `goalId` 字段（`task.create` 也不接受）。复核时又找到**第三、四处**，
且其中一处不是注释问题：

| 位置                                                      | 性质                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/services/task.ts`                                    | 注释挂在 `identifierPrefix` 上并把它错标。已改为该字段的真实契约（`PREFIX-1`，服务端默认 `T`） |
| `src/store/task/slices/detail/action.ts`                  | 纯孤儿注释，挂在 `instruction` 上（该类型里连 `identifierPrefix` 都没有）。删除                |
| `apps/server/.../serverRuntimes/task.ts`                  | 注释**描述了一个真实存在的字段** `goal?: {...}`，但该字段不可达 —— 见下                        |
| `packages/builtin-tool-task/src/client/executor/index.ts` | 同一句注释、同样的孤儿状态。删除                                                               |

服务端那处值得单独说，因为它是「类型宣称了一个不存在的能力」：`CreateTaskArgs` 声明 `goal` 对象，
而 `createTaskImpl` 向 `TaskService.createTask` 传的是**显式字段清单**（不含 `goal`），后者也没有该参数，
manifest 的 `createTask` 参数同样没暴露它，全文件除声明外零读取。注释指向的正是那个不收它的函数。
字段与注释一并删除。**Goal 编排本身未动** —— 该包 `manifest.test.ts` / `systemRole.test.ts`
本来就在断言「goal 编排不属于任务工具范围」，两处既有契约方向一致（整包 45 项通过）。

**S60.2 自我进化 —— 已完成（`23751be7` + `7c565528`）**

客户端一半，可本地验证。L0 从「成长画像」改成规则清单：

- **删除**：判断句标题（老毛病 / 还不稳 / 已养成）、按等级分组的习惯清单、做对率与连续零错曲线、按层画像、「你教的」弧线、温习卡与其轮询（`GrowthCharts` / `TierBar` / `LayerProfile` / `WarmupCard` / `useHistoryWarmup` / `TaughtList`，共 668 行）。
- **保留**：规则正文、作用范围（方向标签 + breadcrumb）、来源（详情页每条命中链回源 topic）、动作（纠正 / 看来源 / 停用）、人工教学入口，以及 `AnchorCard`（方向的 filter /canon/out-of-scope 就是「作用范围」）。
- **补上**（方案要求「至少可辨认」但 UI 缺的两项）：**当前启用状态**与**可用的版本 / 更新时间**。两者都来自 `getLesson` 已经返回的字段，无服务端改动。

⚠️ **成熟度曲线画的是死数据**：`expertise_domain_snapshots` 的 `fitComputedAt` / `pInf` / `maturity` / `plateauKind` **全仓没有任何写入者**（schema 注释声称有 6 小时定时作业回填，`vercel.json` 无 `crons`，索引 `expertise_domain_snapshots_pending_fit_idx` 也已建）。所以 `toMaturity` 恒返回 `reason: 'pending'`，GrowthCharts 的成熟度球恒空。删它不是审美取舍 —— 那套曲线背后没有生产者。

**「用户禁用规则后不继续当作启用」在读取层已成立**：`listLessonsWithRecent` 按 `status = 'active'` 过滤（`packages/database/src/models/expertise.ts:166`），停用的规则根本不进列表。所以列表里只有一种状态，也不需要对状态分组 —— 详情页的状态标签只在**非 active** 时出现（旧深链接才会看到）。

**规则注入路径与 UI 解耦，删 UI 不影响行为**：`aiAgent/index.ts:1119` → `operationPrep.ts:1008-1023` → `ContextEngineering` → `ExpertiseContextInjector`，唯一耦合点是 `enableSelfLearning` 这个 lab flag。本轮未动服务端一行，注入链保持兼容。

**S60.3 —— 审计结论是「已满足」，不是待办**

§9.3 的核心是一句禁令：「迁移的是组件的**挂载职责**，不是用一个 `mode` 参数把原先整个大页面藏在任务详情里」。逐条核对（`src/features/AgentTasks/AgentTaskDetail/`）：

| §9.3 的要求                                 | 实际                                                                                                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 复用 `AgentTaskDetail` 与已有组件           | ✅ 目录下 40+ 个小组件各担一件事（`TaskInstruction`、`TaskArtifacts`、`TaskAcceptance`、`TaskActivities`、`TaskSubtasks`、`RunVerifyDetail`…）                             |
| 不用 `mode` 参数藏整个大页面                | ✅ `TaskDetailPage.tsx`(123 行) 是**唯一**实现；`RoutedTaskDetailPage`(26 行) 与 `AgentScopedTaskDetailPage`(41 行) 是薄适配器，只传 `showTaskAgentPanelToggle` 一个窄参数 |
| 任务聊天不因切详情页而切到另一 Agent 上下文 | ✅ `AgentTaskDetail/` 与 `Portal/TaskDetail/` 下 `setActiveAgentId` / `switchAgent` **零命中** —— 没有任何地方在这里改全局 active agent                                    |

**「对话转任务」没有做，理由是有条件的**：§9.3 原文是「**只有在**已有能力可复用或本轮确需补齐关联时做最小实现」。全仓搜不到任何此类能力（`toTask*` 只有 `toTaskStatus` 这类状态映射器），而方案 S60 的验收项里也没有它（§6.2 的措辞是「**可以**在后续显式『转为任务』时关联」，是许可而非要求）。条件不成立时造它，等于新增产品面，与本轮「收敛」的方向相反 —— 故不做，并在此记录判断依据而非留白。

**结论**：与 S60.1 同型 —— 方案的靶点是防御性的（别把现状改坏），而现状已经满足。S60 余项（详情与对话的运行时行为）需真实产品验证，属 §13.1 的 S80。

### 2.8 S70 实施记录

**已完成 —— 文案（`75fde2ae`）**：`package.json` 描述、`metadata.ts`、en-US / zh-CN `metadata.json`、
`manifest.ts`、`ld.ts` 全部单源为 task-first 表述。LICENSE 与版权说明未动（§10 明确禁止）。

**已完成 —— 无消费者标识（`0a4f0b05`）**：死字段 `NavigationRoute.electronKey`、死枚举
`GroupKey.Community/Pages`、`SidebarTabKey` 的五个退役成员。变死的 lab flag `showMarket`
**决定不删**并记录了理由（它是服务端配置契约，且是 `schema.test.ts` 的通用样本）。

**已完成 —— 无消费者的 Coming Soon 文案（`f03a0da6`）**

复核后把「Coming Soon 卡」这个靶点收敛到了**点了没反应的项**：`management.actionsMenu.autoSummarize.*`
标的是一个只会宣布自己「即将上线」的话题动作（连那一行都不存在了，只剩文案），
`image.notSupportGuide.*` 则是 S30.2 图像退役后没人再渲染的说明。两簇共 10 个 key，三份手维护的
en-US /zh-CN 与默认源 key-for-key 对齐；其余 30 个生成语种按 `AGENTS.md` 交给每日 auto-i18n 工作流。

渠道平台的 `comingSoon` **保留**：复核发现它是真实功能态而非营销占位。

**已完成 —— 统计页的聊天排名与分享海报（`2d9ee3a6`）**

§10 要求「移除独立聊天使用排名、分享海报和无关推广 UI；不凭聊天次数声称任务成功率」，同时
「保留任务相关统计、额度、成本、账单与审计」。

- 删：`AssistantsRank` / `ModelsRank` / `TopicsRank`（按聊天量给 agent / 模型 / 话题排名）+ 分享海报（`ShareModal` 生成并下载分享图，标题 “My AI Activity Index”）。
- 留：四个总量卡、活跃热力图、以及整个 usage 段（按 model /provider/user 的 token 与花费）—— 那才是额度与成本面。
- `TotalCard` 被四个总量共用，随目录被删会连带删掉，已上移到 `overview/`。
- 三个排名的**web 客户端包装与 SWR key 一并删除**，但**服务端 procedure 保留**：`message.rankModels` 被 `apps/cli` 调用 —— 正是 §10 警告的「静态分析看不到的外部 CLI 消费者」。

**已完成 —— 设置分组按能力维度重排（`3242086a`）**

§10 要求整理为八组。原 `useCategory.tsx` 按**受众 / 层级**（个人 / 订阅 / 开发者）组织，同一个能力的设置落在
两处取决于它是给谁用的。两个「个人」面（桌面 `src/features/Settings/hooks/useCategory.tsx`、移动
`src/routes/(mobile)/me/settings/features/useCategory.tsx`）改为按能力分组，词汇统一为：账户 /
通知与渠道 / 执行环境与 Agent / 工具技能与连接器 / 用量与成本 / 安全权限与审计 / 数据管理 / 开发者。

工作区那套（`WorkspaceSetting`）**不动**：它已有 Workspace（含 Members）与 Admin（含 AuditLog）两组，
本身就是方案要的词汇；且 `group.subscription` / `group.system` 两个标题 key 仍被它消费（三处核对后确认，
差点被当成死 key 删掉）。

顺带消掉一个真实缺陷：API Key 条目原先受两个闸门各列一次（`showApiKeyManage` 与 `isDevMode`），
两者同时为真时同一页面出现两行。现合并为一条 `showApiKeyManage || isDevMode`；可见性集合不变，只是不再重复。

复核中发现并处理的三处同源问题：

1. `src/features/Settings/Layout/Body/index.tsx` 的折叠面板默认展开列表是**手写的六个旧分组 key**。
   重排后 Channels / Tools / UsageAndCost / Security / Data 五个分组会默认**折叠**，且引用已删除的枚举成员
   会直接编译失败。改为从分组本身派生（`categoryGroups.map((g) => g.key)`），此后新增分组不再会漏。
2. `src/features/SettingsSearch/useSettingsSearch.ts` 的「同一 tab 只索引首次出现」守卫**保留** —— 它是
   `visibleTabs` 映射的承重逻辑（决定 tab 归属哪个分组用于面包屑），只是注释里举的例子正是刚被修掉的重复，已改写。
3. 搜索结果 id 形如 `tab-<group>-<tab>`，并作为 `result_key` 上报产品分析。分组键改名即 id 改名
   （`tab-general-stats` → `tab-usageAndCost-stats`、`tab-agent-apikey` → `tab-security-apikey` 等）。
   这是用户不可见但**数据可见**的副作用，不是缺陷（id 必须反映新分组），但读分析的人需要知道改名发生在此提交。

测试：两个直接编码旧分组的测试按新语义重写（`SettingsGroupKey.General` / `.Subscription` / `.System` 已不存在，
是重写而非改断言值）；新增的「同一 tab 不得出现在两个分组」回归测试**已用 HEAD 版本实测会失败**
（桌面 19 条 entry 只有 18 个不同、移动 15 与 14），修复后通过。8 个测试文件 46 项通过。

**未执行 —— Onboarding 文案**

本分支的 `src/features/Onboarding/` 未改（主工作区里那份 Onboarding 精简是**另一个 agent** 的在途改动，§0.3 已裁决不归本分支管）。

- **~~Coming Soon 卡~~（已更正，见 §5 跟进项 16）**：`channel.comingSoon*` 三处（`agent/channel/Header.tsx:279`、`detail/ComingSoon.tsx:66,68`、`list.tsx:266`）。§10 要区分「纯营销占位」与「真实能力不可用的解释」（需要桌面设备配置、权限不足、连接失效）。渠道平台的 coming-soon 属于前者，但删它要动渠道平台的**定义清单**（`platformDef.comingSoon`），影响到渠道列表本身 —— 需要先确认这些平台是否还有别的引用。已挂 §5 跟进项 16。

---

## 3. 旧路由映射（草案）

| 旧路径                               | 目标行为                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `/`、`/:workspaceSlug/`              | 按当前身份上下文默认进入任务页，用 `replace`；深链接例外                       |
| `/community/*`                       | 轻量退役；确有技能 / 连接器安装等保留目标时才精确转换                          |
| `/page/*`                            | 不恢复编辑能力；有授权的历史数据可读 / 导出                                    |
| `/image`、`/video`                   | 不再打开工作台；历史产物走受控入口                                             |
| `/memory/*`                          | 不恢复画像中心；进入数据管理或明确退役说明                                     |
| `/eval/*`                            | 普通产品退役说明；改 URL 不得提权                                              |
| `/automations*`                      | 列表映射 scheduled 集合；新建 / 详情 / 运行保留完整标识与原语义                |
| `/resource/*`                        | 合法对象仍可经共享 viewer / 次级资料入口访问；不丢资源 ID                      |
| `/goal/:goalId`                      | 有可靠关联才映射；否则保留授权的计划 / 历史访问，**不得把 Goal ID 当 Task ID** |
| Agent 自我进化旧路径                 | 精确映射到同一 Agent 的规则 / 经验                                             |
| 公共可交互 Agent 分享链接            | 安全不可用响应，不触发新执行                                                   |
| 通知 / 邮件 / CLI / 任务回复中的链接 | 更新新链接生成器，旧合法链接不黑洞、不跨工作区跳转                             |

---

## 4. 未解决项与阻塞

| #   | 项                                                    | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **与 `bbd6ead3` 存在两套并行退役机制（需人工收敛）**  | 见下方 §4.1                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2   | ~~**S30/S50 删除缺本地类型检查兜底**~~ **前提已作废** | 原文：「生成链是进程内 `createCaller`，删错只在 `apps/server` tsc 暴露；而本轮禁止本机跑类型检查」。**该前提是错的**：本机 `cd apps/server && bunx tsc --noEmit` 可用（`packages/database` 的 exports 指向源码，故同时检查 database），已在 `263ebf78` 与 `15d06a28` 上跑通（退出码 0）；只有 `pnpm type-check` 会因原生模块编译失败。两条服务端删除改动也都用 PGlite 做了定向回归验证。故这一项不再需要例外或 CI 兜底，手段见 §0.4 补充表 |
| 2   | `DndContextWrapper` 提升顺序                          | S50 必须先提升该宿主再下沉 ResourceManager，否则主布局 import 断                                                                                                                                                                                                                                                                                                                                                                           |
| 3   | 「自动化」命名与方案的差异                            | 已按用户裁决执行；S40 落地时确认路由层做法                                                                                                                                                                                                                                                                                                                                                                                                 |
| 4   | 桌面固定标签页迁移                                    | 独立于侧栏偏好的第二套存储，S10 需单独实现                                                                                                                                                                                                                                                                                                                                                                                                 |
| 5   | `electronKey` 死字段                                  | 待 S70 确认无动态消费者后清理                                                                                                                                                                                                                                                                                                                                                                                                              |

### 4.1 与 `bbd6ead3` 的并行退役机制（需收敛）

方案 §14 要求「共享路由、全局偏好…… 必须串行整合；同一时间不要让多个 Agent 各自重写这些区域」。
本分支与 `bbd6ead3` 各自独立实现了**同一套退役语义**，落在同名文件上：

|                                                      | `bbd6ead3`（社区 / 文稿 agent）                                                         | 本分支（S10）                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 路由注册表 `packages/app-config/src/routes/index.ts` | **删除** `community` / `page` 条目                                                      | 保留条目，新增 `tier: 'retired'`；新增 `project` 条目；重写 `getNavigableRoutes()`      |
| 侧栏退役名单                                         | `RETIRED_SIDEBAR_KEYS = new Set(['community','pages'])`                                 | `RETIRED_SIDEBAR_KEYS = new Set([...5 项])`（**同名**）                                 |
| 过滤位置                                             | `withAllKnownKeys` 内部                                                                 | `withAllKnownKeys` 内部 + `hiddenSidebarSections` / `sidebarExpandedKeys` 两个 selector |
| Electron 退役 URL                                    | 新建 `src/features/Electron/titlebar/retiredProductUrl.ts` + `RETIRED_PRODUCT_SEGMENTS` | 由 registry 的 `tier` 派生                                                              |
| `useNavLayout.ts`                                    | 移除 `community` / `page`，保留 `image` / `memory`                                      | 移除全部 4 项，`bottomMenuItems` 变空数组                                               |

**已做的对齐动作（降低合并成本）**

1. 采纳对方的过滤位置 —— 从 3 个调用点收进 `withAllKnownKeys`（所有存储顺序的唯一咽喉，
   连带覆盖 legacy `sidebarSectionOrder` 路径）。`hiddenSidebarSections` / `sidebarExpandedKeys`
   仍需单独过滤，因为二者不经过 `withAllKnownKeys`。
2. 常量**改用同名** `RETIRED_SIDEBAR_KEYS`。同名会让合并冲突显式暴露为「两边都加了同一个
   const」，取并集即可；若用不同名则会静默留下两个常量，需要事后才发现。

**合并时的收敛建议**：以 registry 的 `tier` 为唯一声明源，把 `RETIRED_SIDEBAR_KEYS` 与
Electron 的 `RETIRED_PRODUCT_SEGMENTS` 改为从它派生 —— 否则同一概念会有三处硬编码名单
（store 一处、Electron 一处、registry 一处），任何一处漏改都会让退役失效。

**另需注意**：对方**删除**了 `community` / `page` 的注册表条目，因此 `getRouteById('community')`
在合并后返回 `undefined`。本分支保留条目 + `tier` 的方案让旧深链接与旧持久化偏好仍有解析目标
（方案 §4 第 5 点的要求）；合并时需确认这一点不被回退。

**具体缺口：桌面固定标签页（合并时必须一并收敛）**

这是第三条、也是最容易被漏掉的持久化路径 —— 它**不在 `SystemStatus` 里**：

| 环节       | 现状                                                                                                                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 存储       | `src/features/Electron/titlebar/TabBar/storage.ts:4-6`，key `lobechat:desktop:tab-pages:v3:<scope>`                                                                                                                                                              |
| 读取校验   | `:18-23` `isTabItem` **只做结构校验**（`id`/`url`/`lastVisited` 的类型），**没有任何退役 URL 过滤**                                                                                                                                                              |
| 对方的机制 | `bbd6ead3` 新增 `src/features/Electron/titlebar/retiredProductUrl.ts` 的 `isRetiredProductUrl(url, scope)`，接进 `TabBar/storage.ts`、`RecentlyViewed/storage.ts`、`useResolvedPages.ts`；但其集合是 `RETIRED_PRODUCT_SEGMENTS = new Set(['community', 'page'])` |

**合并时要做的事**：把 `RETIRED_PRODUCT_SEGMENTS` 改为**从 registry 派生**
（`NAVIGATION_ROUTES.filter(r => r.tier === 'retired')` 映射出 path segment），
这样 `image` / `memory` / `video` 一并覆盖。

> ⚠️ 本分支**故意没有**新建等价实现。当前 `retiredProductUrl.ts` 只存在于 `bbd6ead3`，
> 在本分支再造一个就是第三套并行机制 —— 正是 §14 和本文档反复警告的情况。

**影响面**：当前 S10 阶段 `/image`、`/memory` 的 SPA 路由仍然存在（那是 S30 的工作），
所以被恢复的固定标签页暂时仍能打开。**S30 删除这些路由之后**，这些标签页会落进 catch-all
重定向到 `/`。方案 §13.1 `NAV-05` 要求「进入兼容目标或明确退役页，不白屏、不错误绑定 slug」——
合并收敛后即可满足。

## 5. 跟进项（已挂到工作包，不留在叙述里）

S10 的验收要求覆盖「入口、路由、命令、搜索、**持久化状态**」。下列各项经 review 确认不属于
S10 的交付范围，但**必须挂到具体工作包**，否则会在「文档里提过」和「实际做了」之间消失。

| #   | 项                                                                | 位置                                                                                                                                                                                                                 | 归属                         | 为什么是那时做                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **桌面固定标签页无退役过滤**                                      | `src/features/Electron/titlebar/TabBar/storage.ts:25-45`；`src/store/electron/actions/tabPages.ts:579-585`                                                                                                           | **已完成 `e965e3e5`**        | 已按此处建议落地：`RETIRED_ROUTE_PREFIXES` **从 registry 的 `tier` 派生**，`getTabPages` 丢弃指向退役段的标签页，并把 `activeTabId` 从悬空 id 移到剩下的标签上。（§5 表头提到的 `RETIRED_PRODUCT_SEGMENTS` 是 `bbd6ead3` 里的名字，本分支用同一做法、不同命名。）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2   | 「管理记忆」按钮仍跳退役页                                        | `src/features/Settings/memory/features/ManageMemoryButton.tsx:22`                                                                                                                                                    | **已完成 `99528daa`**        | 该按钮**保留**并改指 `/memory/preferences`：它是设置页进入管理器的入口，不是浏览入口，§6.3 要求保留受控路径。`/memory` 索引改为重定向到该路由，旧深链接不再落空。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 3   | FTS 搜索结果跳退役页                                              | `src/features/CommandMenu/SearchResults.tsx:165`（另见 :209、:250）                                                                                                                                                  | **已完成 `99528daa`**        | 搜索结果与 `memory` 作用域**保留并指回** `/memory/preferences`（该层是本轮唯一存活的记忆页面）；`queryParser.test.ts` 改为从 `VALID_TYPES` 派生，不再手抄一份。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 4   | 死字段 `NavigationRoute.electronKey`                              | `packages/app-config/src/routes/index.ts:35`，10 条目各填一次，定义外零读取                                                                                                                                          | **已完成 `0a4f0b05`**        | 连带本分支新增的 `navigation.project` 文案目前只喂这个死字段。**注意 `navigation.*` 命名空间本身没死**（`AgentTasks/routeMeta.ts:15` 等仍在用）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 5   | 死枚举 `GroupKey.Community` / `GroupKey.Pages`                    | `src/features/HomeSidebar/Body/index.tsx:35,36`                                                                                                                                                                      | **已完成 `0a4f0b05`**        | 零消费者                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 6   | 死枚举 `SidebarTabKey.Community / Image / Memory / Pages / Video` | `src/store/global/initialState.ts`                                                                                                                                                                                   | **已完成 `0a4f0b05`**        | 除定义外引用数均为 0；另确认全仓无 `Object.values(SidebarTabKey)` 一类动态读取                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 7   | 变死的 feature flag `showMarket`                                  | `packages/app-config/src/featureFlags/schema.ts:156`                                                                                                                                                                 | **决定不删**                 | ⚠️ 与 4–6 不同：它不是零消费者的死标识，而是 `evaluateFeatureFlag(config.market, userId)` 派生的**服务端配置契约**，且 `schema.test.ts` 把它当作「一个普通 flag」的样本用于测试通用覆盖机制 —— 删它需要改测试样本值，属于方案 §15 禁止的「为绿灯动测试」。保留成本是一个派生布尔。原「唯一 UI 消费者」判断： `useNavLayout` 与移动 NavBar，本分支删掉后全仓已无非测试消费者                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 8   | `missingBottom` 分支不可达                                        | `src/store/global/selectors/systemStatus.ts`（`withAllKnownKeys` 内）                                                                                                                                                | **已由 `b017069b` 变为可达** | S50.1 把 `resource` 放进 bottom 组后，`DEFAULT_BOTTOM_KEYS` 不再为空集；注释已同步改写为「`resource` 就是当前走这条分支的条目」                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 9   | 退役 eval 的 nav 骨架形状                                         | `src/components/Skeleton/NavPanel/SideBar.tsx`（`NAV_SKELETON_SHAPES`）                                                                                                                                              | **已完成 `dba4287d`**        | eval 退役时其 nav key 一并离开 `resolveNavPanelKey`，`eval` / `evalBench` 均不可达（后者全仓零引用）。`image` / `video` 特意保留 —— resolver 仍会为陈旧深链接返回这两个 key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 10  | **产物缺运行级追溯**                                              | `packages/database/src/schemas/task.ts:203`；`apps/server/src/services/toolExecution/serverRuntimes/agentDocuments.ts`                                                                                               | **S80（服务端）**            | §8 要求「至少能够从产物追溯到任务 /**具体运行**」。库里 run 级关联只有 `topic_documents` 与 `work_versions.rootOperationId`；`context.topicId` 可取，故生产者可复用既有表（零新增表），但 `topic_documents` 目前**无任何读取者**，只补生产者等于造一张没人读的表 —— 必须生产者 + 读取者 + UI 三件一起落地                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 11  | **`pinToTask` 在成功信号之外调用**                                | `agentDocuments.ts:105-122`（`pinToTask`）与其四处调用点                                                                                                                                                             | **S80（服务端）**            | `withDocumentOutcome` 在 operation 成功时先发 `status: 'succeeded'`，`pinToTask` 在其**之后**运行；pin 抛错时产物 outcome 已记成功、随后工具调用抛给 agent，库里留一份无关联的文件且信号自相矛盾。修法不能只 catch（`pinDocument` 的 `.onConflictDoNothing()` 与 Work 注册的 `catch { log }` 已经在静默失败），要按 §8 给出「文件已生成但关联失败」+ **只重挂不重生成**的恢复动作                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 12  | **删除底层文档无引用保护**                                        | `src/services/resource/index.ts:264`（`deleteResource`）；`packages/database/src/schemas/task.ts:210-212`（cascade）                                                                                                 | **S80（服务端）**            | 从资源库删文档会 cascade 静默摘掉所有任务上的产物引用，全仓无引用计数、无二次确认。§8 要求「物理删除继续遵守既有权限和引用保护」                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 13  | 项目产物列表按协调者而非按项目过滤                                | `src/features/Projects/Workspace/ProjectDashboard.tsx:148-157`（`originAgentId`）                                                                                                                                    | **已完成 `a870f37e`**        | 诊断**更正**：不只是「过滤字段选错」。`works` 表**没有** project 列，项目关联只存在于 `project_works`（多对多），而卡片要的是 `WorkSummaryItem`（带服务端从 `work_versions` 组装的 `event` / `totalCost`），原始行给不出 —— 所以不能改成读 `project_works` 的裸行。最终在既有 `listByWorkspace` 上加 `projectId` 过滤（`exists` 子查询，保住行形状、keyset 游标与 limit；换 inner join 会让 limit 数成 join 匹配数）。另查明 `project.detail` **本就返回** `works`（`apps/server/src/routers/lambda/project.ts:153-161` → `projectModel.listWorks`），全仓**零消费者** —— 卡片当初另查一个端点，而不是用它。附带修掉了「协调者为空时 SWR key 为 null、干脆不请求」这条路径。测试：PGlite 下 4 个新用例（过滤 / 一 Work 挂两项目 / 分页穿透过滤 / 无绑定 + 跨用户 projectId 返回空），客户端 4 项且其中 2 项**已验证对 HEAD 版本失败**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 14  | `project_working_directories` 零消费者                            | `packages/database/src/schemas/project.ts:105`                                                                                                                                                                       | 不清理（观察）               | 表已建但只有 `topic.ts:43` 一个 FK 引用，无 model /router/service 写入。§12 的规矩是本轮不自动清库，故只记录；它也不在本分支新增                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 15  | 残留错误注释 “Bind a goal entity”                                 | `src/services/task.ts:125`；`src/store/task/slices/detail/action.ts:296`                                                                                                                                             | **已完成 `3126df0d`**        | 复核时发现同一句注释共 **4 处**，性质分两类：①`src/services/task.ts` 与 `src/store/task/slices/detail/action.ts` 是纯孤儿注释（后者甚至挂在 `instruction` 上，该类型里连 `identifierPrefix` 都没有）—— 前者改为描述 `identifierPrefix` 的真实契约（`PREFIX-1`，服务端默认 `T`），后者删除；②`apps/server/src/services/toolExecution/serverRuntimes/task.ts` 的注释**描述了一个真实存在的字段** `goal?: {...}`，但该字段**不可达**：`createTaskImpl` 向 `TaskService.createTask` 传的是显式字段清单（其中没有 `goal`），manifest 的 `createTask` 参数也没暴露 `goal`，全文件除声明外零读取 —— 即类型向读者与工具作者宣称了一个不存在的能力，故删除字段与注释。`packages/builtin-tool-task/src/client/executor/index.ts` 同类孤儿注释一并删除（该包 7 文件 45 项测试通过，其中 `manifest.test.ts` / `systemRole.test.ts` 正是「goal 编排不属于任务工具范围」这条既有契约）。**Goal 编排本身未动**                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 16  | ~~渠道平台的 Coming Soon 卡~~ **分类更正**                        | `src/routes/(main)/agent/channel/const.ts:41-64`、`index.tsx:85-89`、`list.tsx:244`                                                                                                                                  | **已核实为非靶点**           | 复核后否掉了我原先的判断：`comingSoon` 是个**真实功能态**而不是营销占位 —— 它决定平台排序、`enableImessage` lab 开关会切换它、详情页据此渲染说明页而非配置表单。这正是 §10 要求**保留**的「真实能力不可用的解释」。真正的靶点是**点了没反应的项**，见 §2.8 的 i18n 清理（`f03a0da6`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 17  | 设置分组未按方案的能力维度重排                                    | `src/features/Settings/hooks/useCategory.tsx`（桌面个人，6 组）；`src/routes/(mobile)/me/settings/features/useCategory.tsx`（移动个人，5 组）；`src/features/WorkspaceSetting/hooks/useCategory.tsx`（工作区，6 组） | **已完成 `3242086a`**        | 诊断：现有分组是**按受众 / 层级**（个人 / 订阅 / 开发者），方案要**按能力**（渠道 / 用量 / 安全 / 数据），这是真实差异。工作区那套已经有「工作区（含 Members）」与「Admin（AuditLog）」符合方案词汇，**不动**；要改的是两个「个人」面。已定映射：①账户与外观 = Profile/Appearance/Hotkey ②通知与渠道 = Messenger/Notification（导航同组、各自的 token 所有人 / 作用域 / 服务端权限不合并，§10 明文要求）③执行环境与 Agent = Provider/ServiceModel/Memory/Proxy/SystemTools ④工具、技能与连接器 = Skill/Connector/Labels/OAuthApps ⑤用量与成本 = Stats/Usage/Plans/Credits/Billing/Referral ⑥安全、权限与审计 = Creds/APIKey（顺带消掉现在 **APIKey 重复出现两次**：一处受 `showApiKeyManage`、一处受 `isDevMode`）⑦数据管理 = Storage/Devices ⑧开发者 = Advanced/Labs/About。实施时的三点修正：①设置侧栏折叠面板的默认展开列表原本**手写六个旧分组 key**，重排会让五个新分组默认折叠并因引用已删枚举而编译失败 —— 改为从分组派生；②`SettingsSearch` 里那条「同一 tab 只索引首次出现」的守卫保留（它是 `visibleTabs` 的承重逻辑），只改掉注释里已失效的例子；③搜索结果 id 内嵌分组键（`tab-<group>-<tab>`）且是上报产品分析的 `result_key`，故这些 id 随改名变化 —— 用户不可见、数据可见，已在 §2.8 记录。两个编码旧分组的测试按新语义**重写**，并新增「同一 tab 不得出现在两个分组」的回归测试（已实测对 HEAD 版本失败） |
| 18  | Agent 配置里的「规则与经验」入口                                  | `src/features/AgentSetting/AgentRules/`                                                                                                                                                                              | **已完成 `73102849`**        | 新增 `ChatSettingsTabs.Rules` 与「规则与经验」tab，受 `enableSelfLearning` 门控；四处注册点（枚举 / 弹层 tab 列表与可用性 / 移动与侧栏列表 / 内容分发）同步改动。刻意**不做成第二个编辑器** —— 读改停用仍在 `/agent/:aid/self-evolving` 上，避免同一 lesson 出现两条写路径                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 19  | 服务端死能力（零消费者，勿在无服务端环境删）                      | `expertiseBindings.enabled`；`expertiseInsights`；`expertise.listLessons`；`actorsByDomain` / `listRuns`                                                                                                             | S80（仅记录）                | 与 §2.7 的成熟度死数据同源：schema 与索引齐备但无生产者。§10 要求「确认无消费者后才移除」，而这几处需要服务端与 CLI 侧一并核验                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### 6. 复核时新发现（未修）

**`setting` 命名空间有一批 key 名被全局改名改坏了**：默认源里是 `storage.actions.copyOrvilo AI.button`（key 里带空格和 “Orvilo AI”），而 en-US /zh-CN 里是 `copyLobeAI.*`。也就是说这些 key 在英文下**根本解析不到**。它不是本轮引入的，而是一次把 “Lobe” 全局替换成 “Orvilo” 时连 key 名一起替换的结果。成因清楚但**影响面未测**（同类残留可能不止这一簇），所以只记录：修它要先枚举 `default/` 里所有含空格或 “Orvilo AI” 的 key，再对照两个 JSON 逐个对齐。
