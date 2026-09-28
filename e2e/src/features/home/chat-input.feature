# HOME-CHAT-COLD-001 ("Home 默认输入发送后应跳转到新建 Topic") was retired with S20.
#
# Web's index slot renders `WebHomeRedirect` (`src/spa/router/desktopRouter.config.tsx`),
# so `/` resolves to the task list, and the composer there creates a task — it no
# longer opens an agent chat, which is exactly what this scenario asserted. Home
# itself still ships, but only in Electron's per-tab index slot, and this suite
# runs the Web app.
#
# The Web half of the contract stays pinned by unit tests, which assert the
# redirect and the task-mode default directly:
#   - `src/spa/router/WebHomeRedirect.test.tsx`
#   - `src/features/Home/__tests__/homeDashboard.test.tsx`
# The Electron cold-start path this scenario described now has no automated
# coverage; it is recorded as BLOCKED in `docs/development/task-first-rollout.md` §7.4
# rather than silently dropped.
@journey @home @chat-input
Feature: Home 页面默认 Chat Input 发送链路
  作为用户，我希望首次从 Home 页面发送默认消息时，可以稳定进入新建 Topic 对话页面

  # No scenarios remain: since S20 this Feature describes an Electron-only surface.
