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
>
> **补充（2026-09-16 收口）**：两者都已执行完 —— S30.2 是 `e965e3e5`，S30.4 是 `aaec4243`
> 加残留清理 `cc3b9489`。本机可跑的那部分证据（扇入扇出 grep、邻近单测）都已跑过并记在上表；
> 上面这条缺口指的是**服务端进程内调用链**，那部分仍然只能由 GHA 提供，故 S30 的验证状态是
> `CI_PENDING` 而不是 `REVIEW_APPROVED`。

### 1.7 各功能域清单（2026-09-16 收口，实测填写）

按方案 §3 的分类词表登记。S30 / S60 / S70 已执行完毕，故这里登记的是**实测结果**
而非预判；社区 / 文稿一项是范围外。

#### 1.7.1 社区 / 文稿残留（S30.1）—— 范围外，不登记

用户 2026-09-16 裁决（§0.3）：该项由另一个 Agent 负责，本分支不实施、不清理其残留。
因此**不做清单**，也不计入 S80 验收。重叠文件与对账方式见 §0.3。

#### 1.7.2 个人画像（S30.3 / S20 L212）—— 首页画像已移除

| 项                                    | 规模              | 分类                        | 证据 / 说明                                                                                                                                                        |
| ------------------------------------- | ----------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 画像浏览层（已退役）                  | 53 文件 / 3249 行 | `DELETE_UI`                 | `99528daa`                                                                                                                                                         |
| `HomePortrait.tsx`                    | 60 行             | ✅ **已删**                 | 方案 §5（S20）L212 明文：「移除 `HomePortrait`、`PortraitBubble`、仅用于形象的 framing/styles，以及已经无消费者的首页装饰 / 布局预设」                             |
| `PortraitBubble/`                     | 65 行             | ✅ **已删**                 | 同上；裁决表 L60：「首页大型角色形象、气泡、装饰预设 \| 删除 \| 小头像、Agent 身份显示、执行状态提示保留」                                                         |
| `GreetingLine.tsx` + `welcomeText.ts` | 159 行            | ✅ **已删**                 | 前者零消费者（只被 `PortraitBubble` 渲染），后者只被前者与其自身测试使用 —— 即 L212 所说的「已经无消费者的首页装饰」                                               |
| `showHomePortrait` 偏好               | 6 文件            | ✅ **已删**                 | `initialState.ts` / `systemStatus.ts` selector / `CustomizeModal` 的 defaults、preset、toggle 行与 UI 一并移除                                                     |
| `portraitFraming.ts`                  | → 1 常量          | **不可整删，已裁剪**        | `HOME_PORTRAIT_VISIBLE_RATIO` 被**活跃**的 `ArtworkStudio/Content.tsx:37,271,591` 使用（经 `AgentProfileArtwork` 打开）；方案退役的是**首页**画像，不是 agent 画像 |
| `CustomizeModal/`                     | 其余保留          | `KEEP_SHARED`               | 开关的是「首页显示什么」，与画像本体不同寿                                                                                                                         |
| `dashboard.greeting.subtitle`         | 1 键              | ✅ **已删**（3 处手维护源） | 随 `GreetingLine` 一起失去消费者；另 16 个机器翻译 locale 按 AGENTS.md 留给每日 `auto-i18n`                                                                        |

**收敛时踩过的一个判断错误（留档）**：本项先前被标成 `KEEP_SHARED`（暂留），理由写的是
「Electron 每标签页内容是 `HomeLayout + Home`，所以删它必须改 Electron 落地面」。**两条都不对**：
方案明写要删，而删它们**不需要**删 `features/Home` 或改 Electron 的落地面 —— 它们是 `Home` 页面里的子组件。
真正的闸门是那组为画像预留 lane 的布局常量（见 §2.2.1）。

**折叠几何的重推（这次做了，取值不是猜的）**：`COLLAPSED_CONTENT_GAIN` 原本**定义为** `PORTRAIT_LANE`，
即「侧栏收起时，内容只取回画像那条 lane」。画像没了，腾出的轨道就该整个归内容：
`GAIN = RAIL_RECLAIMED_WIDTH`、`OFFSET = 0`。偏移归零后 `heroCollapsed` 的 `translateX(0)` 与
`hero` 的 `width: calc(100% - 0px)` 都成空操作，故删除而不是留成死 CSS。

**两处连带后果（已记录，其中一处是产品待办）**：

- `useHomePromoLine`（`src/business/client/features/useHomePromoLine.ts`，OSS 默认返回 `undefined`、由云端覆盖）
  在本仓**唯一消费者就是 `PortraitBubble`**。**保留该槽位文件**（它是业务契约，与 §2.5 里
  `src/services/agentShare.ts` 同一类：删了可能打断云端构建，而本机无法验证），但其返回的推广语已**无处渲染**。
- `ArtworkStudio` 那个虚线「65%」取景预览，注释写的是「首页实际会显示多大比例的角色」—— 首页已不再画角色，
  所以它现在**承诺了一件不再发生的事**。属产品待办，未动（§0.1 保护 ArtworkStudio 链路）。

**一处用户可见的行为变化（非纯删除，需知悉）**：`matchesPreset` 原先比较 `hiddenWidgets` **和** `showPortrait`。
去掉后者后：存量为「未隐藏任何 widget + 画像关闭」的用户，原先**匹配不上任何预设**（预设条不显示），现在会落到 `full`；
「全部隐藏 + 画像打开」现在落到 `minimal`。三种预设本身仍仅靠 `hiddenWidgets` 可区分，没有塌陷。

**仍未验证**：新折叠几何在真实 Electron 开屏页上的观感。本机无渲染手段，属 §13.1 的 S80。

#### 1.7.3 通用评测（S30.4）

\| `agentEvalRun` service 与 workflows | `KEEP_SHARED` | `apps/server/src/services/agentEvalRun/`、`apps/server/src/router-hono/workflows/agent-eval-run/` |
\| `ragEvalKeys` / `ragEvalService` | `KEEP_SHARED` | 消费者是 `src/store/library/slices/ragEval/` |

> **这才是「哪些能删」的判据 —— 结构性差别，不是目录名**：通用评测有**独立的顶层 store**
> （`src/store/eval`，20 文件），而它在本仓唯一的树外消费者是登出重置表
> `src/store/utils/userDataStores.ts` 的一行，即「一个没人观察、只被 `reset()` 的 store」。
> RAG 评测则是 `library` store 内的一个 slice（`store/library/slices/ragEval/`），
> 与资源同寿，所以随资源保留。**判据是「有没有独立生命周期」，不是名字里有没有 eval。**

#### 1.7.4 公共访客分享（S30.5）

| 项                              | 分类            | 证据 / 说明                                                                                                                            |
| ------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| agent 分享创建（服务端）        | `STOP_PRODUCER` | `c95f9ba6`：`assertAgentShareCreationEnabled()` 无条件抛错                                                                             |
| agent 分享访客执行（服务端）    | `STOP_PRODUCER` | 同上：`assertAgentShareVisitorExecutionEnabled()`；两个拒绝**都不读开关**（§6.5）                                                      |
| 收口点完备性                    | 已证            | `shareGate` 全仓**只有一处构造**（`shareChat.ts:268`），`startOperation.ts:141` 由它派生 → 门住 `execAgent` 即可证完备                 |
| `src/services/agentShare.ts`    | `KEEP_COMPAT`   | 53 行 router 客户端绑定；本仓零消费者，但消费者是**云端业务实现**提供的发布 / 撤销 UI，删了会打断那个构建，本机无法验证 —— 判据见 §2.5 |
| `ShareShell`                    | `KEEP_SHARED`   | **不是零消费者**：`apps/share/src/features/topic/SharedTopicView.tsx:54` 在用，是公开分享应用的共用外壳                                |
| 主题 / 页面 / 产物 三类公开分享 | `KEEP_SHARED`   | `apps/share` 路由表只有 `share/t/:id`、`share/page/:id`、`share/artifact/:id` 三条                                                     |
| `apps/share`（65 文件）         | `KEEP_SHARED`   | **该应用内零 agent 分享面**：`grep -i agent` 在 `apps/share` 无命中，路由表里也没有 agent 路由                                         |

> **方案在这里是保护 `apps/share` 的，别误读成删除对象。** §6.5 L295 逐字：
> 「**不得删除整个 `apps/share` 或通用共享身份系统**；先区分任务链接、产物只读分享、团队邀请和公开可交互 Agent。」
> L622 又把「直接删除 `apps/share`、`ResourceManager`、`generation*`、`memory*`、`document*` 或任意整个包
> 而没有消费者证据」列为**禁止捷径**。实测印证了这条：`apps/share` 的目录内**零 agent 分享面**，
> 它服务的是主题 / 页面 / 产物三类公开分享，与本轮要退役的 agent 分享是两回事。
> 本轮只收口 agent 分享分支。
> （`execAgent` 函数体、`shareGate.ts`、`AgentRuntime` 访客分支属云端侧，见 §2.5。）

#### 1.7.5 Goal（S60.1）与规则 / 经验（S60.2）

| 项                                         | 规模             | 分类          | 说明                                                        |
| ------------------------------------------ | ---------------- | ------------- | ----------------------------------------------------------- |
| `src/features/Portal/GoalMetric/`          | 2 文件 / 561 行  | `KEEP_SHARED` | 目标度量已挂在对话侧栏 Portal（`Body.tsx` 541 行）          |
| `src/features/Portal/GoalNode/`            | 2 文件 / 305 行  | `KEEP_SHARED` | 同上                                                        |
| `HomeInbox/homeGoals.ts` + `GoalsRailCard` | 296 行           | `KEEP_SHARED` | 收件箱 rail 卡片                                            |
| `src/features/SelfLearning/`               | 19 文件 / 583 行 | `KEEP_SHARED` | 规则 / 经验面已下沉；`LegacyRouteRedirect.tsx` 是旧路由兼容 |

两者在 S60 实施期的审计结论均为**已满足**（非待办），见 §2.7。

#### 1.7.6 设置分组与渠道（S70）

| 项         | 分类          | 证据 / 说明                                                                                                                                    |
| ---------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 分组枚举   | 已重构        | `3242086a`：`SettingsGroupKey` 八组 —— Account / Agent / Channels / Data / Developer / Security / Tools / UsageAndCost，单一数组字面量直接返回 |
| 渠道分组   | `KEEP_SHARED` | `src/features/Settings/hooks/useCategory.tsx:144` 的 `Channels` 组 = 用户自己的信使绑定与通知，与「资源渠道」不是一回事                        |
| 移动端分组 | 7 组          | `src/routes/(mobile)/me/settings/features/useCategory.tsx`，无 `Channels`                                                                      |

---

## 2. 工作包状态

