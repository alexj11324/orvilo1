# Web/Desktop 统一业务契约（冻结版）

> 基线：`canary @ 24d035c2fdeb77b4cc82b2f027d6698e9a96e52d`（本工作树 HEAD 一致）。
> 本文冻结 "控制端 vs 执行设备" 的职责边界与共享服务契约。后续 W2/W3 改动以此为准；
> 需要偏离时先改本文再改代码。

## 1. 唯一业务系统，两个外壳

- **控制端（viewer）**：Web 浏览器或 Electron renderer。负责展示、提交意图、缓存。
- **执行设备（target device）**：通过 device gateway 注册的机器，或 Desktop 自身的
  本地进程内执行（`local`，显式选择时保留）。
- **原则**：业务功能可用性 = `deviceCapabilities ∩ runtimeCapabilities ∩
workspacePolicy ∩ actorPermissions`，绝不由 "用户打开了哪种客户端" 决定。

## 2. 执行目标解析契约（`src/helpers/executionTarget.ts`）

`resolveExecutionTarget` / `resolveExecutionPlan` 是唯一目标决策点。冻结语义：

| 存储值                       | 解析结果                                                                                           | 说明                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `undefined`（未选择）        | `'none'`                                                                                           | **不再**按查看端默认 `local`/`none`。hetero 的 `none` = 待选设备，UI 阻塞并提示选设备 |
| `'local'`（显式选择）        | 查看端支持本地执行时保留 `'local'`；否则有 `boundDeviceId` → `'device'`，无绑定 → `'none'`（待选） | **取消** Web 上 unbound `local` → `sandbox` 的隐式云回退                              |
| `'device'` + `boundDeviceId` | `'device'`                                                                                         | 显式绑定，任何查看端一致                                                              |
| `'sandbox'`（显式历史配置）  | `'sandbox'`（provider 支持时）；不支持 → `'none'`                                                  | 保留历史，但不作为新任务自动回退                                                      |
| `'auto'`                     | `'auto'`                                                                                           | 仅用户 / 管理员明确保存的调度策略可继续择机                                           |

**已取消的隐式行为**：

- `clientAvailable ? 'local' : 'none'` 查看端默认（E07）。
- `isHetero && effective === 'none'` → `local`（桌面）/ `sandbox`（Web）升级（E07）。
- `resolveExecutionPlan` 中 `isHetero && sandboxAvailable` → `sandbox` 兜底：hetero
  无绑定必须停在 `{ kind: 'none' }` 待选态，禁止新任务隐式云回退。

**保留**：

- `stored === 'local' && boundDeviceId` 在无本地执行的查看端（且 `isHetero ||
deviceRoutingAvailable`）→ `'device'` 的诚实展示升级。
- `sandboxFallback`（Agent Share visitor 的显式 `orvilo-cloud-sandbox` 授权）——
  这是服务端裁决的显式授予，非查看端推导。
- `trigger === Bot` 的 `local` → `device`/`auto` 升级（bot 无 UI，属服务端裁决）。
- `workspaceScoped` 安全约束：未合并成员覆盖的 workspace 共享配置绝不在打开者本机执行。
- `executionTargetSelectionPolicy === 'fixed'` 时 `requestedDeviceId` 无效。

## 3. 共享客户端服务面：显式目标边界

`src/services/` 下的设备相关服务遵循统一传输决策：

```
target 已绑定 deviceId  →  lambdaClient.device.*  （设备 RPC，服务端权限检查）
target = 本机 local     →  Electron IPC（仅 Desktop，显式 local 传输）
无 target             →  TargetRequiredError（类型化缺设备结果）
```

- **禁止**"无 deviceId 就落入 Electron IPC" 的隐式回退。本机传输必须由调用方以
  显式 local 意图表达（当前签名上 `deviceId` 缺省 = local；非 Desktop 构建在该分支
  抛 `TargetRequiredError`，不再让 `electronAPI.invoke not found` 泄漏为业务错误）。
- 适用服务（已改）：`heterogeneousAgentCatalogService.listModels`、
  `fetchClaudeCodeQuotaSnapshot`、`gitService`（全部方法）、`projectFileService`、
  `deviceService`（本就需要 deviceId）。
