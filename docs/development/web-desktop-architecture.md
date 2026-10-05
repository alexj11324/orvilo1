# ADR: Web/Desktop 能力边界 —— 共享产品层 + 宿主适配层 + 显式设备执行层

> 状态：Accepted（WD-00/WD-01 落地开始）。基线 `canary @ 2fb63e7`。
> 规范源：本 ADR 与 `device-execution-contract.md`、`client-parity-contract.md` 协同；
> 实施任务书见 `web-desktop-boundary-plan.md`（WD-00..WD-07）。

## 决定

一个业务系统、两个查看壳、N 台执行设备。三个能力面正交：

- **Product**：业务做什么（Agent、会话、Issue、Automation、设备清单）—— 双端共享。
- **Host**：当前访问外壳能做什么（窗口、托盘、原生选择器、OTA 更新、外链、原生快捷键）——`isDesktop`/HostPort 只许在这一层。
- **Device**：目标机器能执行什么（Prime/Codex/Claude Code、文件、Git、终端、MCP）—— 永远显式 `deviceId`，经服务端 admission + device gateway。

推论：

1. Desktop ≠ 本机执行；Web ≠ 无终端 / 文件。功能可用性 =
   `deviceCapabilities ∩ runtimeCapabilities ∩ workspacePolicy ∩ actorPermissions`，
   不由查看端决定。
2. 设备操作不允许 `deviceId?: string` 的 "缺省 = 本机" 语义。无目标 → 类型化
   blocked 结果（`DEVICE_REQUIRED` 等），不是静默本机调用。
3. 绑定失效（删除 / 撤权 / 不兼容）≠ 从未绑定。`DEVICE_BINDING_INVALID` 阻断，
   修复是显式受权动作，绝不自动换绑到其他设备。
4. 离线设备仍是合法候选（不可启动 ≠ 被移除）；清单查询失败 / 未加载完不判 0/1。
5. policy-pinned 时成员偏好不能覆盖 workspace/admin 默认；显式请求未授权设备
   直接拒绝，不降级到默认。
6. Host 动作（"在 Finder 显示"" 打开本机 Terminal"）与 Device 动作（" 在设备 B
   打开终端 "）分开；远程资源不得流入本机原生 API。

## 执行准入不变式（FIX-A）

`dispatchHeteroAgent` 的持久化语义，任何修改必须保持：

1. **绑定是一行内的三字段一致写**。`bindTopicDeviceAtomically` 单次 UPDATE
   同时写 `metadata.boundDeviceId`（历史顶层字段，现有读取方依赖）与
   `metadata.executionConfig.{boundDeviceId,executionTarget:'device'}`（规范
   形式）。CAS 仅在两个 pin 都为空时成立；CAS 输的一方回读胜者并返回
   `{outcome:'occupied', boundDeviceId:<winner>}`，调用方据此判
   `DEVICE_BINDING_CONFLICT`，绝不覆盖既有绑定。
2. **绑定存在即带意图**。`executionTarget` 未设置但绑定了设备（或命中
   workspace /fixed 策略）的会话不再短路成 `EXECUTION_TARGET_NONE`，
   必须进入正常解析链路。
3. **`auto` 不清除会话 pin**。`sessionBoundDeviceId` 在任何 target 模式下
   都参与解析。
4. **Admission 持久化 = 准入闸**。admission 记录与
   `metadata.executionPlan`（`DispatchExecutionIdentity`）在同一事务内落账；
   写失败 → 结构化 `DISPATCH_ADMISSION_PERSIST_FAILED` blocked 结果，运行
   **不启动**—— 绝不派生任何表面都无法寻址的执行。
5. **拒绝是结构化的**。所有准入拒绝通过 `DeviceAdmissionErrorData`
   （`errorData.code` + `deviceId`/`repairCandidates`/`retryable`/`scope`/
   `workspaceId`/`operationId`/`bindingRevision`）下发，不嵌在 detail 文案里。