| 工作包                   | 实现状态     | 验证状态         | commit / 证据                                                     | 保留依赖 / 阻塞                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |     |     |
| ------------------------ | ------------ | ---------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --- |
| S00 基线与依赖清单       | IMPLEMENTED  | NOT\_RUN         | 本文 §1.7                                                         | 清单已按功能域填齐（2026-09-16）；纯清单，无需运行时验证。S30.1 社区 / 文稿属范围外，见 §1.7.1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |     |     |
| S10 统一入口与偏好迁移   | IMPLEMENTED  | REVIEW\_APPROVED | `e66656d4` `440f1bc2` `880af5de`                                  | review 通过；本机 550+ 项测试通过；待 CI 类型检查；跟进项已挂工作包见 §5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |     |     |
| S20 默认看板、旧首页卸载 | IN\_PROGRESS | CI\_PENDING      | `fb1a52a6` `e2011272` `a538be19`                                  | **已完成**：默认看板、Web 落地任务列表、**Web 侧卸载 Home**、**收件箱薄路由 `/inbox`**（§2.2）、**首页画像移除**（`HomePortrait`/`PortraitBubble`/`GreetingLine` 与 `showHomePortrait` 偏好，§1.7.2）、**落点核对**（登录深链接优先已满足 NAV-07，§2.2.2）。**未完成的三项如下（①② 已于 2026-09-16 决定并落地）**：①Electron 登录与 Onboarding 落点 —— **已决定并实施**：`DEFAULT_HOME_MODE` 改 `task`，裸落地与 `?onboarding=task` 不再矛盾；我先前否决它的论据来自我自己 stub 发明的假耦合，已更正（§2.2.2）。②`/inbox` 与通知 modal —— **已决定：并存不改**；"名称撞车" 经核实不成立（en-US 分别是 Inbox 与 Notifications），通知面本就不挂 Home、无需 "抽出"，方案那句的落点是可达性且已满足（§2.2）。③`TopicChatDrawer` 重复宿主**已按做法②修复**并有渲染计数证据，但真实界面只出现一层仍待真机；`AcceptancePortalDrawer` 的内容重复**已证实触发路径**（产品自己的 "在面板里打开验收" 同时展开面板并推入验收视图），但四种修法各有具体障碍、未实现；④折叠几何与 Electron 开屏观感（S80） |     |     |
| S30 独立功能退役         | IMPLEMENTED  | CI\_PENDING      | `e965e3e5` `99528daa` `aaec4243` `c95f9ba6` `cc3b9489`            | S30.5 的服务端收口已完成（可证完备的单一收口点）；agent 分享的访客页不在本仓，属云端侧。**`apps/share` 按 §6.5 L295 明文保留**（它只服务主题 / 页面 / 产物三类分享，目录内零 agent 分享面），见 §1.7.4 与 §2.5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |     |     |
| S40 自动化整合           | IMPLEMENTED  | CI\_PENDING      | `03d606a0` `c27ab198` `f4605a81`                                  | 数据层已统一、名称已改「自动化」，视图合并与方案 §7 的 5 项能力两个入口都有；入口按 §2.3 的可验证理由保留 `/automations`（`useActiveTabKey` 只取 pathname 第一段、不读 query，改成 `/tasks?collection=scheduled` 会让该导航项永远不会高亮，见 §2.3）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |     |     |
| S50 资源与产物归位       | IMPLEMENTED  | CI\_PENDING      | `b017069b` `2957b55b` `a870f37e` `263ebf78` `15d06a28` `ee076357` | 四项全部完成并在本机验证（PGlite + `bunx tsc`）；运行级追溯复用既有 `works.originTopicId`，**零新增表**，见 §2.6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |     |     |
| S60 Goal 与规则下沉      | IMPLEMENTED  | CI\_PENDING      | `23751be7` `7c565528` `3126df0d`                                  | Goal 与详情 / 对话关联两侧经审计均为**已满足**（非待办）；规则面已下沉，见 §2.7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |     |     |
| S70 设置、文案与依赖清理 | IMPLEMENTED  | CI\_PENDING      | `2d9ee3a6` `3242086a`                                             | 文案、死代码、统计页与设置分组已做；Onboarding 文案属另一 agent 的在途改动（§0.3），见 §2.8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |     |     |
| S80 远端验收与证据       | TODO         | NOT\_RUN         | —                                                                 | 覆盖全部                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |     |     |

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

4. **旧 Home 目录仍不能删。** Electron 的 index 槽仍注入 `DesktopHomeRoute`，它包着
   `HomeLayout + Home`。删掉 `features/Home` 会**直接打掉每个 Electron 标签页的开屏内容**。

   ⚠️ **但这与「能不能删 `HomePortrait` / `PortraitBubble`」是两件事，前一版把它们混为一谈了。**
   原稿写「因此 `HomePortrait` / `PortraitBubble` 的删除不是推迟，而是当前不可达」——**错的**：
   方案 §S20 明文要求移除这两个组件，而它们是 `Home` 页面里的**子组件**，删它们既不需要删目录、
   也不需要改 Electron 的落地面。真正的闸门是那组为画像预留 lane 的布局常量 —— **已按 §1.7.2 的重推完成移除**。

⚠️ **S20 的真实缺口不是「旧首页没删」，而是「收件箱在 Web 上不可达」—— 本分支引入的功能回退**

这一点原先没被记录，复核时才查清，且比状态行里写的「旧首页卸载未做」严重：后者是美观问题，前者是**能力丢失**。

证据链（三跳，每一跳都可在代码里核对）：

1. Web 的索引槽现在是 `WebHomeRedirect`（`src/spa/router/desktopRouter.config.tsx:21`），`/` 跳 `/tasks`；
   `DesktopHomeRoute` 只被 **Electron** 适配器引用（`desktopRouter.config.desktop.tsx:18`）。
2. `src/routes/(main)/home` **没有任何路由注册** —— 共享路由与 Web 适配器里都搜不到（`navigation.home` 只是标题 key）。
   所以 Web 上没有任何路径会渲染 `features/Home`。
3. 简报 UI（`features/DailyBrief/*`）**只**被 `HomeInbox` 消费，而 `HomeInbox` **只**被 Home 渲染
   （`Home/HomeModeContent.tsx:541,549,617`、`Home/index.tsx:428`）。

结论：Web 上**简报（执行简报）与「需要你处理」两类信息没有任何入口**；侧栏那个 `InboxModal`
（`HomeSidebar/Header/components/InboxModal`）只覆盖**通知**与**待处理转移**，不含简报，也不含未读话题。

**但「未读话题也不可达」这句要收窄（2026-09-16 复核，原先写过头了）** —— 未读状态在 Web 上**仍有两条存活路径**，
丢的是**聚合视图**而不是**未读感知本身**：

| 存活路径          | 证据                                                                                                                 | 覆盖到什么                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 侧栏 agent 行徽标 | `HomeSidebar/Body/Agent/List/AgentItem/index.tsx:86-89`（服务端按 `topics.status==='unread'` 算好）+ `:172-178` 渲染 | 「哪个 agent 有未读、有几条」；agent 手风琴在 Web 恒可见 |
| 会话侧栏未读圆点  | `AgentSidebar/Topic/List/Item/index.tsx:325`（`hasUnread`）+ `:433` 渲染 `<UnreadDot/>`                              | 点进 agent 后逐条话题的未读                              |

所以准确的说法是：**没有「未读话题的聚合收件箱」**，而不是「未读话题不可达」。这一点影响修法的优先级 ——
它把 A / B 两个选项从「恢复丢失的能力」降级为「恢复聚合入口」。侧栏 `Recents` 也在（`HomeSidebar/Body/index.tsx:44,52-57`），
但它**不带未读状态**（`Home/Recents/*` 无 unread 引用）。

方案 §5 的「收件箱迁移」要求的正是这件事：「优先从现有 `HomeInbox`、简报、审批和通知组件抽出可独立挂载的能力，
**建立薄路由或接入等价现有路由**」，并且特意警告「旧首页的 `news` 可能是执行简报，**不得仅凭名字当作新闻推荐删除**」。
本轮 Web 首页改动完成了「默认进入任务页」，但没有完成这一步。

**已排除一条看似便宜的错路（复核得出，写下来免得下一个人再试）**：
「把 `(main)/home` 注册成 Web 可达路由，让旧页面复活」**结构性不可行**。
`features/HomeLayout` 是**根路径专属布局**：`if (!hasActivated) return null;`，而
`hasActivated` 只在 `pathname === '/' || '/{slug}'` 时为真（`HomeLayout/index.tsx:19-22,36`）。
挂在 `/home` 会直接渲染 `null`。

**但这同时说明「薄路由」是可行的**：`HomeLayout` **不提供任何 context**（`createContext` 计数为 0），
而 `Home` 页面与 `HomeInbox` 都不依赖它 —— 所以 `HomeInbox` 可以挂在正常的 `(main)/_layout` 下，
不需要那个根布局。按方案的措辞（「抽出可独立挂载的能力」而不是搬整个旧首页），应当只挂**收件箱这一项能力**，
而不是把 Home 的其余区块（composer、定时任务、最近访问、画像）一并带回。

**两条候选修法 —— A 已实现（2026-09-16）**：

| 选项              | 做法                                                                                                                                                               | 结论                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| A. 薄路由         | 注册一条 Web 可达的收件箱路由，渲染既有的 `HomeInbox`（它本来就是可挂载组件，`variant` 有三个值 `'default' \| 'main' \| 'rail'`，**不需要任何 context provider**） | ✅ **已做**，见下方「已实现」。遗留一处见「仍未解决」                                                                         |
| B. 并入侧栏收件箱 | 把 `HomeInbox` 的简报与未读话题接进既有 `InboxModal`                                                                                                               | ❌ **未采用**：该 modal 有自己的列表架构（`useNotificationList` + 分类 + 游标），合并要避免**第二份未读状态** —— 方案明文禁止 |

**已实现（A）**：新增 `/inbox`，注册在**共享路由树**里，因此 Web 与 Electron 两侧都有；
工作区镜像 `/:workspaceSlug/inbox` 也自动存在（`desktopRouter.shared.tsx` 的工作区树展开的是 `...sharedMainAreaChildren`）。

