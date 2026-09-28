# 工作区上下文与成员关系

`src/business/client/hooks/` 下的 `useActiveWorkspace*` / `useWorkspaceMember*` 一族 hook 提供真实的工作区上下文：当前工作区、成员列表、角色判定、切换语义。本文记录不变量与易踩的坑。

## 数据来源

- `useFetchWorkspaces` 经 tRPC 拉取当前用户可见的工作区集合；`useActiveWorkspaceId` / `useActiveWorkspaceSlug` 从 URL 参数或会话选择中解析活动工作区。
- `useWorkspaceMembers` / `useWorkspaceMemberProfiles` 拉成员与档案；`useIsWorkspaceOwner` / `useIsWorkspaceViewer` 由成员关系推导角色。
- 请求头经 `trpc-headers.ts` 携带活动工作区标识，保证服务端按租户隔离。

## 切换语义

`useSwitchWorkspace` 处理显式切换：更新会话选择并导航到目标工作区的 URL。切换后所有 scoped 查询随工作区 id 变化自然失效。

## Router 边界

`WorkspaceContextSlot` 里的 URL 同步依赖 `useLocation`—— 该 hook 在无 `<Router>` 祖先时抛错。槽位可能在测试树或桌面端的非 Router 挂载点渲染，因此 URL 同步下沉到子组件并用 `useInRouterContext` 门控：有 Router 才挂载同步，无 Router 时槽位仍提供上下文。

## 模块边界

`src/business/` 层从 `react-router`（而非 `react-router-dom`）导入 router API——SPA 构建的模块边界约定，混用会在 Vite 侧解析失败。
