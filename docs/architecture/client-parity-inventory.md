# Web/Desktop 功能一致性盘点（W0 冻结）

> 基线：`canary @ 24d035c2`。口径：每条记录 入口 → gate → service → API → executor 调用链；
> "动作" 列为 保留 / 统一 / 外壳差异 / 待办 (W2)。`isDesktop` 在 `src/` 共～719 处引用、
> \~257 个文件，绝大多数是合法外壳差异；本清单只列**业务相关**条目。

## 0. 入口与启动

| 项             | Web                                                                                     | Desktop                                                                         | 判定     | 动作                                                           |
| -------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------- |
| SPA 入口       | `src/spa/entry.web.tsx`                                                                 | `src/spa/entry.desktop.tsx`（注册本地 DB 适配器、bootstrap identity、OTA ping） | 外壳差异 | 保留                                                           |
| 主路由         | `desktopRouter.config.tsx` → 共享树 + `/onboarding` + web-only                          | `desktopRouter.config.desktop.tsx` → TabHost stubs + `/desktop-onboarding`      | **差异** | `/onboarding` 双端统一；`/desktop-onboarding` 变共享兼容重定向 |
| 构建条件解析   | `plugins/vite/platformResolve.ts`：`.desktop.`/`.vite.` 后缀替换；`__ELECTRON__` define | 同左                                                                            | 机制保留 | `.desktop.*` 业务语义审计（见 §5）                             |
| 首屏 BootShell | `BootShell/routeScope.ts`                                                               | 同                                                                              | 一致     | 保留                                                           |

## 1. Onboarding / 认证

