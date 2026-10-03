# Web/Desktop 边界基线审计（WD-00）

> 基线：`canary @ 2fb63e750d853294d131c35d205146984e98377f`（PR #427 合并后）。
> 性质：源码审阅，每条给真实路径；无路径证据的条目标 "待核实"，不写 "已修复"。
> 配套：`web-desktop-architecture.md`（ADR）、`web-desktop-boundary-plan.md`（实施规范）、
> `client-parity-contract.md`（冻结契约，规范源）。

## 0. 判定口径

| 面      | 回答的问题                                                | 允许依赖                               |
| ------- | --------------------------------------------------------- | -------------------------------------- |
| Product | 用户能做什么（会话、Issue、Automation、设备清单）         | 服务端权限 + 业务配置，不看查看端      |
| Host    | 当前访问外壳能做什么（窗口、托盘、原生对话框、OTA、外链） | `isDesktop` / HostPort                 |
| Device  | 目标机器能执行什么（Prime/Codex、文件、Git、终端、MCP）   | `deviceId` + deviceCapabilities + 授权 |

`isDesktop` 只许出现在 Host 面；用它选执行机器 = 违规。设备操作必须显式
`deviceId`（或显式 `local` 传输），不允许 "缺省 = 本机"。

## 1. 已核实违规 / 缺口

| 位置                                                                 | 证据                                                                                                                                                                                                                                                                                                                                                                  | 类别                       | 处置（工作包）                                           |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------- |
| `packages/types/src/agent/deviceExecution.ts`                        | `resolveExecutionDevice`：`sessionBoundDeviceId` 不在合法候选时 `pick()` 返回 undefined → 继续落到 explicit/preference/default/single-candidate；`isDeviceBindingInvalid` 是独立 opt-in helper，调用方漏检即静默换绑。显式请求未授权设备同样被静默忽略。`explicitRequestAllowed === false` 只挡 explicit，挡不住 `userAgentPreferenceDeviceId` 覆盖 policy-fixed 默认 | Device 解析                | WD-01（本 PR 修复，见 §3）                               |
| `src/services/targetRequiredError.ts`                                | `requireLocalExecutionTransport` 放行 `deviceId \|\| isDesktop` —— Desktop 无 ID 即本机                                                                                                                                                                                                                                                                               | 隐式本机语义               | WD-04 收敛为显式 local-device 身份；WD-01 先在契约层声明 |
| `src/services/projectFile.ts`                                        | `readProjectFileBytes`：`if (deviceId \|\| !isDesktop) return undefined` —— 设备调用静默返回空                                                                                                                                                                                                                                                                        | 不支持 → undefined         | WD-04：返回 `OPERATION_UNSUPPORTED` 或补真实字节链路     |
| `src/services/mcp.ts`                                                | `isDesktop && isStdio`（stdio MCP 进程随查看端漂移）、`isDesktop && isLocalOrPrivateUrl`（localhost 归属网络空间按查看端判断）                                                                                                                                                                                                                                        | 查看端推导执行位置         | WD-04：按连接作用域 + 目标 deviceId 路由                 |
| `src/features/Settings/about/features/Version.tsx`                   | 非桌面分支渲染 `upgradeVersion.action` → `MANUAL_UPGRADE_URL`（自托管 upstream-sync 文档）；运行时 `getElectronIpc()` 与编译期 `isDesktop` 两套探测并存                                                                                                                                                                                                               | Host 语义错位 + 探测不统一 | WD-05：hosted 部署隐藏或改指下载页；统一探测             |
| `src/store/chat/slices/agentRun/actions/dispatch/agentDispatcher.ts` | `AgentRuntimeType = 'client'\|'gateway'\|'hetero'`；`clientExecutionAvailable: isDesktop` —— 平台参与执行路由                                                                                                                                                                                                                                                         | 传输模型残留               | WD-03：迁移到执行意图 + 权威设备上下文                   |
| `src/services/` 剩余 IPC 业务入口                                    | `localFileService`、`desktopSkillRuntime`、`terminal`、`heteroSession`、`CodexQuotaMenu`（client-parity-inventory §7 W2-D 清单）                                                                                                                                                                                                                                      | 隐式本机传输               | WD-04 逐项审计                                           |
| `apps/server` hetero 生命周期 vs renderer 私有 IPC                   | Desktop `local` hetero 会话走 `heterogeneousAgentExecutor`（`src/store/chat/slices/agentRun/actions/transports/hetero/`），不经服务端准入 / 持久化，Web 不可观察（W2-E）                                                                                                                                                                                              | 生命周期分叉               | WD-03：本机执行经 device gateway ingest 链路             |