| 文件                                         | 内容                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/features/HomeInbox/InboxPage.tsx`（新） | `NavHeader` + `WideScreenContainer` + `<HomeInbox inlineRail variant={'main'} emptyState={…} />` |
| `src/features/HomeInbox/routeMeta.ts`（新）  | `inboxRouteMeta`：`InboxIcon` + `createSurfaceSkeleton('list')` + `titleKey: 'navigation.inbox'` |
| `src/routes/(main)/inbox/index.tsx`（新）    | 薄段文件，只 re-export                                                                           |
| `desktopRouter.shared.tsx`                   | 注册 `/inbox`（`preloadId: 'inbox'`），紧邻 `/tasks`                                             |
| `navigation.inbox` 文案                      | 三处齐（源 + en-US + zh-CN）。注意 `titleKey` 走 `electron` 命名空间（`RouteMetaBridge.tsx:56`） |

**⚠️ 这一页第一次上线时是坏的，`d65da04d` 修好了它 —— 记下来因为它是自检失效的典型。**
首版写成 `<HomeInbox variant={'main'} />`，**漏了 `inlineRail`**。而
`ownsRailSections = variant !== 'main' || Boolean(inlineRail)`，于是 goals / **每日简报** /usage
三段既不取数也不渲染 —— 正是本次要恢复的「简报」，在修好之前**仍不可达**，且所有 prop 看上去都合理。
**测试为什么没拦住**：它 mock 掉了 `HomeInbox`，只断言 `variant === 'main'` —— 恰好就是出 bug 的那组合，
等于把缺陷钉成了期望行为。现已改为断言**真实谓词** `ownsRailSections(props)`，反向验证过：去掉 `inlineRail` 即精确变红。
第二条同类问题：`HomeInbox` 在空主列时 `return null`（在首页合理，因为周围有输入区与推荐），
在 `/inbox` 这条独立路由上就是「标题压空列」。故给 `HomeInbox` 加了可选 `emptyState`（仅主列用），本页传 `home:inbox.empty.*`。

**⚠️ 第三处同类失效，且是本轮刚发现的（2026-09-16，`?` 之前一直没被发现）**：`/inbox` **漏在
`RESERVED_FIRST_SEGMENTS` 之外**（`src/features/Workspace/useWorkspaceUrlSync.ts`）。
那张表的注释一直写着「Kept in sync with `sharedMainAreaChildren` (paths) … **If you add a new root
path segment, add it here too**」，但**没有任何东西强制执行它** —— 我加 `/inbox` 时就没照做。
后果：`isWorkspaceSlugCandidatePath('/inbox')` 为真，于是 `useWorkspaceUrlSync` 走 slug 分支、
`workspaces.find(w => w.slug === 'inbox')` 落空、**直接 return 不动 store** ——
即访问 `/inbox` 时**不会像 `/tasks` 那样切回个人上下文**。
（页面本身仍能渲染：react-router 里静态段 `/inbox` 优先于 `:workspaceSlug`，所以不是 404。）

**修法不是补一个词，而是把那条散文指令变成可执行的守卫** —— 新增
`src/features/Workspace/__tests__/reservedSegments.test.ts`，从 `createMainAreaChildren()` 读出
所有静态顶层段并与保留表求差。它一次就报出 **5 个漂移**：`agents`、`automations`、`goal`、`inbox`、`project`。

⚠️ **这个守卫的第一版自己是空的**：它用 `.map(r => r.path)` 只看外层条目，
于是漏掉了挂在**无 `path` 包装项**下的段 —— 它报了 `agents`/`project`/`automations`，**却对 `/inbox` 只字不提**，
而 `/inbox` 正是写这个守卫的原因。改成递归下钻无 path 包装后才报全。
记下来是因为「带盲点的检查比没有检查更糟」：它读起来像通过。
两个断言（顶层段 > 5、差集为空）互为前提，反向验证过：把 `'inbox'` 从表里拿掉，守卫精确点名 `["inbox"]`。

**仍未解决（明确记录，不是「以后再说」）**：`HomeInbox` 读 `systemStatusSelectors.hiddenHomeWidgets`，
而唯一**写**它的 UI 是 `CustomizeButton`，其挂载链是
`CustomizeButton` → `Home/HomeNavHeader.tsx:43` → `routes/(main)/home/index.tsx`，
而后者的**唯一引用者是** `src/spa/router/DesktopHomeRoute.tsx:3` —— 纯 Electron 模块；
Web 侧该 index 元素被 `createHomeElement: () => <WebHomeRedirect />` 取代。
故在 Web 上这个偏好**没有任何写入者**。

**但影响面比看上去小得多，先量准再谈修法。** 本次核对逐条查了 `HomeInbox` 内各区块的门控，
受该偏好影响的**只有两处可选内容**：

| 区块                      | 实际门控                                                       | 受偏好影响 |
| ------------------------- | -------------------------------------------------------------- | ---------- |
| briefs / unread / running | 始终取数，由 `hide*` props 控制                                | 否         |
| news（每日简报）          | `showRailSections` + `isLogin`                                 | 否         |
| goals                     | `showRailSections` + lab 开关                                  | 否         |
| suggestions               | `useRecommendationsVisible()` → `Recommendations/index.tsx:26` | **是**     |
| usage                     | `HomeInbox/index.tsx:206`                                      | **是**     |

即旧用户若隐藏过 `suggestions` 或 `usage`，在 Web 的 `/inbox` 上会看不到这两块，且改不了。
**不会**出现「选过 `minimal` 就看空页」—— 简报、未读、运行、每日简报都不由该偏好门控。

**为什么不顺手把 `CustomizeButton` 搬过来**：`HOME_COUNT_*` 两个控件（recents /tasks 数量）
经核对**只被 `HomeModeContent.tsx:369/414/467` 消费**，`/inbox` 根本不用。把整个首页自定义面板挂到本页，
等于摆出两个在本页毫无作用的控件 —— 与 §1.7.2 记的 `ArtworkStudio` 那段「65% 虚线框在承诺一件不再发生的事」同类。
真正干净的修法是让 `HomeInbox` / `useRecommendationsVisible` 不再直读全局偏好、改由宿主传入，
但这要同时动 `features/HomeInbox` 与 `features/Recommendations`，且本机没有前端类型检查器兜底；
在影响面只有两块可选内容、且「尊重用户偏好」本身可辩的情况下，不做重构、按低严重度挂跟进项更相称。

**入口方面的取舍（有意为之）**：本包只建立路由，**没有新增导航项** —— 方案该处的措辞是「建立薄路由或接入等价现有路由」，
导航条目的归属是 S10；且改 `DEFAULT_SIDEBAR_ITEMS` 只影响新用户（`withAllKnownKeys` 只做回填，见 §1.2），
加一项并不能让存量用户看见。故 `/inbox` 目前按 URL 可达，导航入口另议。

**⚠️ 与既有「通知收件箱」重名，且本页只做了方案要求的其中一半。** 核对时发现产品里**本来就有**一个收件箱：

| 面                     | 位置                                                                                     | 数据源                                                                 | 内容                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| 既有的**通知** modal   | `HomeSidebar/Header/components/InboxModal/index.tsx:153`（`openInboxModal()` 于 `:466`） | `notificationService` + `inboxKeys.notifications` / `navigationCounts` | 未读 / 已读 / 全部筛选、全部已读、归档、逐条动作       |
| 本次新增的 `/inbox` 页 | `features/HomeInbox/InboxPage.tsx`                                                       | `useBriefStore`（简报）+ goals + topics                                | 简报、needs-you、未读与运行话题、每日简报、goals、推荐 |

两者**不是同一个服务端实体**（`services/notification` vs `store/brief`），所以不构成「复制第二份未读状态」。

⚠️ **「名称撞车」是我未经核实写下的，实测不成立 —— 更正如下。** 两个面的用户可见标题在**两种语言里都不同词**：

| 面              | 标题 key                                                           | en-US             | zh-CN      |
| --------------- | ------------------------------------------------------------------ | ----------------- | ---------- |
| 通知 modal      | `notification:inbox.title`（`locales/en-US/notification.json:76`） | **Notifications** | **通知**   |
| 本次的 `/inbox` | `electron:navigation.inbox`（`locales/en-US/electron.json:32`）    | **Inbox**         | **收件箱** |

一个叫 Notifications、一个叫 Inbox，用户不会把两者当成同一个东西，**故不需要重命名**。
（顺带排掉一个诱饵：`chat.json:1053` 也有 `inbox.title`，值是 `Orvilo AI`，属另一个命名空间，无关。）

**决定：并存，不改动。** 三条理由：

1. 名称不同词，「撞车」不成立，换名没有要解决的问题。
2. 方案那句「不能关联任务的历史对话仍可打开原会话，**不能伪造 taskId 或直接丢弃通知**」的落点是**可达性**；
   通知 modal 在 Web 上仍可达，故该条款**已满足**。
3. 方案把「通知组件」列为收件箱能力来源，但同一句的主语是「抽出可独立挂载的能力，建立薄路由**或接入等价现有路由**」——
   通知面本来就不挂在 Home 上（它在侧栏头部），**从来不需要被 "抽出来"**，故它不是本条款的欠账。

可达链路（已核对）：`NavPanel/Shell.tsx` → `HomeSidebar/index.tsx` → `Content.tsx:5`
→ `Header/index.tsx:12`（`right={<InboxButton />}`）→ `InboxButton.tsx:18` → `openInboxModal()`。

**不做合并**：那要把筛选、已读、归档、逐条动作、分页整条搬进页面，是一块新功能；
在「名称不同词 + 通知已可达」的前提下，它的收益只是把两个面并到一个 URL，代价是一块未经验证的新界面。

**尚未做（已知，非回退）**

- 每页「恰好一个宿主」：**已按做法②实现（2026-09-16）**。`TopicChatDrawer` 有 4 处页面级宿主
  （`Portal/TaskDetail/Body.tsx:51`、`Portal/TaskResult/Body.tsx:77`、
  `AgentTaskDetail/TaskDetailPage.tsx:118`、`Automations/AutomationDetailPage.tsx:301`）
  加上 `GlobalOverlays/index.tsx:55` 的全局宿主，共 5 处。它们**在改动前就并存**，
  且因内容相同而完全重叠，所以不构成本次回退 —— 但它确实是「重复弹窗」，本次一并修掉。

  **「直接删掉这 4 处」是错的**：`GlobalOverlays`（`index.tsx:39`，注释写着「exactly one host is
  mounted for the whole app」）只在 **`(main)`** 两处布局里挂载 —— `(mobile)` 树有自己的 `_layout`，
  **没有挂它**（已自行 grep 复核：全仓引用者只有 `routes/(main)/_layout/index.tsx:17`、
  `index.desktop.tsx:30`，加 `authMount.test.ts` 里的 mock）。因此这 4 处在移动端是**唯一**宿主，
  删掉会让移动端的任务会话抽屉彻底没有宿主。

  **做法②的落地**：新增叶模块 `GlobalOverlays/globalHostContext.ts`（`createContext(false)`，
  只 import react，故不与宿主 / 面板成环）；两个 `(main)` 布局把**整棵树**包进 `value={true}` ——
  关键是 `<Outlet/>` 子树与 `<GlobalOverlays/>` **都在里面**；`TopicChatDrawer` 加
  `asGlobalHost?: boolean`，并在**所有 hook 之后**加一句
  `if (hostedByOverlay && !asGlobalHost) return null;`（已复核该 return 之后只剩注释、无 hook）；
  `GlobalOverlays` 自己的实例传 `asGlobalHost`。4 处页面级调用点**一字未改**。

  **默认值必须是 `false`，这是整个改动安全性的来源**：没有 provider 的树（移动端）上下文为 `false`，
  页面级宿主照旧渲染，所以移动端**按构造成立**不可能被这次改动改坏。

  **证据（渲染计数，可本机复核）**：新增 `GlobalOverlays/topicChatDrawerHost.test.tsx` 用**真实**
  `TopicChatDrawer`（只 mock `FloatingPanel` 为可知的 `data-testid`）数面板数量；其中一条渲染
  **真实 `(main)` web 布局**、让 `Outlet` 渲染一个页面级 `<TopicChatDrawer />`（与那 4 处声明方式相同），
  断言面板数 = 1，并断言两个实例**确实同一次提交里都挂上了**。已自行反向验证：把
  `useGlobalOverlayHost` 强制改成 `false` 后，「页面级不开面板」与「真实布局只有一个面板」两条**精确变红**，
  后者报 `expected [<div>, <div>] to have a length of 1 but got 2` —— **修复前的两个面板被直接拍到**，
  所以这个缺陷是实证而非推断。另外 2 条（无 provider 时照常开面板、global 实例自身）在两种状态下都通过，
  正是应有的分布。

  ⚠️ **仍需 S80 的**：本机给的是 vitest + happy-dom 的渲染计数，**不是真实界面**；
  `index.desktop.tsx` 的包装与 web 变体相同且 `authMount.test.ts` 覆盖两个布局的元素树，
  但**桌面布局树本身没有被渲染验证**；移动端也只在「默认值不变」这一层上成立，未在真实移动构建上看过。

  **独立复核（2026-09-16）**：共 **5 处**挂载点 = 上面 4 处页面级 + `GlobalOverlays/index.tsx:55`；
  全仓**不存在**任何抑制机制（对 `OverlayHost|HostedBy|alreadyHosted|GlobalOverlayContext|DrawerHostContext`
  做全 `src/` 搜索，零命中）。所以做法②今天是从零新增，不是 "接一根已有的线"。
  驱动选择器为 `taskDetailSelectors.activeTopicDrawerTopicId`（`TopicChatDrawer/index.tsx:132`），
  `openTopicDrawer`（`store/task/slices/detail/action.ts:395-401`）是唯一写入者。

- **Electron 的宿主粒度与 Web 不同，方案那句「每个页面 / 标签页唯一宿主」必须拆成两个命题验。**
  Electron 主区是 `{ element: null }` 桩（`desktopRouter.config.desktop.tsx:34-40`，注释写明
  「The root owns only the persistent TabHost shell and must not render a second copy of the pages」），
  每个标签页由 `tabRouter.tsx:20-42` 自建 memory router，只挂 `createMainAreaChildren()`，
  **不含 `(main)/_layout`**。故 `GlobalOverlays` 是**窗口级、一窗口一份**，而页面是每标签页一份：
  Web 是 "每页一个宿主"，Electron 是 "一窗口一个宿主 + N 个标签页共用"。

- **`AcceptancePortalDrawer` 会与常驻 portal 栏重复渲染同一份验收内容 —— 已找到触发路径，不再是推断。**
  抽屉的开关条件是 `isAcceptancePortalView(viewType)`（`GlobalOverlays/AcceptancePortalDrawer.tsx:23`），
  **没有任何路由或 `showPortal` 守卫**，`GlobalOverlays/index.tsx:48` 用同一条件 arm。

  **触发它的正是产品自己的流程**：`AgentTasks/AgentTaskDetail/useOpenAcceptanceInPanel.ts:17-24`
  的职责就是 "在面板里打开验收" —— 它把验收视图推入 portal 栈**并且** `showTaskAgentPanel(true)`
  展开任务面板（其测试 `useOpenAcceptanceInPanel.test.ts:39` 断言的正是这次展开；
  `TaskAcceptance.tsx:161,168`、`RunVerifyTag.tsx:93`、`DailyBrief/BriefActionLink.tsx:77` 同样）。
  于是 `AgentTaskManager/index.tsx:24-38` 的 `showAcceptance` 与 `expand` 同时为真，
  它的 `<RightPanel>` 渲染 `<PortalContent />`，而抽屉读同一个 `currentViewType` 再渲染一份 ——
  **"在面板里打开验收" 的意图被一个额外抽屉副本削弱**。
  注意 `AgentTaskManager:25-26` 是把 `isAcceptancePortalView` 的谓词**手抄**了一遍，
  两处条件同源同义，这正是重复的来源。

  **四种修法都查了，各有具体障碍，故记录为准、未实现**（方案未点名此项，且任一方向的验证都要真实界面）：

  | 候选机制                                                        | 障碍                                                                                                                                                                                                 |
  | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 复用 `isTaskPanelRoute`（`hooks/useHotkeys/globalScope.ts:19`） | 漏 `/:workspaceSlug/tasks`（工作区镜像走同一路由元素）、漏 `/agent/:aid/task/…`（`AgentScopedTaskDetailPage.tsx:33`）、漏 `GoalDetailPage` 与 agent 的 Portal 布局 —— 给出 "看似完整实则漏三处" 的修 |
  | 读 `showTaskAgentPanel`                                         | 语义不对：它是**面板状态**不是 "本路由有列"。在 `/inbox` 上只要本次会话访问过任务页它仍为真 → 抽屉被压掉，**验收内容变得不可达**（危险的回归方向）                                                   |
  | 挂载计数（`useSyncExternalStore`）                              | 挂载副作用在 paint 之后 → 抽屉先开一帧再关（闪烁）；判错方向的代价同样是 `/inbox` 不可达                                                                                                             |
  | 在 portal push 上带意图标记                                     | 语义最准（调用方知道自己是 "在面板里开"），但要改 portal store 的 API 及其全部调用点                                                                                                                 |

  另注：它**在移动端零挂载点**（`GlobalOverlays` 只被两处 `(main)` 布局 import），移动端的验收视图由
  `Portal/Mobile.tsx` 承担。该项**先于本次改动**存在（旧 Home 是 app 级挂载，该抽屉当时已随处在场）。

- **经核对没有失效的宿主**（对应 HOME-01 / HOME-02 担心的 "store 更新了但没组件响应"）：
  `AllRecentsDrawer` 由 `NavPanel/Shell.tsx` 挂载（app 外壳级，非 Home 专属）；
  `CustomizeModal` 与侧栏通知 `InboxModal` 都是命令式 `createModal`，**不需要宿主**。
  三者的挂载链都在 Home 之外，故 Home 卸载没有让任何一个失去宿主。

- 移动端：`(mobile)` 树不使用 `(main)/_layout`，因此 `GlobalOverlays` 的三个子项在移动端**本来就没有**，
  行为未变 —— 上面的宿主问题是同一件事的另一面。

#### 2.2.1 「旧 Home 卸载」的真实边界（2026-09-16 修正）

⚠️ **本小节此前有一版（`5617c082`）基于一份未经核实的审计，写入了三条不成立的说法。**
逐条读代码后更正如下 —— 记下来是因为这三条都会误导下一步施工：

| 曾被写成                                                          | 实测                                                                                                                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AcceptancePortalDrawer` 全仓只有 Home 一个宿主，「唯一的硬阻塞」 | **已不成立**：它已 `git mv` 到 `src/features/GlobalOverlays/AcceptancePortalDrawer.tsx`，由 `(main)/_layout` 的 Web 与 Electron 两个变体统一托管（见上文改动表） |
| 有两个改动点（Web `_layout` + Electron）                          | **只剩一个**：Web 的 `(main)/_layout/index.tsx` 现在**零处**引用 Home（`rg -n 'home\|Home'` 无命中）；只剩 Electron 的 index 槽                                  |
| 「11 个模块」被外部深导入                                         | **是 24 个文件 / 13 个模块路径**，且审计漏了 `Home/SuggestQuestions/useRandomQuestions`（`HomeSidebar/hooks/useCreateModal.tsx` 在用）                           |