## 客户端调度统一入口不变式（FIX-C）

`agentDispatcher.ts` 的 `selectRuntimeType` 是客户端唯一的路由决策点，
任何修改必须保持：

1. **全表面收敛**。`send`/`resume`/`regenerate`/`continue`/subtask dispatch/
   `cancel`/`reconnect` 全部经由同一个 `selectRuntimeType` 结果分发；
   它永远**不**返回 `'hetero'`——`'hetero'` 仅作为传输 / 事件标记
   （设备侧 ingest 归因）存在，不是路由结果。
2. **网络状态不参与授权**。`RuntimeSelectionContext` 不含
   `deviceGatewayConnected`；socket 断连 / 设备不可达 → `errorData` 通道
   的类型化 blocked 结果（如 `DEVICE_REQUIRED`，`DEVICE_NOT_CONNECTED`/
   `DEVICE_OFFLINE` 见契约变更请求），绝不改走本地 IPC。
3. **拒绝 ≠ 换传输**。服务端 admission 拒绝永远是 blocked 结果，
   不会 "被拒 → 回落本地 IPC"。
4. **IPC 只是带身份证明的传输**。`executeHeterogeneousAgent` 与
   `transports/hetero/*` 保留为已文档化的 seam（仅当未来出现显式开关的
   offline 模式时才允许启用）；它们携带经服务端核验的执行身份 + 设备
   授权 + 同一 generation + 共享持久化生命周期 —— 不是第二个业务调度器。
   当前没有任何产品入口可达这些符号。
5. **旧数据不复活旧路径**。持久化的 `parentRuntime:'hetero'` 一律
   coerce 为 `'gateway'`；`heterogeneousProvider` 绑定一律解析为
   `'gateway'`—— 存量 hetero 会话在 web 接管或桌面重连时走同一个
   operationId/deviceId/generation，不派生第二执行。

## 显式设备作用域与候选集语义（FIX-D）

MCP 设备操作与执行候选集的语义，任何修改必须保持：

1. **无执行上下文 ≠ 本机**。`mcpService` 的公开调用显式携带
   `McpDeviceScope`（`{kind:'device',deviceId}` / `{kind:'local'}` /
   `{kind:'topic',topicId}`）或 `DeviceActionSubject`；`subject` / `scope` /
   `deviceId` / `topicId` 之外没有第四语义。不带目标 → 类型化
   `TARGET_REQUIRED`，绝不落到 "存在本机 deviceId" 的默认上。
2. **topic 缓存只是展示缓存**。携带 `topicId` 且缓存未命中 → 读权威绑定
   （`topic.getTopicDetail`）；读不出 → `TARGET_QUERY_FAILED`（可重试），
   绝不等价于 "未绑定 → 本机"。本机 deviceId 仅是 "目标与本机相同" 的证据，
   不是授权、不是默认选项。
3. **同一作用域贯穿全链路**。install、manifest、tool discovery、connection
   check、auth check、tool call 使用同一 scope；操作态缓存键为
   principal、workspace、scope、plugin、connection、config 版本
   （`mcpOperationCacheKey`），同 identifier 的两台设备操作互不串写。
4. **网络空间属于目标设备**。stdio / `localhost` / LAN 地址在目标设备的
   网络命名空间内解析；托管公网连接保持服务端路由。远程 MCP 隧道不存在
   → 结构化 `OPERATION_UNSUPPORTED`（staging 可回读），绝不回落到另一台
   机器、绝不伪报成功。
5. **候选 = 已授权 + 合法 scope + 已验证 capability/version**。
   `listAuthorizedDeviceCandidates` 扩展既有设备查询（不建第二注册表），
   输入含 actor + workspace + requiredOperation + policy（grant 上下文）。
   `online` 只影响 `runnable`；未知 capability/version →
   `pending verification`（有界 probe：仅在线设备、上限 8），绝不记 true、
   绝不 selectable/runnable。`agent-run` 的注册表行本身是能力证据
   （`verification.delegated` —— 适配器兼容在设备侧启动时核验）；显式
   `minAdapterVersion` 无存储信号可证 → version pending。
