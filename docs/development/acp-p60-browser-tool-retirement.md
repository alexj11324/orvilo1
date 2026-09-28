# P60：退役内置 `orvilo-browser` 工具链

> 对应 PR #76（`feat/acp-P60-browser-use` → `canary`）。ACP 迁移的一环：agent 不再
> 看到或调用应用内置浏览器工具。

## 移除范围

- `packages/builtin-tool-browser` 整包（manifest、executor、inspectors/renders、
  system role）及全部注册点（`builtinTools`、`defaultToolIds`、
  `runtimeManagedToolIds`、renders/inspectors、executor catalog）。
- 服务端 device-proxy runtime（`serverRuntimes/browser.ts`）与 `AgentToolsEngine`、
  `deviceToolRegistry`、`toolEngineering` 中的相关闸门。
- Desktop `BrowserControlCtr` 与 `GatewayConnectionCtr` 的 browser 分支
  （cloud → device 的工具调用转发）。
- 渲染侧 `DesktopBrowserGatewayBridge`、`electronBrowserControlService`、
  `browserControl` IPC 类型、`browserSidebarGatewayToolCall` 事件。
- `lobe_cc` 内置 MCP server 上的 `browser_*` 工具（`ask_user_question` 桥不动）、
  per-op `BrowserRunBinding`、页内 agent overlay 标签链。
- 各 locale `plugin.json` 中的 `orvilo-browser` 键与 `chat.json` 中失效的
  `workingPanel.browser.agent{Controlling,Cursor}` 键。

## 保留范围

- **用户侧浏览器侧边栏**（BrowserSidebarCtr、WorkingSidebar tab、
  navigate/screenshot/element-pick/Chrome 登录导入）—— 这是产品界面，不是
  agent 工具。
- `orvilo-agent-browser` skill —— 外部 `agent-browser` CLI，是存活下来的
  浏览器自动化路径；另有 `orvilo-web-browsing`（search/crawl）。
- claude-code 的 `BrowserMcp` inspector/render —— 保证历史会话里
  `mcp__orvilo_cc__browser_*` 调用仍显示成可读标签。
- `persist:orvilo-browser-app` partition 名 —— 改名会孤立已持久化的 profile。

## 兼容说明

历史会话中的 `orvilo-browser` 工具调用记录降级为通用 `ToolTitle` 行 —— 与任何已
退役内置工具的处理方式一致。