## 2. 已核实合规（保留）

| 位置                                                           | 说明                                                                                                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/development/device-execution-contract.md`                | 冻结契约：优先级链、绑定失效、0/1/N selector、RunSubject、ResolvedRunIdentity —— 规范源，不改语义                                                                         |
| `packages/types/src/agent/deviceExecution.ts` 类型层           | `DeviceCandidate` / `isSelectableDevice` / `isRunnableDevice` / `shouldShowDeviceSelector` / `RunSubject` / `HARNESS_ADAPTER_BY_AGENT_TYPE` —— 语义正确，保留             |
| `apps/server/src/services/deviceGateway/authorizedToolCall.ts` | 派发前 `resolveDeviceDispatchAuthorizationFailure` 复查 —— 保留，不得绕开做本机 fast path                                                                                 |
| `packages/device-control/src/dispatch.ts`                      | Desktop 与 CLI 共用设备 RPC 分发（git/file/skill/quota handlers）—— 复用，不建第二套 Device SDK                                                                           |
| `apps/cli/src/device/agentRun.ts` + `agentRunRegistry.ts`      | 进程组 liveness、kill 确认、注册去重 —— 设备侧生命周期复用                                                                                                                |
| `packages/app-config/src/routes/settings.ts`                   | `SETTINGS_CAPABILITIES`：offered/gate/status/aliasOf + 直接访问解析（`unknown`/`unavailable`/`redirect`）—— 已含宿主 gate（Proxy、SystemTools = `isDesktop`），扩展不复制 |
| `src/features/Settings/hooks/useSettingsCapability.ts`         | 单一 context 构造点，registry 保持纯函数 —— 模式正确                                                                                                                      |
| `apps/collaboration-gateway`                                   | ws 房间 /ticket 中继 —— 传输层，不碰业务决策                                                                                                                              |
| `apps/server/router-hono/webhooks/*`                           | webhook 接收在服务端（mcpEvents → inbox → admission → dispatch）—— Web 端配置 / 验证是正确入口                                                                            |
| `src/features/DeviceManager/*`                                 | 设备清单 / 连接 UI 已独立于查看端                                                                                                                                         |
| `src/spa/entry.{web,desktop}.tsx`                              | 双入口已分离（desktop 注册本地 DB 适配 + rendererOta）—— HostPort 注入点                                                                                                  |

## 3. WD-01 契约修复（本 PR 落地）

`resolveExecutionDevice` 现在按以下顺序裁决（全部在 `packages/types` 纯函数内）：

0. `deviceInventoryComplete === false` → `DEVICE_INVENTORY_INCOMPLETE`（不判 0/1，不自动绑定）。
1. `sessionBoundDeviceId` 已设置：合法 → resolved `session_bound`；失效（删除 / 撤权 / 不兼容）→ `DEVICE_BINDING_INVALID` + `repairCandidates`，**不再进入任何 fallback**（显式请求也不混为正常 resume，修复是单独受权动作）。
2. `explicitRequestAllowed !== false` 且 `explicitDeviceId` 已设置：合法 → `explicit_request`；不在合法候选 → `DEVICE_REQUEST_UNAUTHORIZED`（拒绝，不跑默认设备）。
3. `explicitRequestAllowed !== false` 时查 `userAgentPreferenceDeviceId`；**policy-pinned（false）跳过偏好**，成员不能覆盖固定默认。
4. `agentDefaultDeviceId` → `agent_default`。
5. 唯一合法候选 → `single_candidate`。
6. `DEVICE_REQUIRED` / `DEVICE_SELECTION_REQUIRED`。

新增中立契约（纯类型，无 React/Electron/DB 依赖）：

- `packages/types/src/host.ts` — `HostKind`/`HostCapability`/`HostContext`（宿主正交维度；`localDeviceId` 仅 "本机标记"，非默认目标）。
- `packages/types/src/device/operation.ts` — `DeviceResourceRef`、`DeviceActionSubject`（resource / run）、`DeviceOperationAvailability`（ready/loading/unsupported/blocked/unavailable）、`DeviceOperationError`（`OPERATION_UNSUPPORTED` 等，`undefined` 不再兼任 "不支持 / 不存在 / 失败"）。

`isDeviceBindingInvalid` 保留为薄判定谓词（UI 修复面用），解析入口自身已内聚失效阻断。

## 4. 入口矩阵（可达性与归属）

| 入口                                                 | 现状判定                                                                                               | 证据                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 设置 `Proxy`/`SystemTools`                           | Host gate，合规                                                                                        | `settings.ts` L139-140                                  |
| 设置关于页 "更新"                                    | 违规（见 §1）                                                                                          | `Version.tsx`                                           |
| Settings/devices 设备面                              | 合规，复用                                                                                             | `Settings/devices/index.tsx`                            |
| Agent 初始聊天框设备切换                             | `boundDeviceId` 已有；selector 逻辑待对齐 0/1/N                                                        | `HeteroDeviceSwitcher.tsx` L402/L569/L595/L613          |
| 本机文件浏览 `LocalFolder`/`Portal/LocalFile/Header` | Host 动作（reveal）；web 可达性待核实（`LocalFolder.tsx:43` 未自查 `isDesktop`，依赖挂载方 gate）      | §1 表                                                   |
| 终端 `ChatTerminal`                                  | Device 操作（对目标设备）；`local` 语义待 WD-04                                                        | `src/features/ChatTerminal/`                            |
| 连接器 / MCP                                         | stdio/localhost 位置违规（见 §1 mcp.ts）；服务端连接合规                                               | `src/services/mcp.ts`                                   |
| 设备连接 `DeviceConnectModal`                        | 合规                                                                                                   | `src/features/DeviceManager/`                           |
| Automation（schedule + MCP event triggers）          | 配置面合规（服务端 webhook/hatchet）；执行 target 显示待补                                             | `src/features/Automations/`、`router-hono/webhooks`     |
| Browser/Computer Use                                 | 按目标设备能力，待核实 gate 证据                                                                       | 待核实（WD-05 补）                                      |
| 命令面板 / 快捷键 → 原生动作                         | registry 未覆盖到命令层，待核实旁路                                                                    | `CmdkLazy.tsx`、`useHotkeys/globalScope.ts` —— WD-05 补 |
| 深链接直达原生设置页                                 | registry `unavailable` 判定已有；组件挂载前拦截证据待核实                                              | `settings.ts` L231-240 —— WD-05 补                      |
| Desktop 更新 / 托盘 / 原生权限                       | `UpdaterCtr`/`TrayMenuCtr`/`NotificationCtr` 在 main 进程，外壳正确归属                                | `apps/desktop/src/main/controllers/`                    |
| Web 构建原生依赖                                     | `entry.web.tsx` 不引 electron 模块；`src/services/electron/*` 被业务 feature import 的边界待构建图核验 | WD-06 门禁覆盖                                          |

## 5. 已知缺口（登记，非本轮修复）

- W2-E：Desktop local hetero 会话私有 IPC 生命周期 → WD-03 收敛。
- `readProjectFileBytes` 远程字节读取未实现 → WD-04 显式 unsupported 或补齐。
- CAS 首绑（两入口并发绑定）属服务端 admission 持久层 → WD-03；纯函数 resolver 无状态，不在此测试。
- 仓库 `isDesktop` 在 `src/` 约 494 处 / 194 文件 —— 绝大多数合法外壳用法（inventory 口径），WD-05/WD-06 建立清单 + 门禁防新增违规。
- PR #426（draft，自动化绑定）范围重叠 → 集成阶段对齐其契约，不重复 outbox / 回执。

## 6. WD-02 进展登记（PR #435，`refactor/wd-host-adapters`）

### HostPort 适配层落地

- `src/platform/host.ts` — `HostPort` 契约：子端口 `window / menu / updater / tray / dialog / notification / shell / openExternal`；`HostResult<T>`（值或 `HOST_UNSUPPORTED`，禁用 optional-function + 静默 no-op）；`hasHostCapability` / `registerHostPort` / `setHostPortForTesting`；未注册时回落到 fail-closed 的 unsupported host。
- `src/platform/web.ts` — 浏览器宿主：`file.pickAttachment`（瞬态 DOM `<input type=file>`）+ `link.openExternal`（`window.open` noopener）；其余返回 `HOST_UNSUPPORTED`。Web 无 preload 可启动。
- `src/platform/desktop.ts` — Electron 宿主，委托既有 `electronSystemService`/`autoUpdateService`/`desktopTrayService`/`desktopSettingsService`/`desktopNotificationService`/`electronOpenInAppService`/`gatewayConnectionService`；不经 barrel 导出，web 依赖图不可达。
- 入口：`entry.web/mobile` 注册 web host；`entry.desktop/popup` 注册 desktop host。

### 调用点迁移（仅此一批有现成实现，不搭空接口）

窗口（WinControl/TabBar/NavigationBar/PinOnTopButton）、原生菜单（`libs/contextMenu` 路由 + LoginStep/InputEditor/Messages）、更新（Version/advanced/UpdateNotification）、托盘快照、桌面通知（`desktopNotification.ts`/ 通知设置预览）、文件夹选择（WorkingDirectoryPicker/DeviceDetailPanel）、全部 `openExternalLink`（\~12 文件 —— web 上由抛错改为 `window.open`）。

`shell.openInApp` 收 `HostLocalResourceRef{deviceId,path}`：desktop 适配器先经 `gatewayConnectionService.getDeviceInfo()` 证明本机身份，不匹配即 `RESOURCE_OUT_OF_SCOPE` —— B 的路径不会再被拿去开 A 的 Finder（§6.1 场景）。

### Preload / IPC 安全校验（§8 要求）

| 项                      | 结论                                                                                                     | 证据                                                                                                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| contextIsolation        | ✅ 主窗 + webview 均强制                                                                                 | `Browser.ts:206,268`                                                                                                                                                                                                            |
| nodeIntegration         | ✅ webview 显式 `false`；主窗走默认关                                                                    | `Browser.ts:269`                                                                                                                                                                                                                |
| sandbox                 | ⚠️ 主窗 `false`（preload 桥接需要）；✅ webview 强制 `true`                                              | `Browser.ts:208,271`                                                                                                                                                                                                            |
| window\.open            | ✅ 一律 deny，外链走 `shell.openExternal`                                                                | `Browser.ts:319-334`                                                                                                                                                                                                            |
| will-attach-webview     | ✅ partition 白名单 + 协议白名单 + 剥 preload                                                            | `Browser.ts:247-272`                                                                                                                                                                                                            |
| IPC sender/frame/origin | ⚠️→✅ **本 PR 修**：原 `IpcHandler` 不校验 sender；`webviewTag` 场景下嵌入 guest 理论上可触达 shell 通道 | 修复：`isAppShellSender`（`hostWebContents === null`）收口于 `utils/ipc/base.ts` 的 chokepoint，并补齐 4 处裸 `ipcMain.*`（`retry-connection`、`desktop:get-bootstrap-identity`、`desktop:boot-profile-ready`、`stream:start`） |

### 遗留（登记给后续包）

- 主窗 `sandbox:false` + `nodeIntegration` 隐式默认 —— 收紧需要 preload 改造评估，WD-07 前复核。
- `src/platform` 未覆盖的宿主面（`shortcut.global`、`os.openPermissionSettings`、devtools、remoteServer、completionSound、binary-probe、browserWebview、rendererOta、desktopExportService、auv）仍是 native-shell 内部实现，WD-06 归口进导入门禁 allowlist。

## 7. WD-05 进展登记（`refactor/wd-05-ui-routes`）

### 设置作用域标注

- `SettingsCapability` 新增 `scope?: 'user'|'workspace'|'host'|'device'` 字段 —— 标注而非新注册表（同一 `SETTINGS_CAPABILITIES`，纯上下文不变）。
- host：Proxy、SystemTools；device：Devices；workspace：Usage、Plans、Credits、Billing、Creds；user：其余全部。
- `useCategory` 新增 `ThisDevice` 分组：Proxy + SystemTools 从 Agent 组移入「此应用・此设备」组；空组沿用既有 `filter` 自动消失，Web 渲染不受影响。
- `SettingsContent` 深链门禁此前已落在组件挂载前（`isSettingsTabAvailable` → `NotFound`，退役别名 → `redirectTo`）—— 验证合规，无改动。

### 命令面板收编到注册表

- `contextCommands` 每条 settings 命令标注 `settingsTab`，`buildContextCommands` 逐项过 `isSettingsTabAvailable(tab, capabilityContext)` —— 命令面板与路由共用同一门禁，不再各写一份 `isDesktop` / `enableBusinessFeatures`。
- 退役的 `common` 别名不再作为深链目标：profile 命令改指 `/settings/appearance`。

### 执行目标 selector

- `HeteroDeviceSwitcher` 新增绑定失效检测：绑定的 `deviceId` 不在合法候选行中 → chip 变 `buttonWarning` 样式 + 标签 `Rebind device`，popover 顶部显示 `bindingInvalidBanner`（命名失效设备）。修复路径 = 用户显式选设备重绑，无静默换绑。0/1/N 规则、离线行可见不可选、固定策略只读 chip 此前已合规，无改动。

### 宿主动作的资源身份

- `Conversation/WorkingSidebar/Files`：`isRemote` 语义从「有 deviceId」改为「deviceId ≠ 本机 gateway deviceId」（`useElectronStore.gatewayDeviceInfo`）。本机设备上运行的远端会话恢复 reveal-in-Finder /open-in-app；Web 上 gateway id 恒不解析，任何 deviceId 仍是远端 —— 双端语义同时正确。
- `Portal/LocalFile`：`canOpenExternal` 已是 `isDesktop ? !deviceId && !sandboxTopicId : true` —— desktop 仅本机资源可外开，web 恒走自身下载。合规，无改动。

### 宿主专属泄漏修复

- `Version.tsx`：运行时 `getElectronIpc()` 探测改为编译期 `isDesktop`；新增 `enableBusinessFeatures`（部署形态）门禁 —— `showManualUpgrade = !enableBusinessFeatures`。Hosted SaaS Web 不再渲染「检查更新」；自托管 + Desktop 保留 OTA 路径。

### 遗留（登记给后续包）

- Automation 无 device 绑定字段（schema 层不存在 `deviceId`）→「运行于 <device>」需 WD-03 落数据后由 WD-07 补 UI，不在 WD-05 范围。

## 8. WD-06 边界门禁登记（`refactor/wd-06-build-gates`）

### 门禁

- `scripts/ci/checkHostDeviceBoundaries.mjs`：真实导入图（静态 + dynamic import + re-export，regex 提取 + tsconfig 别名 / 工作区解析），五类规则：
  - `shared-to-native`：共享产品面（src/features|components|store|services|…，adapter 层除外）直连 electron/app-desktop/exec builtin 的**跨界边**；
  - `web-closure`：web/mobile/popup/auth 入口闭包可达的 native/exec 种子（`node:child_process` 等），按种子 allowlist；
  - `server-cli`：apps/server、apps/cli 直连 apps/desktop/electron 实现；
  - `types-purity`：packages/types、app-config 引入 builtin 或爬进 src//apps；
  - `isdesktop-census`：`isDesktop`/`__ELECTRON__` 在 adapter 根之外的逐文件计数封顶（只缩不增）。
- 实测：9445 文件扫描～1.6s（纯 Node，无依赖），CI job `Host Device Boundaries` 已接入 test.yml + Required Quality Gate required 列表。

### isDesktop 普查（冻结基线）

- 共享 `src/`：**465 处使用 / 182 文件**（非 adapter 根）。allowlist `hostDeviceBoundariesAllowlist.json` 逐文件记 `isDesktopMax` 封顶 + owner（wd-02..wd-05）+ 退出预期；adapter 根（`src/spa`、`src/platform`、`src/services/electron`、`*.desktop.*`）不计入违规。
- 另：跳过文件（`*.test.*`、`__tests__`、`e2e`）不参与普查。

### 现有跨界边（allowlist 登记的债务）

- `src/libs/mcp/client.ts → node:child_process`（stdio spawn；owner wd-04 —— 设备作用域传输改造后消失）
- `src/libs/debug-file-logger.ts → node:fs`（desktop-only 日志；owner wd-02 —— 移入 host adapter）
- `packages/app-config/src/routes/settings.ts → src/store/global/initialState`（契约包爬 store 取 `SettingsTabs`；owner wd-05 —— 枚举下沉契约层）
- web 闭包种子：`node:child_process` / `node:fs` / `node:os` / `node:process`（spawn、tempFileManager、otel node、agent-execution 等经共享服务导入可达；owner wd-03/wd-04 —— 执行图按设备隔离后消失）

### 附带修复

- `test.yml` `skip-duplicate-actions` 加 `cancel_others: 'false'`：此前 PR 运行会把同 SHA 的 push 属主运行判为 "重复" 并取消，Required Quality Gate 因此 fail-closed（#435/#437 连续两轮命中）。修复提交在 `refactor/wd-contract`（9e1fb797d）随栈传递。
