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

### 1.7 待补清单

以下功能域的清单仍在收集中，收集完成后补入本节：

- [ ] 社区 / 文稿残留（S30.1）
- [ ] 个人画像（S30.3）、通用评测（S30.4）、公共访客分享（S30.5）
- [ ] Goal（S60.1）与规则 / 经验（S60.2）
- [ ] 设置分组与渠道（S70）

---

## 2. 工作包状态

| 工作包                   | 实现状态     | 验证状态         | commit / 证据                    | 保留依赖 / 阻塞                                                          |
| ------------------------ | ------------ | ---------------- | -------------------------------- | ------------------------------------------------------------------------ |
| S00 基线与依赖清单       | IN\_PROGRESS | NOT\_RUN         | 本文                             | 见 §1.7 待补                                                             |
| S10 统一入口与偏好迁移   | IMPLEMENTED  | REVIEW\_APPROVED | `e66656d4` `440f1bc2` `880af5de` | review 通过；本机 550+ 项测试通过；待 CI 类型检查；跟进项已挂工作包见 §5 |
| S20 默认看板、旧首页卸载 | IN\_PROGRESS | CI\_PENDING      | `fb1a52a6`（视图偏好部分）       | 旧首页卸载未做，见 §2.2                                                  |
| S30 独立功能退役         | TODO         | NOT\_RUN         | —                                | 依赖 S00、S10                                                            |
| S40 自动化整合           | TODO         | NOT\_RUN         | —                                | 依赖 S10、S20                                                            |
| S50 资源与产物归位       | TODO         | NOT\_RUN         | —                                | 依赖 S00                                                                 |
| S60 Goal 与规则下沉      | TODO         | NOT\_RUN         | —                                | 依赖 S20、S50                                                            |
| S70 设置、文案与依赖清理 | TODO         | NOT\_RUN         | —                                | 依赖各功能工作包                                                         |
| S80 远端验收与证据       | TODO         | NOT\_RUN         | —                                | 覆盖全部                                                                 |

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

**未完成 —— 旧首页卸载（S20 剩余部分）**

调研已定位到三个必须一起处理的耦合点：

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

3. **`src/features/HomeLayout/index.tsx` 不只是外壳**：
   除 `Activity` 常驻机制外，它还挂着 **`HomeAgentIdSync`** 和 **`RecentSync`** 两个同步组件
   （`:64-65`）。**卸载 Home 前必须先查清这两个组件做什么** —— 否则会静默丢掉行为。
   另需迁移 `TopicChatDrawer`、`AcceptancePortalDrawer` 两个真实交互宿主
   （`src/features/Home/index.tsx:455-464`），并保证「每页恰好一个宿主」。

4. **移动路由**需一并核对（`mobileRouter.config.tsx`）。

**建议顺序**：先查清 `HomeAgentIdSync` / `RecentSync` → 迁移两个抽屉宿主到独立挂载点 →
处理 Web index 跳转（保持 Electron 的每标签页注入不变）→ 再卸载
`DesktopHomeLayout` + `DesktopHome` → 最后删 `HomePortrait` / `PortraitBubble` 与装饰预设。

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

| #   | 项                                                   | 说明                                                                                                                                          |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **与 `bbd6ead3` 存在两套并行退役机制（需人工收敛）** | 见下方 §4.1                                                                                                                                   |
| 2   | **S30/S50 删除缺本地类型检查兜底**                   | 生成链是进程内 `createCaller`，删错只在 `apps/server` tsc 暴露；而本轮禁止本机跑类型检查。需要靠 CI 的 `Typecheck` job 兜底，或申请一次性例外 |
| 2   | `DndContextWrapper` 提升顺序                         | S50 必须先提升该宿主再下沉 ResourceManager，否则主布局 import 断                                                                              |
| 3   | 「自动化」命名与方案的差异                           | 已按用户裁决执行；S40 落地时确认路由层做法                                                                                                    |
| 4   | 桌面固定标签页迁移                                   | 独立于侧栏偏好的第二套存储，S10 需单独实现                                                                                                    |
| 5   | `electronKey` 死字段                                 | 待 S70 确认无动态消费者后清理                                                                                                                 |

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

| #   | 项                                                                | 位置                                                                                                       | 归属                  | 为什么是那时做                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **桌面固定标签页无退役过滤**                                      | `src/features/Electron/titlebar/TabBar/storage.ts:25-45`；`src/store/electron/actions/tabPages.ts:579-585` | **S30**               | S10 里唯一未兜住的持久化路径。当前 `/image`、`/memory` 路由仍在，标签页尚可打开；**S30 删除路由后**被恢复的标签页会落在退役页上，那时才有真实后果。合并时把 `RETIRED_PRODUCT_SEGMENTS` 改为从 registry `tier` 派生 |
| 2   | 「管理记忆」按钮仍跳退役页                                        | `src/features/Settings/memory/features/ManageMemoryButton.tsx:22`                                          | S30.3                 | 应用自己生成的入口，非旧深链接                                                                                                                                                                                     |
| 3   | FTS 搜索结果跳退役页                                              | `src/features/CommandMenu/SearchResults.tsx:165`（另见 :209、:250）                                        | S30.3                 | 同上                                                                                                                                                                                                               |
| 4   | 死字段 `NavigationRoute.electronKey`                              | `packages/app-config/src/routes/index.ts:35`，10 条目各填一次，定义外零读取                                | S70                   | 连带本分支新增的 `navigation.project` 文案目前只喂这个死字段。**注意 `navigation.*` 命名空间本身没死**（`AgentTasks/routeMeta.ts:15` 等仍在用）                                                                    |
| 5   | 死枚举 `GroupKey.Community` / `GroupKey.Pages`                    | `src/features/HomeSidebar/Body/index.tsx:35,36`                                                            | S70                   | 零消费者                                                                                                                                                                                                           |
| 6   | 死枚举 `SidebarTabKey.Community / Image / Memory / Pages / Video` | `src/store/global/initialState.ts`                                                                         | S70                   | 除定义外引用数均为 0                                                                                                                                                                                               |
| 7   | 变死的 feature flag `showMarket`                                  | `packages/app-config/src/featureFlags/schema.ts:156`                                                       | S70（或随社区线清理） | 唯一 UI 消费者是 `useNavLayout` 与移动 NavBar，本分支删掉后全仓已无非测试消费者                                                                                                                                    |
| 8   | `missingBottom` 分支不可达                                        | `src/store/global/selectors/systemStatus.ts`（`withAllKnownKeys` 内）                                      | 不清理                | `DEFAULT_BOTTOM_KEYS` 本身仍被 `normalizeSpacerPosition` 使用；已加注释说明「为未来 bottom 组默认值保留」                                                                                                          |