| 项                                                  | 现状                                                                                                                                                                                 | 判定                   | 动作                                                                                        |              |                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------- | ------------ | ----------------------------------- |
| `/onboarding`                                       | `src/features/Onboarding`：资料 /telemetry/ 建 workspace / 邀请 /setup 持久化；服务端 `finishedAt` 权威                                                                              | 统一流程               | 保留；补 CONFLICT 幂等恢复与 Desktop 完成标记写入                                           |              |                                     |
| `/desktop-onboarding`                               | `src/features/DesktopOnboarding`：Welcome/Permissions/DataMode/Login 独立状态机；sessionStorage `completed` + localStorage `everCompleted` + main-store `desktopOnboardingCompleted` | **独立业务状态机**     | 退役状态机 → 兼容重定向（未认证→LoginStep 连接面；已认证→`/onboarding` 或 `/`）             |              |                                     |
| DataMode telemetry                                  | 旧流程写 `updateGeneralConfig({telemetry})`                                                                                                                                          | 重复职责               | 统一 onboarding 已覆盖                                                                      |              |                                     |
| OS 权限（macOS 通知 / 磁盘 / 麦克风 / 屏幕 / 辅助） | `PermissionsStep`（onboarding 内）                                                                                                                                                   | 错位归属               | 迁 `Settings/devices` 设备设置面                                                            |              |                                     |
| `BrowserManager` 启动门控                           | \`!isRemoteServerConfigured                                                                                                                                                          |                        | store.desktopOnboardingCompleted===false`→ 首屏`/desktop-onboarding\`                       | 外壳启动信号 | 保留；renderer 兼容入口接管后续路由 |
| `useSignOut`                                        | Desktop 清 `remoteServerConfig` → `/desktop-onboarding?screen=login`                                                                                                                 | 基本一致               | 保留（兼容入口渲染连接面）                                                                  |              |                                     |
| `DesktopAutoOidcOnFirstOpen`                        | session `completed` 门控 + `storageMode==='cloud'` + 一次性 flag → 自动 OIDC                                                                                                         | 依赖本地标记           | 改 `everCompleted` 门控（统一流程完成时写入）                                               |              |                                     |
| `useUserStateRedirect`                              | Web：`needsOnboarding`→`/onboarding`；Desktop：no-op（靠主进程门控）                                                                                                                 | **分叉**               | 统一为同一 `needsOnboarding` 逻辑双端生效                                                   |              |                                     |
| 401 恢复                                            | Web：`lambda.ts` logout→`/signin` 或 `loginRequired`；Desktop：renderer 跳过，主进程代理对 `X-Auth-Required` 401 广播 `authorizationRequired`→`AuthRequiredModal`                    | 机制不同、结果部分等价 | 统一 `sessionAuthEvents`；renderer 401 无 header 时 Desktop 也进恢复面（W0 已核实既有链路） |              |                                     |
| workspace.create 幂等                               | 仅内存 `createdWorkspaceRef` 防重；CONFLICT 报错                                                                                                                                     | **缺口**               | 客户端捕获 CONFLICT→`workspace.list` 按 slug 复用（服务端 intent key 列为待办）             |              |                                     |

## 2. 执行目标 / Agent 会话

| 项                                                                          | 现状                                                                                        | 判定                        | 动作                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------- |
| `resolveExecutionTarget`                                                    | 默认 `clientAvailable?'local':'none'`；hetero none→local/sandbox；Web unbound local→sandbox | **查看端推导 + 隐式云回退** | 改契约（见 contract §2）：默认 `none`；删隐式升级              |
| `resolveExecutionPlan`                                                      | hetero + `sandboxAvailable` → `sandbox` 兜底                                                | 隐式云回退                  | 删；hetero 无绑定停 `none` 待选                                |
| `selectRuntimeType`                                                         | `local`→`hetero`(renderer IPC spawn)；其他→`gateway`                                        | local = 显式选择时保留      | 保留；`clientExecutionAvailable` 参数语义改 "本端可进程内执行" |
| `heterogeneousAgentExecutor`                                                | renderer 私有 IPC 生命周期（start/prompt/cancel/stop/intervention），无服务端准入 / 持久化  | **已知缺口**                | W2-E：本机执行接入统一 ingest 链路；本轮记录为 gap             |
| `heterogeneousAgentCatalogService.listModels`                               | `deviceId ? tRPC : electronIPC`                                                             | 隐式 IPC 回退               | `assertLocalTargetTransport` 显式化；Web→`TargetRequiredError` |
| `fetchClaudeCodeQuotaSnapshot` / `gitService` / `projectFileService`        | 同上 `deviceId?` 双传输                                                                     | 同左                        | 同左                                                           |
| `heterogeneousAgentExecutor` 的 `submitIntervention`（conversationControl） | 仅 local 会话可达                                                                           | 同生命周期缺口              | W2-E 一并收敛                                                  |
| 服务端 hetero 生命周期                                                      | `apps/server/services/heterogeneousAgent`：ingest/finish/generation/admission/fanout        | 统一链路已存在              | 复用，不重建                                                   |
| device router                                                               | `apps/server/routers/lambda/device.ts`：capability/scan/git/files/quota/list/share/register | 完整可复用                  | 复用；Codex quota RPC 缺口列待办                               |
| `useSelectExecutionTarget`                                                  | `local` 选择时绑定本机 `gatewayDeviceInfo.deviceId`                                         | 显式绑定                    | 保留                                                           |

## 3. 工具 / 技能可用性

| 项                                                         | 现状                                                          | 判定       | 动作                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| `toolFilters.shouldEnableTool`                             | LocalSystem/Auv → `isDesktop`                                 | 查看端过滤 | 改 `canExecuteOnDevice` 上下文（默认 `isDesktop` 兼容；运行侧传计划能力） |
| `skillFilters`                                             | 已有 `canExecuteOnDevice` 上下文                              | 模式正确   | 对齐 toolFilters                                                          |
| `toolAvailability`                                         | `isDesktop` 上下文已有，工具分支走旧签名                      | 部分       | 对齐同一上下文字段                                                        |
| 服务端 `buildAllowedBuiltinTools`                          | `canUseDevice`/`deviceLocked`/`supportedDeviceTools` 物理过滤 | 已能力驱动 | 保留                                                                      |
| 展示侧（`displayableAgentPlugins`/`PluginTag`/ShareModal） | 按查看端隐藏 local-system                                     | 过度隐藏   | 展示侧显示已配置工具（能力 = 目标设备，不 = 查看端）                      |

## 4. 数据 / 权限（复用不重建）

`assertWorkspaceDeviceVisible` / `assertWorkspaceRootApproved` / `DeviceModel` /
`workspaceAuth` (wsProcedure/wsCompatProcedure/requireWorkspaceRole) /
`filterAuthorizedDevicePresence` / `signWorkspaceDeviceToken` /generation 隔离 /
`agentDeviceOverrides` 成员覆盖 —— 全部保留，重构不得绕过。

## 5. `.desktop.*` 业务语义审计

| 文件                                                                                                                                                                              | 性质                   | 判定               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------ |
| `desktopRouter.config.desktop.tsx`                                                                                                                                                | 平台路由适配           | 允许（薄适配）     |
| `componentMap.desktop.ts`（settings）                                                                                                                                             | 同步 vs dynamic import | 允许，有 sync test |
| `entry.desktop.tsx` / `_layout/index.desktop.tsx` / `agent、group/index.desktop.tsx`                                                                                              | 外壳装配               | 允许               |
| `useActiveLocation/RouteParams`、`useWorkspaceAwareNavigate`、`WorkspaceLink`、`appNavigate`、`useWorkspaceSyncPathname`、`useAgentConversationCoordinate`、`usePortalColumnHost` | 导航 / 布局适配        | 允许（外壳）       |
| `better-auth/auth-client.desktop.ts`                                                                                                                                              | 认证传输适配           | 允许（适配器）     |
| `orvilo-skills.desktop.ts`（builtin executor）                                                                                                                                    | 设备端执行器           | 允许（target 侧）  |
| `useLocalFileTag.desktop.ts`                                                                                                                                                      | 本机路径引用           | 允许（target 侧）  |
| `getUILocaleAndResources`/`loadI18nNamespaceModule`/`appVersion`/`SWRMutateInitializer`/`ElectronAppStateSync`/`NavigatorRegistrar`                                               | 外壳 / 资源            | 允许               |

## 6. 深链接 / 导航保留段

`/desktop-onboarding` 已列入 `RESERVED_FIRST_SEGMENTS`、`PERSONAL_PATH_REGEX`、
`PERSONAL_TOP_LEVEL_SEGMENTS` —— 统一后保留这些声明（兼容入口仍在该路径）。

## 7. 待办缺口（非本轮完成项）

- W2-E：Desktop local hetero 会话接入统一服务端准入 / 事件链路（renderer 私有 operation 退役）。
- W2-D：`localFileService`/`desktopSkillRuntime`/`terminal`/`heteroSession`/`CodexQuotaMenu` 等剩余 IPC 业务入口审计。
- 服务端：`workspace.create` 意图键幂等；Codex quota device RPC 补齐。
- 架构门禁：AST / 导入边界规则（contract §10 对应项）与 E2E 矩阵 —— 本轮只完成单测层。