6. **view-only 授权永不进入执行候选**（注册表行、transient、referenced
   三条路径一致过滤）；`policy.permissionsReady === false` →
   `permissions-unready`，与 `query-failed` / `empty` / `complete`
   明确区分。settings、chat、connect、admission 走同一权限规则，候选
   id 集合一致；UI 分组只改显示，不改成员。
7. **owner / 路由身份 / 资源授权随候选下发**（`candidate.owner` +
   `scopeSource` + `permission`），绝不从 `resolution.reason` 反推归属。
   share、revoke、版本变更后由 admission + pre-launch 复验，前端缓存
   永不是授权源。

## 绑定修复与能力证据（FIX-F）

- **修绑 = 执行身份决策，非内容协作**。「topic 有编辑权的人」与「能决定执行
  位置的人」是两个集合：chat 是本人可见 + 链接共享制，共享读者拿到的是读权。
  `topic.repairDeviceBinding` 因此要求 `topic:update` + **新设备必须在调用者
  自己的授权注册表内**（`findByDeviceId` / `findWorkspaceDeviceById` 命中，
  否则 FORBIDDEN）—— 任何人无法把话题绑到自己没有执行权限的设备上。
- **`bindingRevision` 绑定纪元**。`metadata.bindingRevision` 由服务端在每次
  绑定变更时 `+1` 戳记（`providerBinding.revision` 同形）；首绑从 1 起、修复
  递增，CAS 输方回读赢家 epoch 返回。准入 `errorData` 携带当前 epoch，修复
  客户端回传 `expectedBindingRevision` —— 同 pin 但 epoch 动了（中间落过别的
  写）同样判 `occupied`。旧行无 epoch 读作 0，旧客户端省略 expected → 跳过
  epoch 校验（向下降级，但绑定 CAS 永不缺席）。
- **能力证据有时效**。`devices` 表新增 `capabilitySnapshot` /
  `adapterVersion` / `lastVerifiedAt`（迁移 0203，幂等）：注册即写
  `lastVerifiedAt`，活探测的 `supportedTools` 刷新快照。准入判读只认 7 天
  TTL 内的证据 —— 过期或缺失 → `pending`，绝不凭陈旧行捏造 `verified`。
  `minAdapterVersion` 以 `satisfiesMinAdapterVersion`（x.y.z 数字元组）比较，
  不可解析输入永不满足。
- **MCP 查询同域执行**。manifest（stdio/streamable）与 installability 走
  device-control RPC：`DeviceControlDeps` 注入宿主实现（desktop 复用
  `McpCtr` 三个既有 IPC 实现），无 MCP runtime 的宿主（CLI daemon）返回
  诚实 `does not support` → 服务端映射 `PRECONDITION_FAILED` +
  `cause.data.code:'OPERATION_UNSUPPORTED'`。远端 stdio /localhost MCP 工具
  调用经 `device.callMcpTool` 隧道（`type:'mcp'` relay），决不在另一台机器
  上代执行、决不伪报成功；无网关 → `GATEWAY_NOT_CONFIGURED`。
- **修绑留痕**。workspace scope 的成功修复写 `topic.binding_repaired` 审计
  （metadata 携带 `bindingRevision` + 新旧 pin）。

## 不做什么

- 不新建 Prime gateway / 调度器 / 第二套权限引擎；复用 TaskDispatch/TaskRunner、
  device-gateway、device-control、CLI agentRun 生命周期。
- 不恢复 Agent 创建向导 / Harness 配置项；`type → adapter` 固定映射。
- 不把 Desktop 外壳与本机 Device Host 混为一谈；也不要求本轮做独立常驻服务。
- 不批量重命名历史 `local`/`runtime` 字段；按可达调用链迁移。

