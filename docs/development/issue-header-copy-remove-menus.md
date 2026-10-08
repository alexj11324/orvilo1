# Issue 详情页头部菜单：Copy / Remove 子菜单

Issue 详情页头部的 `⋯` 溢出菜单（`src/features/AgentTasks/AgentTaskDetail/TaskDetailHeaderActions.tsx`）把剪贴板动作收进一个 **Copy** 子菜单，并新增一个 **Remove** 子菜单用来解除父子关系与关联。本文记录菜单结构与不变量 —— 由 `TaskDetailHeaderActions.test.tsx` 和 `useTaskCopyActions.test.ts` 中的用例钉死。

## 菜单结构

```plaintext
Copy ▸        复制 ID / 复制链接 / 复制标题 / 以链接形式复制标题 / 复制为 Markdown / 复制分支名（仅绑定工作区时）
Remove ▸      父 Issue / 子 Issue / 相关 · 被阻塞 · 阻塞方 Issue（仅在存在关联时出现）
──────
Move to… / Copy to…   （`useTaskTransferMenuItem`，保持不变）
──────
Delete
```

## 不变量

- **Copy 的值与轨道按钮一致**。所有剪贴板动作都来自 `useTaskCopyActions`，复制链接沿用同一个带工作区前缀、带标题 slug 的 URL。
- **标题回退**。未命名的 Issue 用标识符（再退到 task id）作为标题，保证 “以链接形式复制标题” 始终有链接文本。
- **Markdown 格式**为 `# <标识符>: <标题>`、描述（`instruction`）、链接三段，以空行分隔；描述为空时整段省略，不留空块。
- **Remove 只读已加载的详情**。条目完全由详情 store 里的 `parent`、`subtasks`（仅直接子 Issue）、`dependencies` 推导，不额外发请求；什么都没关联时不渲染 Remove，而不是留一个禁用的空子菜单。
- **条目标签描述的是对端 Issue**，标识符放在右侧 `extra`：`direction: 'blocking'` 的边显示为 “被阻塞的 Issue”，`blockedBy` 的边显示为 “阻塞方 Issue”。
- **解除走现有 store 动作**：
  - 父 / 子 Issue → `updateTask(<子端 id>, { parentTaskId: null })`。该动作自带失败 toast，并会刷新父子两端的详情与列表。
  - 关联 → 有 `relationId` 时走 `removeIssueRelation`，否则走 `removeDependency`，端点选择与 `TaskPrerequisites` 里的关联行完全一致；失败时提示 `taskDetail.menu.removeFailed`。
- **权限**。没有 `create_content` 权限时 Remove 条目全部禁用（与 Delete 一致）；Copy 始终可用。

## 范围之外

这次只做 Copy 分组和 Remove。团队转移重写、截止日期 / 重复 / 链接资源、“创建关联 / 标记为” 弹窗、“复制全部内容”、收藏星标位置等都不在此改动内；依赖 `taskMenu` 服务端路由的条目（移除重复关系、移除链接、重复规则）在该路由落地前不提供。

## i18n

Copy 子菜单复用列表右键菜单已有的 `taskList.contextMenu.copy*` 文案。新增的键只有 `taskDetail.menu.remove`、`removeParent`、`removeSubIssue`、`removeRelated`、`removeBlocked`、`removeBlocking`、`removeFailed`。