**唯一的挂载点**：`src/spa/router/DesktopHomeRoute.tsx:3-4`（`routes/(main)/home` + `…/home/_layout`），
经 `desktopRouter.config.desktop.tsx:18` 的 `createHomeElement` 注入 Electron 的 index 槽。
即：**`features/Home` 现在只为「Electron 每标签页的开屏内容」而存活，Web 上它已经没有被挂载。**

**13 个被外部依赖的内部模块**（整目录删会直接编译失败，须先抽出）：
`components/{RunningGlyph,Time,homeType,GroupBlock,RailCard}`、
`AgentSelect/{useHomeAgentRows,AgentList}`、`CustomizeModal/{config,useHomeCustomization}`、
`HomeNavHeader`、`Recents`、`portraitFraming`、`SuggestQuestions/useRandomQuestions`。
其中**一半的消费者是 `HomeInbox` 自己**（`HomeInbox/*` 大量 import `Home/components/*` 与 `CustomizeModal/config`）——
所以「把收件箱抽出来」并不等于与 `features/Home` 解耦，这一点直接决定了下面那个薄路由方案的形状。

**由此得出两条独立结论**：

1. **Web 侧的卸载已经完成**（`(main)/_layout` 零引用 Home），剩下的是「旧 Home 的**目录**是否要删」——
   而它只被 Electron 开屏需要，删它的前置是那 13 个模块的抽出，与收件箱可达性**无关**。
2. **收件箱可达性才是真实缺口**，且它与 Home 的去留可以分开解决（`HomeInbox` 本身不需要 `HomeLayout`，
   也不需要 context provider，它只需要 `Home/components/*` 那批展示件与 `CustomizeModal/config` 存在）。

**Electron 开屏去向属方案裁定范围，不属工程自选**：方案 S20 的原文正逐字取回中，拿到之前不给结论。

**验证**：`src/spa/router/`、`src/features/{GlobalOverlays,Home,HomeLayout}/` 共 **207 个用例全绿**；
`desktopRouter.sync.test.tsx` 中断言「Web 索引槽为空」的那条**按新契约改写**为
「Web 落地到任务列表、Electron 落地到自己的 Home」。
新建 `GlobalOverlays/index.test.tsx` 承接了原先挂在 Home 上的「验收抽屉只在验收门户打开时加载」契约，
并补上 `RecentSync` 与运行抽屉的宿主断言。

