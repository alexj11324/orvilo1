# Issue 详情页头部菜单

Issue 详情页头部的 `⋯` 溢出菜单（`src/features/AgentTasks/AgentTaskDetail/TaskDetailHeaderActions.tsx`）参照 Plane 的 work-item quick actions 与 Linear 的 Issue 菜单组织：打开 / 复制、创建副本 / 解除关联、转移、取消 / 重新打开、删除。本文记录菜单结构与不变量 —— 由 `TaskDetailHeaderActions.test.tsx`、`useTaskCopyActions.test.ts`、`taskMarkdown.test.ts` 和 `src/features/Electron/navigation/appNavigate.test.ts` 中的用例钉死。

## 菜单结构

```plaintext
在新标签页中打开
Copy ▸        复制 ID / 复制链接 / 复制标题 / 以链接形式复制标题 / 复制为 Markdown / 复制分支名（仅绑定工作区时）
──────
创建副本
Remove ▸      父 Issue / 子 Issue / 相关 · 被阻塞 · 阻塞方 Issue（仅在存在关联时出现）
──────
Move to… / Copy to…   （`useTaskTransferMenuItem`，保持不变）
──────
取消 Issue  ⇄  重新打开 Issue
──────
Delete
```

## 不变量

### 在新标签页中打开

- 菜单只调用 `appNavigate(path, { target: 'newTab' })`，不自己判断平台；“标签页” 是什么由宿主适配层决定：桌面端（`appNavigate.desktop.ts`）在应用自己的标签栏里开新标签，Web 端（`appNavigate.ts`）没有应用内标签，用 `window.open(<带工作区前缀的路由>, '_blank', 'noopener,noreferrer')` 开浏览器标签。
- 共享的 feature 代码里不允许出现 `isDesktop` 分支（`checkHostDeviceBoundaries` 会拦），所以 Web 端的 `newTab` 支持加在适配层里。
- 路由与 “复制链接” 同源：都来自 `useTaskCopyActions` 的 `taskPath`。

### Copy

- **值与轨道按钮一致**。所有剪贴板动作都来自 `useTaskCopyActions`，复制链接沿用同一个带工作区前缀、带标题 slug 的 URL。
- **标题回退**。未命名的 Issue 用标识符（再退到 task id）作为标题，保证 “以链接形式复制标题” 始终有链接文本。
- **Markdown 不拼接原始用户文本**。链接与文档都经由纯函数 `taskMarkdown.ts` 生成：
  - 标题里的 `\`、`[`、`]` 被反斜杠转义，换行折叠成空格。像 `x](javascript:alert(1)) [y` 这样的标题只会停留在链接文本里，无法提前闭合链接、塞进自己的目标地址。
  - URL 只由应用 origin 加路由构成，标题只以 slug 形式进入；`(`、`)`、`<`、`>` 和空白再做百分号编码。
- **Markdown 文档格式**为 `# <标识符>: <标题>`、描述（`instruction`）、链接三段，以空行分隔；描述为空时整段省略。描述本身就是作者写的 Markdown，原样带出。

### 创建副本

- 通过现有的 `createTask` 新建一个 Issue，预填：标题（加 “（副本）” 后缀）、描述 / 编辑器内容、优先级、项目、团队、Agent 与成员负责人、可见性；标签没有创建期字段，创建后逐个 `toggleTaskLabel` 补挂。
- **不带走**父 Issue、关联、定时 / 自动化配置和状态 —— 副本是一个处于默认状态、没有任何关联的新 Issue。
- 创建成功即视为成功：个别标签补挂失败不会把已落库的副本报成失败。成功后跳到新 Issue；创建失败提示 `taskList.contextMenu.copyFailed` 并留在原页。
- 已有创建在进行中（`createTask` 返回 `null`）时什么都不做。

### Remove

- **只读已加载的详情**。条目完全由详情 store 里的 `parent`、`subtasks`（仅直接子 Issue）、`dependencies` 推导，不额外发请求；什么都没关联时不渲染 Remove，而不是留一个禁用的空子菜单。
- **条目标签描述的是对端 Issue**，标识符放在右侧 `extra`：`direction: 'blocking'` 的边显示为 “被阻塞的 Issue”，`blockedBy` 的边显示为 “阻塞方 Issue”。
- **解除走现有 store 动作**：
  - 父 / 子 Issue → `updateTask(<子端 id>, { parentTaskId: null })`。该动作自带失败 toast，并会刷新父子两端的详情与列表。
  - 关联 → 有 `relationId` 时走 `removeIssueRelation`，否则走 `removeDependency`，端点选择与 `TaskPrerequisites` 里的关联行完全一致；失败时提示 `taskDetail.menu.removeFailed`。

### 取消 / 重新打开

- 相当于 Plane 的 Archive / Restore。`workflowCategory` 为 `canceled` 或 `done` 时显示 “重新打开”，否则显示 “取消”，两者互斥。
- 都走共享的状态命令 `useIssueStatusMove`（与看板、状态选择器同一条 CAS 写入，失败提示也由它负责）：取消 → `canceled`，重新打开 → `todo`。只有进入 `in_progress` 才会自动起跑，所以重新打开不会触发运行。
- 图标取自 `WORKFLOW_CATEGORY_VISUALS` 中目标状态的标记，不另画一套状态图形。

### 权限

没有 `create_content` 权限时，创建副本、Remove 条目、取消 / 重新打开、Delete 全部禁用；在新标签页中打开与 Copy 始终可用。

## 范围之外

- “添加子 Issue” / “添加关联” 快捷入口：现有入口是 `TaskSubtasks`、`TaskPrerequisites` 的组件内部状态，从头部菜单触发需要新的跨组件通道，暂不做。
- Plane 的 “Edit”：详情页本身就是就地编辑，没有对应动作。
- 团队转移重写、截止日期 / 重复 / 链接资源、“创建关联 / 标记为” 弹窗、“复制全部内容”、收藏星标位置。
- 依赖 `taskMenu` 服务端路由的条目（移除重复关系、移除链接、重复规则）在该路由落地前不提供。
- 列表行右键菜单没有同步加这几项；头部菜单复用了它已有的 Copy 文案与提示。

## i18n

Copy 子菜单复用列表右键菜单已有的 `taskList.contextMenu.copy*` 文案，“在新标签页中打开” 复用 `topic:actions.openInNewTab`，副本的成功 / 失败提示复用 `taskList.contextMenu.copySuccess` / `copyFailed`。新增的键：`taskDetail.menu.makeCopy`、`copyOfTitle`、`cancel`、`reopen`、`remove`、`removeParent`、`removeSubIssue`、`removeRelated`、`removeBlocked`、`removeBlocking`、`removeFailed`。