- 待办（W2-D）：`localFileService`、`desktopSkillRuntime`、`terminal`、
  `heteroSession`、配额菜单中 Codex 直调 IPC 等剩余入口逐一审计。

### 类型化错误

```ts
class TargetRequiredError extends Error {
  code = 'TARGET_REQUIRED';
}
isTargetRequiredError(err);
assertLocalTargetTransport(); // 非 Desktop 构建抛 TargetRequiredError
```

定义于 `src/services/targetRequiredError.ts`。契约中预留的其余错误码
（`TargetOffline`/`PermissionDenied`/`RuntimeUnavailable`/`CapabilityUnsupported`/
`ReauthenticationRequired`）在服务端边界落地时补齐，客户端对相同错误使用相同展示。

## 4. 生命周期与事件（本轮边界）

- 已有统一链路：`lh hetero exec` → 服务端 `heteroIngest`/`heteroFinish`
  （`AgentStreamEvent` → `HeterogeneousPersistenceHandler` → `StreamEventManager`
  fanout），含 `operationId`/`runGeneration` 隔离、取消裁决、终态确认。
- **已知缺口（W2-E 未做）**：Desktop `local` hetero 会话仍走 renderer 私有
  `heterogeneousAgentExecutor` IPC 生命周期，不经服务端准入 / 持久化，Web 无法观察。
  收敛方向：Desktop 本机执行经 device gateway（`GatewayConnectionCtr` 已支持
  openclaw/hermes 派发）+ 本地 runtime host 复用同一 ingest 链路；local 仅作
  transport 差异，权限 / 生命周期 / 事件语义不变。
- 审批 / 取消：ACP cancel 是通知 ≠ 已停止；UI 先显 `cancelling`，终态由运行结果确认。

## 5. Onboarding 与认证契约

- **唯一业务流程**：`/onboarding`（`src/features/Onboarding`，onboarding-2 组件），
  完成态权威 = 服务端 `user.onboarding.finishedAt`。
- `/desktop-onboarding` = **有限期兼容入口**，不再持有业务状态机：
  - 未认证（Desktop 远程服务未配置）→ 渲染连接 / 登录面（复用 `LoginStep` 适配器）；
  - 已认证 + 服务端未完成 → 重定向 `/onboarding`；
  - 已认证 + 已完成 → 重定向 `/`（及合法 `callbackUrl`，`isSafeRedirectPath` 白名单）。
- Desktop 外壳标记（`desktopOnboardingCompleted` main-store、`completed`/
  `everCompleted` 本地键）仅作**启动 / 自动 OIDC 信号与迁移提示**，由统一流程完成时
  一并写入；不作为账号权威完成态。
- DataMode 的 telemetry → 统一 onboarding 的 `telemetryEnabled`（`updateGeneralConfig`）。
- macOS/OS 权限 → `Settings/devices` 设备设置面（shell 能力，不进业务完成态）。
- 401：统一 `sessionAuthEvents` 事件；Web 适配器 = 既有 logout→`/signin` /
  `loginRequired`；Desktop 适配器 = `AuthRequiredModal`（主进程代理
  `X-Auth-Required` 广播之外，renderer 侧 401 也触发同一恢复面）。单飞去重保留。

## 6. 能力驱动展示

- `toolFilters`/`toolAvailability`/`skillFilters`：工具 / 技能可用性上下文为
  `canExecuteOnDevice`（运行侧 = 当前执行计划 device-capable；展示侧 = 配置了什么
  就显示什么，不按查看端隐藏业务模块）。
- `isDesktop` 仅允许用于外壳能力（窗口 / 托盘 / 原生对话框 / IPC 传输选择 / 布局几何）。
- 旧 `/desktop-onboarding` 深链与 `?screen=*`：合法跳转到统一流程 / 连接面；无循环。

## 7. 云电脑 / 自有 Harness 预留边界

- 节点描述、连接状态、runtime 描述、ACP 能力在现有类型 /registry 中正交；
  本轮生产 registry 不注册 test/cloud stub。
- `local` 仍指 "本机进程内执行"（显式选择时）；未来云电脑 = 另一种
  `{kind:'device'}` 节点，自有 Harness = 另一种 ACP runtime，前端无需新分支。