✅ **这里的既有失败已修复（2026-09-16），且原归因是错的。** 原先记为「`authMount.test.ts` 的 desktop 用例
撞满自带 20s 预算，在 `f4605a81` 上对照确认同样失败」。量过之后发现它不是 "撞满" 而是**远超**预算，
而且与 "机器争抢" 无关（单独跑一次、无并发时同样 25.7s）：

| 用例    | 改前            | 改后     |
| ------- | --------------- | -------- |
| desktop | 25756ms（超时） | **12ms** |
| web     | 6259ms          | **1ms**  |

真因与 §2.2.2 提到的 banner 用例同类 —— `describe.each` 的 `await import('./index.desktop')`
发生在**测试体内部**，两个布局图都在预算内求值，desktop 那张约是 web 的 4 倍；
整体构成 `tests 95% / environment 2%`，资金全压在测试体上。
改为模块作用域静态 import（`vi.mock` 提升后仍先于 import 生效）后，`tests` 占比归零
（`import 61% / transform 32%`），代价移入收集阶段。已无意义的 `{ timeout: 20_000 }` 一并去掉。

**断言一字未改**，且这个绿灯不是空绿：该用例的两条断言自带互锁 ——
「某处能找到」与「不在 slot 内」互为前提，遍历一旦坏掉，前者必红。

**由此得出一条可复用的判别法**：固定超时预算是**不可信信号**。看到 "撞满 N ms" 先量每个用例的耗时与整体构成
（`--reporter=verbose`），再问一句 **这份耗时由什么构成**：

- **若是模块求值**（体内 `await import(...)` / `vi.resetModules()`），移到模块作用域即可 ——
  静态 import + 提升的 `vi.mock`，图只求值一次且落在收集阶段，不受 `testTimeout` 约束。
  两处已这么做：banner 用例 13001 → 89ms，本节 authMount 25756 → 12ms。
- **若是测试体本身不可约的工作**，就只能把预算配到实测值，并写清为什么不可约。

⚠️ **不要拿 `tests` 占比单独当判别**（这是本小节上一版的漏洞）：它只说明**整个 run 是否被收集主导**。
本节的 run 是 `tests 95%`，而下面第三例是 `tests 6%`，**两个都出了超时**；
真正要看的是**体内那份耗时能否搬到别的阶段**。

**第三例（`TopicCard.test.tsx`，2026-09-16）属第二类**，因此是唯一一处用预算而非搬活来解决的：
体内只有一次 `render` 加一次 `userEvent.click`，实测两次运行分别 3628ms 与 564ms，
其中**首次 render**（2060 / 277ms）与**首次 `getByRole` 查询**（1079 / 124ms）占绝大部分 ——
是渲染与无障碍机制的一次性预热，不是逐次工作；对着默认 5s 只剩约 1.4 倍余量。
两条替代路线都关着：`userEvent` 不能换 `fireEvent`（这条断言的全部意义正是 " 尊重 `pointer-events` 的点击能穿过去 "，
`fireEvent` 会忽略该规则，换掉等于削弱断言）；预热也不能像模块求值那样上提（它需要已挂载的 DOM，
放进 `beforeAll` 只是把同样的负载敏感性搬进 hook 超时）。故只给该用例 20s 预算，
实测值与这两条理由都写进了注释，供复核。

---

#### 2.2.2 落点核对（方案 L214：登录 / 新工作区 / Onboarding 完成后回到看板）

三条要求逐条核对（2026-09-16，下表所有断言行号均已自行复核，未采信二手审计）：

| 旅程            | 字面目标（file:line）                                                                                                                                                                  | Web 落点                              | Electron 落点         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------- |
| 登录完成        | `callbackUrl \|\| '/'`（`features/Auth/SignIn/useSignIn.ts:221`）→ `window.location.href = sanitizeRedirectPath(callbackUrl)`（`:239`）                                                | `/` → `WebHomeRedirect` → `/tasks` ✅ | 落到**聊天式首页** ❌ |
| 新工作区创建    | **无法确认**（见下）                                                                                                                                                                   | —                                     | —                     |
| Onboarding 完成 | `resolvePostOnboardingTargetUrl()`（`Onboarding/steps/AgentPickerStep/index.tsx:115`）→ `navigate(targetUrl)`（`:117`），默认 `'/?onboarding=task'`（`utils/onboardingRedirect.ts:3`） | `/tasks?onboarding=task` ✅           | 首页 **task 模式** ❌ |

**深链接优先，NAV-07 已满足**：`callbackUrl` 存在时优先于默认 `'/'`；
`sanitizeRedirectPath`（`utils/onboardingRedirect.ts:44-48`）只放行同源相对路径，拒 `javascript:`、`//evil.com`；
未登录访问受保护 URL 时由 `libs/next/proxy/define-config.ts:293-295` 回填 `callbackUrl`。
故「登录回调被根路径改造抢走」不成立。

**新工作区一栏写「无法确认」而不是猜**：本仓没有客户端创建工作区的流程 —— 全仓唯一调用点是 CLI
（`apps/cli/src/commands/workspace.ts:258`，只持久化 scope 并打印，不导航）；服务端是明文 OSS 桩
（`packages/business-server/src/lambda-routers/workspace.ts:48-60`，注释说云端在同路径覆盖）；
客户端 `useWorkspaces` / `useActiveWorkspace` / `useHasWorkspace` / `useSwitchWorkspace` 全是桩。
云端向导的落点不在本仓，故不推断。

**为什么 `WebHomeRedirect` 不等待初始化**（方案那句「等待… 再导航」的*目的*已由另一机制满足）：
`useWorkspaceUrlSync` 的契约写明「URL is the source of truth for workspace context」，
并在 `useWorkspaceUrlSync.ts:109-110` 对无 slug 的 URL 主动 `switchToPersonal()`。
即裸 `/` **按设计就是个人空间**，既不存在 "先跳个人空间后跳团队空间"，
也不会先露出别的空间数据（NAV-02）。`WebHomeRedirect` 的目标是纯 URL 派生（`useParams` + `useLocation`），
无异步参与，因此 "等待" 只会推迟一个已经正确的决定。它不读 store 的另一个理由在组件注释里：
冷启动时 store 派生的 slug 会是 `undefined`，那才会把工作区 URL 误送去个人 `/tasks`。

**决定并实施（2026-09-16）：Electron 的首页默认模式由 `chat` 改为 `task`。**

- **不采用「把 Electron 也重定向到 `/tasks`」**：`features/Home` 将再无宿主，等于删掉 Electron
  唯一的开屏页，与 §1.7.2 / §2.1 明确保留的首页部件（小头像、Agent 身份显示、执行状态提示）冲突。
- **采用「默认模式改 `task`」**：`DEFAULT_HOME_MODE` 由 `'chat'` 改为 `'task'`。单点改动 ——
  它只有一个消费者（`Home/index.tsx` 的 `resolveInitialHomeMode`），移动端走自己的
  `routes/(mobile)/(home)/`，Web 根本不挂 Home，所以影响面就是 Electron 的开屏模式。
  这也让裸落地与既有的 `?onboarding=task` 入口**不再互相矛盾**：此前只有裸落地是 chat 模式。

⚠️ **我先前用来否决这一条的那句论据是错的，而且错在我自己写的测试桩里 —— 记下来，因为它是一个自洽的假结论。**
我写过「task 模式下 `new-model-shortcuts` 不渲染，等于静默去掉模型发现入口」，依据是
`homeDashboard.test.tsx` 里的一条断言；而那条断言的依据是我写的 stub：
`{mode === 'chat' && showNewModelShortcuts && …}`。真实组件 `Home/InputArea/index.tsx:117`
是 `{showNewModelShortcuts && …}`，**根本不看 mode**。即：**stub 发明了一个不存在的耦合，
测试又把这个发明 "确认" 了一遍**，于是我拿一个假事实去否决了一个正确的改动。
已把 stub 改成与真实组件同形，断言也改为「task 模式下快捷键**在**」。
（`keeps model shortcuts out of the minimal layout` 不受影响：minimal 布局根本不传该 prop。）

**仍需 S80**：本机只能证明渲染出的 `data-mode` 与 props，**开屏观感**只能在真实 Electron 构建上看。

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

**§6.4 要求保留的**：`Acceptance` / `Verify` / 任务测试报告 / 证据 / 失败追踪全部未动；`apps/cli/src/commands/eval.ts` 是内部消费者，其库保留；`agentEval` / `ragEval` 服务端 router 未动；`ragEvalService` 属知识库，与本次无关。

**补做：浏览器侧 client 残留（`cc3b9489`）—— 并且推翻了本轮早先的一个判断。**
当时把 `store/eval` 判为「被 `store/utils/userDataStores` 注册，保留」。复核下来这条推理是**反的**：
登记进登出重置表，只说明「登出时要把它清掉」，**不说明有人在读它**。实测该 store 在树外的
唯一消费者就是那一行 `useEvalStore`，`services/agentEval`（浏览器包装）的唯一消费者是该 store 的
slice，`evalKeys` 的唯一消费者也是它们 —— 三者的消费者**互为闭环、出口为零**，即
「一个没人观察、只被 `reset()` 的 store」。故 `cc3b9489` 删除 23 文件 / 1402 行。

**为什么 RAG 评测不跟着删（结构性判据）**：RAG 评测是 `store/library/slices/ragEval/`，即 library store
的一个 slice，与资源同寿；通用评测则有**独立顶层 store**。删的判据是「有没有独立生命周期」，
不是「目录名里有没有 eval」。同理服务端 `agentEval` / `agentEvalExternal` router、
`services/agentEvalRun/` 与其 workflows 全部保留 —— CLI 是它们的活消费者，Acceptance 走同一执行骨干。

⚠️ **`src/proxy.ts` 特意不改**：它的 matcher 里列着 `/eval`、`/image`、`/video`，看起来是死条目。但那是「哪些路径走 middleware」的白名单（不是鉴权放行），删掉退役段会把「旧深链接由 SPA 兜底重定向回家」变成框架层硬 404。

**已完成 S30.5 第一步 —— 服务端收口（`c95f9ba6`）**

方案 §6.5 把顺序写死为：**服务端先禁止新发布 / 新的访客执行** → 入口同步移除 → 旧链接返回安全说明 → 历史运行与审计继续读取 → 依赖清零后删代码。本轮完成第一步。

两处拒绝都是**无条件**的：不是把原来的 flag 判断取反，而是删掉 —— §6.5 要求「旧持久化 feature flag、旧客户端或尚未过期的访客 token 不能绕过退役策略」，留一个分支就等于留一个开关。原先的创建门读 `enableAgentShare`，那个分支现在不存在。