## 结构

```
web entry ─┐
           ├─ 共享 UI / routes / stores ── 中立契约 + HostPort 接口
desktop ───┘        │
entry ─┐            ├─ HostPort（宿主动作：窗口/更新/原生对话框/外链）
           ├─ 业务与设备操作（principal + scope + subject）
           │        │
           │   服务端 admission：权限 → 设备解析 → 固定执行身份
           │        │
           │   device gateway / device-control
           │     ┌──┴──┐
           │   Device A   Device B   （Prime/Codex/Claude Code adapters）
```

## 迁移顺序（per plan §10）

1. WD-01 契约与安全解析（本 PR）。
2. 最小纵向切片：Web/Desktop → 显式 B → 读 B 目录 → 跑一条任务 → 取消 / 重连。
3. 入口逐一迁移；旧 run 保留原执行身份 drain；失败不回落旧本机链路。
4. settings/commands/routes 切换 + 构建门禁。
5. legacy `local` 语义退役，留有限历史解码兼容。

## 回滚

回滚只退回兼容控制界面；绑定 B 的任务绝不改到 A 或后端。旧客户端缺新协议
能力时 fail closed 并提示升级。

## 候选集与修复语义（FIX-B）

- **唯一候选集**。`executionTargetDeviceCandidates(devices, scope)`
  （`src/helpers/executionTarget.ts`）是所有页面判断设备绑定合法性的唯一
  池：personal → 个人设备；workspace → `privateWorkspace + workspace`
  （本人私有注册对注册者合法，绝不能被任何页面剔除）。UI 分组可以分桶，
  候选成员资格不允许分叉。离线 ≠ 移除 —— 离线设备仍是候选，只拦截启动。
- **选择器公式共享**。聊天输入条与设置页读取同一个 `useDeviceSelectorState`
  → `shouldShowDeviceSelector`：`permissionsLoaded && deviceInventoryComplete
&& canSelectDevice && selectableDevices.length > 1`。0 候选 → 连接 / 阻断
  提示（绝不出选择器，绝不静默回落）；1 候选 → 无下拉，但仍展示只读
  "runs on: <device>" 摘要；>1 → 仅 `canSelectDevice` 时可选。
- **挂载不写入**。组合器挂载 / 重渲染 / StrictMode / 刷新产生零次
  `selectExecutionTarget` 写入 —— 绑定只能由显式用户选择或服务端原子
  first-bind 创建。设备清单查询失败 / 未完成 = `pending`，绝非 0 候选。
- **结构化准入错误 → 唯一动作**。`error.body` 原样携带 `code`，UI 只分支
  `code`、绝不解析 detail 文案：INVENTORY_INCOMPLETE → 重试清单查询；
  REQUIRED / NOT_FOUND (无候选) → 连接设备；ACCESS_DENIED /
  REQUEST_UNAUTHORIZED → 设备授权页；BINDING_INVALID / BINDING_CONFLICT /
  SELECTION_REQUIRED / EXECUTION_TARGET_NONE / NOT_FOUND (有候选) → 修复
  （选择器限定 `repairCandidates`，单候选 = 单个 "修复绑定到 X" 按钮）；
  DISPATCH_ADMISSION_PERSIST_FAILED → 查看运行状态。
- **修复写 = 服务端 CAS**。`topic.repairDeviceBinding`（FIX-F）在服务端以真
  compare-and-swap 落笔（`repairTopicDeviceBinding`）：effective 绑定与
  `bindingRevision` epoch 双 CAS，写入与服务端 first-bind 同形的绑定三元组
  并清空 `heteroSession*`—— 修复后的下一次运行必须在新设备上建全新执行
  会话，绝不复用另一台设备的原生会话 id。CAS 输的一方回读赢家并返回
  `{outcome:'occupied'}`，客户端据此提示 `binding-changed` 而非覆盖。