**`shareChat.execAgent` 是可证完备的收口点**（不是「多处之一」）：运行态里每一个访客标记都派生自 `execAgent` 内部构造的那个 `shareGate`（`services/aiAgent/pipeline/startOperation.ts:141` 把它读成 `agentShareVisitor`），而全仓**只有这一处**构造 `shareGate`。所以没有任何其它过程能发起访客运行；拒绝它也一并拒绝了流式输入、继续生成、异步派发与工具调用 —— 它们都在「起不来的运行」下游。

**刻意不退役的**（§6.5 明文保留）：读取路径 `share.getSharedAgent`、`shareChat.getTopics` / `getMessages`；`agentShare.disableShare` 与 `updateVisibility` 回到 `private`；`shareChat.interruptTask` 与两个 gateway token 过程 —— 最后一项是为了「已有运行按发布时的明确策略完成或取消」，掐掉在途运行的流或它的话费都不属于退役目标。

**四类分享在代码里保持可区分**：`getSharedTopic` 走 `TopicShareModel`（会话分享，另一张表、另一个能力），`AgentShareModel` 才是「公开可交互 Agent」这一类。本轮只动后者。

**四类分享的完整归属图（2026-09-16 审计补，用来防止连带删除）**：

| 类别                    | 表                      | Model / 入口                                        | 在 `apps/share` 里？ |
| ----------------------- | ----------------------- | --------------------------------------------------- | -------------------- |
| (a) 任务 / 会话链接分享 | `topic_shares`          | `TopicShareModel`、`share.getSharedTopic`           | **是**               |
| (b) 只读产物 / 页面分享 | `document_shares`       | `DocumentShareModel`、`pageShare` / `artifactShare` | **是**               |
| (c) 团队邀请            | `workspace_invitations` | `workspaceMember` router                            | 否（零代码交集）     |
| (d) 公开可交互 Agent    | `agent_shares`          | `AgentShareModel`、`shareChat.*`                    | **否**               |

所以 `apps/share` 只服务 (a)(b)，退役 (d) 不需要动它的目录结构 —— 这与 §6.5 L295 的要求一致。

**另一个部署级事实：OSS 自托管上这条链路本来就是关的，退役是第二重保证。**
`packages/business/const/src/index.ts:7` 的 `ENABLE_BUSINESS_FEATURES = false` 是编译期常量，
而 `assertAgentShareVisitorEnabled`（部署门，本轮未改）在它为 false 时直接抛 FORBIDDEN
—— 即六个 `shareChat` 过程与 `share.getSharedAgent` 在自托管部署上**早就全是 403**。
在自托管环境设 `agent_share` 环境变量也没用（`packages/app-config/src/featureFlags/schema.ts:88-90` 有注释说明）。
本轮新增的两个门（`assertAgentShareCreationEnabled` / `assertAgentShareVisitorExecutionEnabled`）
是**无条件拒绝**、不读任何开关，因此它们的作用不是「在自托管上再挡一次」，而是**在开了这个能力的部署上把它关掉**
—— 且没有任何开关能把它们翻回去（这正是 §6.5「旧持久化 feature flag 不能绕过」要求的形状）。

**客户端侧的关键发现：本仓库没有可移除的发布入口，因为入口本来就已隐藏。**
`useAgentShareSupported`（`src/business/client/useAgentShareSupported.ts`）是**业务槽位**，其开源默认返回
`{ publishable: false, supported: false, visible: false }`，注释明说「这隐藏了所有分享入口（profile tab、header action、settings page）」。
三个消费者（`features/AgentProfileTabs/index.tsx:70`、`routes/(main)/agent/profile/features/Header/index.tsx:254`、
`AgentShareSettingsPage`）读的都是它。也就是说真正的发布 UI 与访客页在**云端业务实现**（该槽位的覆盖者）里，不在此仓库 ——
「入口同步移除」属于那次云端改动。**更正本条早先的两个判断（2026-09-16 复核）**：

- `ShareShell`（`src/business/client/features/ShareShell/`）**不是**零消费者 —— 它是公开分享应用的共用外壳，被
  `apps/share/src/features/topic/SharedTopicView.tsx:54` 使用。原先写它「零消费者」是错的。
- `agentShareService`（`src/services/agentShare.ts`，53 行）在本仓确实是零消费者，但**这不构成删除理由**。
  它是 `agentShare` router 的客户端绑定（`disableShare` / `enableShare` / `getShareStats` / `getShareStatus` /
  `getSharedAgent` / `updateShareConfig` / `updateSlug` / `updateVisibility`），而发布与撤销 UI 恰恰就是被
  业务槽位 `useAgentShareSupported` 隐藏掉的那部分 —— 即它的消费者在**云端业务实现**里，不在本仓库。

> **由此得出删死代码前必须先问的那个问题：消费者为什么缺席？**
>
> | 缺席原因             | 例子                           | 处置                                           |
> | -------------------- | ------------------------------ | ---------------------------------------------- |
> | 同仓重构删掉了消费者 | `src/store/eval`（`cc3b9489`） | 可删（删完出口为零，闭环）                     |
> | 下游私有层提供消费者 | `src/services/agentShare.ts`   | **保留**（删了会打断那个构建，而本机无法验证） |
>
> 本仓 73 个 `src/services/*.ts` 里只有 2 个零消费者，说明这个仓库**不留投机性的 API 面** ——
> 所以「零消费者」本身是有信号的；信号要配上「缺席原因」才能定处置。

**旧链接为什么不动读路径**：`share.getSharedAgent` 同时服务三件事 —— 访客历史页面的解析、所有者的预览（`isOwner` 分支）、以及「审查与撤销」所需的读取。封掉它等于同时打断 §6.5 要求保留的历史读取与撤销路径，正是那节警告的「误伤」。旧链接的**安全说明**因此落在访客**尝试运行时**：`execAgent` 返回 FORBIDDEN，而客户端既有范式 `features/Share/ErrorView.tsx:58` 的 FORBIDDEN 分支（403 说明页，经 `ShareShell` 渲染）已经在处理这类响应。

**仍未做（属云端仓库或 S80）**：云端发布 UI 与访客页的入口移除与「已退役」文案；以及 §6.5 最后一步「依赖清零后删除无用代码」—— `execAgent` 的实现体、`services/aiAgent/shareGate.ts` 的工具白名单、`AgentRuntime` 里的访客分支都还在。本轮**刻意保留**：§6.5 把删除排在最后，而删 `AgentRuntime` 的访客分支要动 §0.1 保护的引擎 harness，且本机没有运行时可验证。代价是**那 12 个 `execAgent` 用例随之退役、实现体暂时无覆盖** —— 被移除的覆盖点已逐条写进测试注释与提交信息（花费准入、访客 topic/turn 上限、creator 作用域派发、prompt 尺寸、失败脱敏、`interactiveStart: false` 存活契约），重新开放该能力时据此恢复。

**更正：早先这条把 `apps/share` 写进了待删清单，是错的 —— 方案明文保护它。**
§6.5 L295：「**不得删除整个 `apps/share` 或通用共享身份系统**；先区分任务链接、产物只读分享、
团队邀请和公开可交互 Agent。」L622 同样把「直接删除 `apps/share`… 而没有消费者证据」列为禁止捷径。
实测印证：该应用路由表只有 `share/t/:id`、`share/page/:id`、`share/artifact/:id`
（`apps/share/app/routes.ts`），`grep -i agent` 在目录内**零命中** —— 它本来就不含任何 agent 分享面。
所以「不删」不是我对方案的偏离，**而是照方案执行**。`apps/share`（65 文件）原样保留。

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

**已完成 —— 产物的运行级追溯（`ee076357`）**

§8 要求「至少能够从产物追溯到任务 / **具体运行**」。这一项**不需要补生产者**：文档类 Work 本来就同时记录
`documentId`（作为 `resourceId`）与产出它的会话（`works.originTopicId`），运行时注册路径两个都填了。
所以缺口一直在「投影与显示」，不在「有没有数据」。

`getTreePinnedDocuments` 按 `resource_id` 关联 Work、再关联 `topics` 取标题。`(resourceType, resourceId, userId)` 唯一，
所以这个 JOIN **不会**让一个文档行重复；手工挂上的文档没有 Work，关联为 NULL，投影如实报 `null` 而不是字段缺失。
产物卡片显示产出它的那次运行的标题。

**卡片上它是一个标签，不是链接** —— 点进那次会话需要该运行的 agent id，而当前投影不带它；拼一条猜的路由比不给链接更糟。
若要做成可点进，需在投影里再带上该运行的 agent id（一个字段），已记在此处而非留在别处。

⚠️ 这一步同时**否掉了原计划**：先前的诊断说「要在 `topic_documents` 上补生产者」，那会为**已经记录**的关系再造一套并行关联，
而且落在一张至今零读取者的表上。诊断依据（`RegisterDocumentWorkParams` 的三个字段、运行时注册上下文、
`works.originTopicId` 的索引）见上一次提交的更正记录。

两条测试都对改动前的模型失败（`expected undefined to be null` 与字段缺失不匹配）；由于原生 SQL 不受类型检查保护，
这两条同时也是「新 JOIN 能解析并执行」的证明。

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

**但第三行要加一个必须说清的边界（2026-09-16 审计补）**：上面那行只证明了**任务详情本体**是干净的，
不能读成「任务详情所在的工作区不改全局 agent」。分两层看，结论相反：

| 层                    | 位置                                                                                                           | 对全局 Agent 语义                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. 任务详情本体       | `AgentTaskDetail/` 全目录                                                                                      | **只读**：assignee 从 task detail 读；`useHydrateAgentConfig` 是 hydrate-only；改模型写的是任务级 `taskService.updateConfig`（`TaskModelConfig.tsx:43`） |
| B. 任务工作区聊天面板 | `TaskAgentProvider.tsx:74-76`（`setActiveAgentId`）、`:88`（`useChatStore.setState`）、`:102`（`switchTopic`） | **确实写全局**，且被 `TaskAgentProvider.test.tsx:161-162,233-234,359-360,384` **钉死在测试里**，是有意设计                                               |

B 的挂载方是与详情**平级**的兄弟节点，不是详情的子组件：`TaskWorkspaceLayout.tsx:19` 给整个 `(task-workspace)` 布局挂一个，
`AgentScopedTaskDetailPage.tsx:33` 另挂一个（带 `preferredAgentId`）。

**这条边界有实施含义**：将来若在任务详情里加「讨论」视图，**绝不能走 `TaskAgentProvider`**，
必须沿 `TopicChatDrawerBody` 的路线 —— 显式传 `agentId` + `topicId` + `isolatedTopic: true`
（`TopicChatDrawer/index.tsx:71-79`；`isolatedTopic` 的语义是 sendMessage 不改全局 `activeTopicId`，
定义在 `packages/types/src/conversation.ts:171-177`）。否则就会撞上 §9.3 那条禁令。

**两个现成先例（§9.3 要的「迁移挂载职责」已经有人在仓里做过）**：

- `TopicChatDrawerBody`（`TopicChatDrawer/index.tsx:64`）与浮层 chrome（`:128`）是分开导出的；
  三个宿主复用 body、**不挂 chrome**，其中 `Acceptance/Viewer/Conversation/TopicPanel.tsx:14-18` 的注释明写
  「deliberately reuses the drawer's conversation body without mounting the floating drawer chrome」。
- `useOpenAcceptanceInPanel.ts:6-14` 明写**刻意不做路由跳转**，因为独立 `/acceptance/:id` 是与工作区无关的路由，
  跳过去会把整个应用切回个人 scope —— 这正是「迁移挂载职责而非迁移导航」的既有表达。

**顺带澄清两处最接近 `mode` 反模式、但判定为不是的地方**（免得下一个人误删）：
`TaskAcceptance.tsx:121` 的 `variant='result'` 在 `:246-257` 挂的是**真的验收 atom**
（`AcceptanceScope embedded` + `AcceptanceCheckInventory` + `AcceptanceDecision`）；
`TaskActivities.tsx:247` 的 `variant='result'` 只差三处条件分支（`:461` 换 `TaskRunReport`、`:472` 去 lifecycle 行、`:497` 去外层 chrome）。
两者是「同一组件为不同读者换组合」，不是「把整页藏起来」。真正算 embed flag 的是
`AcceptanceScope.tsx:29-39` 的 `embedded`（由 `Viewer/index.tsx:63` 从 `explicitAcceptanceId` 推导），
它作用于原本独立的 `/acceptance/:acceptanceId` 页面 —— 也是既有做法。

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

原表有重号（两个 2），且五项里四项已随各工作包解决或前提消失。按 2026-09-16 复核结果重写：

| #   | 项                                   | 状态                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **与 `bbd6ead3` 的两套并行退役机制** | **仍是开放项**，且**本分支内无法收敛** —— 对方的提交不在此工作树里，收敛动作发生在合并时。做法与已做的对齐见 §4.1                                                                                                                                                                                    |
| 2   | **S30/S50 删除缺本地类型检查兜底**   | ✅ **前提作废**：本条原先假设「本机不能跑类型检查」是错的。`cd apps/server && bunx tsc --noEmit` 本机可用，已在 `263ebf78`、`15d06a28`、`ee076357` 上三次跑通（退出码 0）；只有 `pnpm type-check` 会因原生模块编译失败。手段见 §0.4 补充表                                                           |
| 3   | `DndContextWrapper` 提升顺序         | ⚪ **前提未触发**：该宿主仍物理位于 `src/features/ResourceManager/DndContextWrapper.tsx`，主布局两个变体都从那里 import。它之所以**不需要**先提升，是因为 S50 并未要求下沉 `ResourceManager` 目录 —— 方案 §S50 L349 恰好警告过「共享拖拽上传… 不能按目录名一并清除」，而该目录承载的正是这些共享能力 |
| 4   | 「自动化」命名与方案的差异           | ✅ **已按用户裁决执行**（`automation` 与 schedule task 合二为一，名字仍取「自动化」），落地见 §2.3                                                                                                                                                                                                   |
| 5   | 桌面固定标签页迁移                   | ✅ **已完成**：退役过滤落在 `e965e3e5`（`RETIRED_ROUTE_PREFIXES` 从 registry 的 `tier` 派生，`getTabPages` 丢弃指向退役段的标签并把 `activeTabId` 移到存活标签上）。原条目的另一半「已知键补回」对标签页**本就不适用** —— 标签是用户自建的，没有默认名册可补，与侧栏 `withAllKnownKeys` 的场景不同   |
| 6   | `electronKey` 死字段                 | ✅ **已清理**（S70 `0a4f0b05`）；复核 `packages/app-config/src/routes/index.ts` 已无该字段                                                                                                                                                                                                           |

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
| 10  | **产物缺运行级追溯**                                              | `packages/database/src/schemas/task.ts:203`；`apps/server/src/services/toolExecution/serverRuntimes/agentDocuments.ts`                                                                                               | **已完成 `ee076357`**        | §8 的「追溯到具体运行」不需要补生产者：文档类 Work 本来就同时记录 `documentId`（`resourceId`）与产出它的会话（`works.originTopicId`），运行时注册路径两个都填。缺口只在投影与显示 —— `getTreePinnedDocuments` 关联 Work 再取 topic 标题，`(resourceType, resourceId, userId)` 唯一故不会重复行；手工挂上的文档关联为 NULL 并如实报 `null`。**原计划（给 `topic_documents` 补生产者）已作废**：那会为已记录的关系再造一套并行关联，落在一张零读取者的表上。卡片上是标签而非链接 —— 点进去需要该运行的 agent id，投影还没有它。两条测试对改动前的模型失败，同时证明新 JOIN 能执行（原生 SQL 不受类型检查保护）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 11  | **`pinToTask` 在成功信号之外调用**                                | `agentDocuments.ts:105-122`（`pinToTask`）与其四处调用点                                                                                                                                                             | **已完成 `263ebf78`**        | attach 从 outcome **外部**移到**内部**，在发出前执行、失败只报告不抛出。原状是一次操作三份矛盾信号：outcome 已记 succeeded、任务没有产物、agent 收到异常。修法同时挡住反向错误 —— 若让 pin 的错误落进外层 catch，会把**已生成**的文档记成 failed，丢失真实产物。只有 `relation === 'created'` 才 attach，与原包装覆盖的三个方法等价；无条件 attach 会让「修改 / 删除已有文档」也去挂引用，删除时的 pin 更会指向已不存在的文档。恢复动作复用既有的 `task.pinDocument`（幂等、只重挂）。回归测试对旧实现报 `promise rejected "Error: pin exploded" instead of resolving`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 12  | **删除底层文档无引用保护**                                        | `src/services/resource/index.ts:264`（`deleteResource`）；`packages/database/src/schemas/task.ts:210-212`（cascade）                                                                                                 | **已完成 `15d06a28`**        | 新增 `assertDocumentsNotPinnedToTasks`，与被删前就并排存在的 `assertContentsNotInRestrictedKnowledgeBase` 同形（同一 `_helpers/` barrel、同样 FORBIDDEN、同样按 `docs_` 前缀分流）。计数**不限于调用者自己的**引用 —— cascade 是全局的。PGlite 测试里有一条**把前提本身证明了**：挂引用 → 删文档 → 引用消失而任务仍在。已知边界：`deleteDocument` 递归删子页面而这里只查调用者点名的 id，已在代码注释写明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 13  | 项目产物列表按协调者而非按项目过滤                                | `src/features/Projects/Workspace/ProjectDashboard.tsx:148-157`（`originAgentId`）                                                                                                                                    | **已完成 `a870f37e`**        | 诊断**更正**：不只是「过滤字段选错」。`works` 表**没有** project 列，项目关联只存在于 `project_works`（多对多），而卡片要的是 `WorkSummaryItem`（带服务端从 `work_versions` 组装的 `event` / `totalCost`），原始行给不出 —— 所以不能改成读 `project_works` 的裸行。最终在既有 `listByWorkspace` 上加 `projectId` 过滤（`exists` 子查询，保住行形状、keyset 游标与 limit；换 inner join 会让 limit 数成 join 匹配数）。另查明 `project.detail` **本就返回** `works`（`apps/server/src/routers/lambda/project.ts:153-161` → `projectModel.listWorks`），全仓**零消费者** —— 卡片当初另查一个端点，而不是用它。附带修掉了「协调者为空时 SWR key 为 null、干脆不请求」这条路径。测试：PGlite 下 4 个新用例（过滤 / 一 Work 挂两项目 / 分页穿透过滤 / 无绑定 + 跨用户 projectId 返回空），客户端 4 项且其中 2 项**已验证对 HEAD 版本失败**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 14  | `project_working_directories` 零消费者                            | `packages/database/src/schemas/project.ts:105`                                                                                                                                                                       | 不清理（观察）               | 表已建但只有 `topic.ts:43` 一个 FK 引用，无 model /router/service 写入。§12 的规矩是本轮不自动清库，故只记录；它也不在本分支新增                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 15  | 残留错误注释 “Bind a goal entity”                                 | `src/services/task.ts:125`；`src/store/task/slices/detail/action.ts:296`                                                                                                                                             | **已完成 `3126df0d`**        | 复核时发现同一句注释共 **4 处**，性质分两类：①`src/services/task.ts` 与 `src/store/task/slices/detail/action.ts` 是纯孤儿注释（后者甚至挂在 `instruction` 上，该类型里连 `identifierPrefix` 都没有）—— 前者改为描述 `identifierPrefix` 的真实契约（`PREFIX-1`，服务端默认 `T`），后者删除；②`apps/server/src/services/toolExecution/serverRuntimes/task.ts` 的注释**描述了一个真实存在的字段** `goal?: {...}`，但该字段**不可达**：`createTaskImpl` 向 `TaskService.createTask` 传的是显式字段清单（其中没有 `goal`），manifest 的 `createTask` 参数也没暴露 `goal`，全文件除声明外零读取 —— 即类型向读者与工具作者宣称了一个不存在的能力，故删除字段与注释。`packages/builtin-tool-task/src/client/executor/index.ts` 同类孤儿注释一并删除（该包 7 文件 45 项测试通过，其中 `manifest.test.ts` / `systemRole.test.ts` 正是「goal 编排不属于任务工具范围」这条既有契约）。**Goal 编排本身未动**                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 16  | ~~渠道平台的 Coming Soon 卡~~ **分类更正**                        | `src/routes/(main)/agent/channel/const.ts:41-64`、`index.tsx:85-89`、`list.tsx:244`                                                                                                                                  | **已核实为非靶点**           | 复核后否掉了我原先的判断：`comingSoon` 是个**真实功能态**而不是营销占位 —— 它决定平台排序、`enableImessage` lab 开关会切换它、详情页据此渲染说明页而非配置表单。这正是 §10 要求**保留**的「真实能力不可用的解释」。真正的靶点是**点了没反应的项**，见 §2.8 的 i18n 清理（`f03a0da6`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 17  | 设置分组未按方案的能力维度重排                                    | `src/features/Settings/hooks/useCategory.tsx`（桌面个人，6 组）；`src/routes/(mobile)/me/settings/features/useCategory.tsx`（移动个人，5 组）；`src/features/WorkspaceSetting/hooks/useCategory.tsx`（工作区，6 组） | **已完成 `3242086a`**        | 诊断：现有分组是**按受众 / 层级**（个人 / 订阅 / 开发者），方案要**按能力**（渠道 / 用量 / 安全 / 数据），这是真实差异。工作区那套已经有「工作区（含 Members）」与「Admin（AuditLog）」符合方案词汇，**不动**；要改的是两个「个人」面。已定映射：①账户与外观 = Profile/Appearance/Hotkey ②通知与渠道 = Messenger/Notification（导航同组、各自的 token 所有人 / 作用域 / 服务端权限不合并，§10 明文要求）③执行环境与 Agent = Provider/ServiceModel/Memory/Proxy/SystemTools ④工具、技能与连接器 = Skill/Connector/Labels/OAuthApps ⑤用量与成本 = Stats/Usage/Plans/Credits/Billing/Referral ⑥安全、权限与审计 = Creds/APIKey（顺带消掉现在 **APIKey 重复出现两次**：一处受 `showApiKeyManage`、一处受 `isDevMode`）⑦数据管理 = Storage/Devices ⑧开发者 = Advanced/Labs/About。实施时的三点修正：①设置侧栏折叠面板的默认展开列表原本**手写六个旧分组 key**，重排会让五个新分组默认折叠并因引用已删枚举而编译失败 —— 改为从分组派生；②`SettingsSearch` 里那条「同一 tab 只索引首次出现」的守卫保留（它是 `visibleTabs` 的承重逻辑），只改掉注释里已失效的例子；③搜索结果 id 内嵌分组键（`tab-<group>-<tab>`）且是上报产品分析的 `result_key`，故这些 id 随改名变化 —— 用户不可见、数据可见，已在 §2.8 记录。两个编码旧分组的测试按新语义**重写**，并新增「同一 tab 不得出现在两个分组」的回归测试（已实测对 HEAD 版本失败） |
| 18  | Agent 配置里的「规则与经验」入口                                  | `src/features/AgentSetting/AgentRules/`                                                                                                                                                                              | **已完成 `73102849`**        | 新增 `ChatSettingsTabs.Rules` 与「规则与经验」tab，受 `enableSelfLearning` 门控；四处注册点（枚举 / 弹层 tab 列表与可用性 / 移动与侧栏列表 / 内容分发）同步改动。刻意**不做成第二个编辑器** —— 读改停用仍在 `/agent/:aid/self-evolving` 上，避免同一 lesson 出现两条写路径                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 19  | 服务端死能力（零消费者，勿在无服务端环境删）                      | `expertiseBindings.enabled`；`expertiseInsights`；`expertise.listLessons`；`actorsByDomain` / `listRuns`                                                                                                             | S80（仅记录）                | 与 §2.7 的成熟度死数据同源：schema 与索引齐备但无生产者。§10 要求「确认无消费者后才移除」，而这几处需要服务端与 CLI 侧一并核验                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### 6. 复核时新发现

**`setting` 命名空间的 15 个 key 名被全局改名改坏了（已修）**

默认源 `packages/locales/src/default/setting.ts` 里是 `storage.actions.copyOrvilo AI.button`
这类名字 —— key 里带**空格**和「Orvilo AI」，而 en-US /zh-CN 里是 `copyLobeAI.*`。
成因是一次把「Lobe」全局替换成「Orvilo」时**连 key 名一起替换了**，不是本轮引入的。

⚠️ **本条此前写错了一句，先更正**：原稿说「这些 key 在英文下根本解析不到」。**是错的** ——
实测这 15 个后缀在 en-US 与 zh-CN 里**都存在正确的 `copyLobeAI.*` 名字，且值与源逐字节相同**，
所以运行时解析正常、UI 没有坏。真正坏的是**默认源**：它的名字与本文件声称的镜像关系脱钩了。

| 事实                                       | 实测                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| 坏 key 数                                  | 15（全部在 `setting`）                                                               |
| 其中有多少是重复条目（另有正确名字的孪生） | **0** —— 这些是它们逻辑 key 在源里的唯一条目                                         |
| 对应的 `copyLobeAI.<后缀>` 在源里存在吗    | 15 个**全都不存在**（所以改名不会产生重名）                                          |
| 在 en-US /zh-CN 里存在吗                   | 15 个**全都存在**，且值与源逐字节相同                                                |
| 全仓调用点                                 | `src` / `apps` 内 `copyOrvilo AI` 与 `copyLobeAI` **都零命中**（消费者在云端私有层） |

**修法**：把源里这 15 个 key 名改回 `copyLobeAI.*`（只替换 key 位置 —— 值里也有「Orvilo AI」，
不能全局替换），源即重新成为两个 JSON 的精确镜像。

**同类残留的规模（原稿说「未测」，现已测）**：枚举 `default/` 全部字面量 key 共 **15,344** 个，
在改名后**没有一个**在 en-US 里缺失 —— 也就是说**这一簇是唯一的**，没有第二处同类损坏。
（覆盖面边界：`color` / `modelRuntime` / `models` / `opStatusTray` / `providers` 五个命名空间的源不是
「字面量 key 表」—— 分别是不带引号的键、字符串数组、由 `model-bank` 生成 —— 本检查不覆盖它们。）

**护栏**：新增 `packages/locales/src/defaultKeys.test.ts`，三条断言 —— 源里不得有含空白的 key 名、
源必须被 en-US 精确镜像、其他语言（zh-CN）覆盖（允许只带本语言用到的复数形态，因为
i18next 的 `zh` 规则只走 `_other`）。反向验证过：把其中一个坏名改回去，三条断言全部失败。

<!-- 此处原有一份同一段落的旧稿（声称「英文下根本解析不到」「影响面未测」，并给出一个已做完的修法）。
     三条都与本节上文相反，已删除：上文 1514-1516 行更正了解析问题，1529-1530 行测了影响面。 -->

---

## 6. S80 运行前的证据要求（本机可确定的部分）

**S80 仍未做**：方案 §13.1 明写「所有质量门禁在 GitHub Actions / 已授权测试环境完成，用户本机只做必要的
只读定位和代码编辑。不要为跳过本地限制而临时设置 `GITHUB_ACTIONS=true`」。
所以本节不是 S80 的替代品，只是把**只有本机能查清**的那部分先钉住，免得远端跑的时候踩空。

### 6.1 `test.yml` 的跳过逻辑会产出「绿色但空」的状态（已核对）

方案 §13.1 警告「`test.yml` 存在重复运行跳过逻辑…… 若运行被全部跳过，不能算通过」。核对成立：

| 项         | 实测                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 动作       | `fkirc/skip-duplicate-actions@v5`（`test.yml:22`）                                                                                        |
| 配置       | `concurrent_skipping: 'same_content_newer'`、`skip_after_successful_duplicate: 'true'`（`:24-25`）                                        |
| 不会跳过的 | `do_not_skip: '["workflow_dispatch", "schedule"]'`（`:26`）                                                                               |
| 门控       | 每个真实 job 都写 `if: needs.check-duplicate-run.outputs.should_skip != 'true'`（`:32`、`:58`、`:152`、`:235`、`:254`、`:304`、`:383` …） |

**后果**：同一份 tree 内容此前成功跑过时，后续运行**整体跳过**，状态是绿的但没有任何 job 真正执行。
`e2e.yml` 用的是同一套模式（`:43` 同一份 `do_not_skip`）。

**因此交付时必须**：引用一次**确实执行**过的运行，给出 commit/tree、工作流名与覆盖范围 ——
而不是贴一个绿色总状态；或改用 `workflow_dispatch` 触发（它在 `do_not_skip` 里，是正常的 CI 入口，
不是 §13.1 禁止的那种本地绕过）。

### 6.2 `test.yml` 现有 job（供引用时写清覆盖范围）

`check-duplicate-run`、`typecheck`、`test-packages`、`test-app`（+ `merge-app-coverage`）、
`test-windows-shell`、`test-desktop`、`test-server`（+ `merge-server-coverage`）、`test-databsae`（原文如此拼写）。

### 6.3 基线自带的红色测试：`src/services/chat/chat.test.ts`（2026-09-16 对照确认）

跑 CI 之前先知道这件事，否则这个红点会被算到本轮头上。**它与本分支无关**：

| 证据             | 实测                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 本分支是否改过它 | **没有**。`git log 58d79735..HEAD -- src/services/chat packages/context-engine` 皆为空                                           |
| 两棵树里的内容   | 工作树与主仓（`main`）**逐字节相同**（`shasum` 均为 `d0d15df7…`）                                                                |
| 对照运行         | 在主仓 `main` 上、`src/services/chat` 与 `packages/context-engine` **均为干净**时运行，**失败完全一致**：同为 7 条、同名、同分布 |

失败形态（本机单跑，非并发）：**6 条快速断言失败**（36–265ms）+ **1 条超时**（`should preserve the topic ID when using the browser runtime`，约 5.1s）。
快速失败的直接原因是：用例中被 mock 的 fetch 返回占位负载 `{"some":"data"}` →
`TRPCClientError: translatedResponse.UnreadableServerResponse`（`TransformResultError: Unable to transform response from server`）
→ 带日期的 system 消息根本没被构造出来 → 断言 `content` 含 `Current date: 2026-09-16 (UTC)` 失败。
即这是**测试桩与新请求路径之间的缺口**，不是产品行为断言。

⚠️ 那条 5.1s 超时属于本文件记录的**第四例同类**（测试体真实耗时贴着默认 5s 预算），
但它在 base 上就如此，且不在本分支改动集内，**故只记录不修** —— 修它要先决定那个桩缺口是产品问题还是测试问题。

### 6.4 哪些验收项**不能**用 Web 证据结清

依据本轮两份审计（§2.2、§2.2.2）与方案 §13.2 的条目，下列项需要平台专有 runner / 真机，
Web 证据不能替代（方案 §13.1：「涉及平台专有 Electron 行为的验证使用合适远端 runner / 已授权测试设备；
Web 测试不能替代原生菜单与标签恢复证据」）：

- **NAV-01 / NAV-02 的 Electron 一侧**：Electron 的登录与 Onboarding 落点是聊天式首页而非看板（§2.2.2），
  这是待定产品分叉，需先在真实桌面构建上看到落点。
- **HOME-02 的宿主唯一性**：`TopicChatDrawer` 在 `(main)` 的双层渲染已在本机用**渲染计数**验证（见 §2.2），
  但「移动端仍恰好一个宿主」只能在真实移动构建上确认；
  Electron 那一侧的宿主粒度是**窗口级**（§2.2），与 Web 的每页一个不是同一命题。
- **折叠几何与首页开屏观感**：本机无法渲染 Electron 开屏页。

**本机已给的是单元 / 集成级证据**（定向 vitest + 渲染计数），按 §13.1 的说法不能当作产品行为验证 ——
「产品行为需要实际界面 / 集成路径验证」。
