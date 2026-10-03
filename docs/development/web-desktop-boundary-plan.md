# Orvilo1 Web / Desktop 能力边界重构：Agent 实施说明

编写日期：2026-10-02（America/New_York）\
代码审阅基线：`alexj11324/orvilo1`，默认分支 `canary`\
固定审阅提交：`2fb63e750d853294d131c35d205146984e98377f`（已合并 PR #427）\
性质：基于关键源码与 PR 的静态审阅、目标架构与实施规范；不是已完成的实现、构建报告或实机验收报告。

## 0. 执行摘要与不可改变的约束

目标不是把 Web 与 Desktop 做成两个产品，也不是给全部本地功能加 `isDesktop`。目标是：共享业务控制端；原生外壳能力在 Host 边界；所有执行、设备文件和工具操作显式绑定 Device；UI、服务、权限、路由和构建共同守住边界。

必须保留以下产品约束：

1. Orvilo AI 固定使用内置 Prime harness。Prime 与 Codex / Claude Code 属于同一层的 Agent 执行实现；不存在名为 “Orvilo Server” 的第三种执行位置。现有应用后端是控制与业务服务，不是隐式执行设备。
2. 每次 Agent 执行最终绑定真实 `deviceId`；本机、另一台 Mac、用户自己的服务器都是 Device。用户的服务端部署只有显式注册、授权为设备后，才能作为执行目标。
3. 控制端是 Web 或 Desktop，不得改变执行目标。Desktop 也可以只控制远程 B，不启用本机执行。
4. Agent 是通用实例。不得恢复 purpose /persona/ “What should this do?” / Builder 生成向导；新会话不得偷偷新建 Agent。沿用现有新会话入口和上次使用的 Agent 规则。
5. Device 选择器仅在权限与完整清单加载成功、允许修改、合法候选设备数大于 1 时出现。0/1 不显示选择器，但执行身份始终显式绑定。
6. 离线设备不等于不可选择设备。绑定失效不是从未绑定；禁止自动换机、后台兜底、取数组第一项。
7. 保留现有 ACP 边界、TaskDispatch / TaskRunner、RunSubject、取消与回执体系。不新造 Prime 网关、调度器、Agent loop、通用 RPC 后门或第二套权限引擎。
8. 不借本次重构恢复已退役产品入口；不重构现行模型 / 认证 broker，不批量删除 Provider /runtime/skill 等名称匹配的文件。现行有效能力与历史退役对象必须按可达调用链区分。
9. 本轮不新增云电脑、机器池、计费或离线控制平面。若审计发现已有明确承诺的离线能力，记录其兼容约束，不得静默删掉。
10. 优先修改现有包。目录组织的清晰不是新增十个 package 或微服务的理由。

本说明与现行 `docs/development/device-execution-contract.md` 协同：保留其设备解析与产品语义，补齐 Host、设备资源操作、路由、构建与测试边界。发现冲突先记录 ADR，不自行恢复过时行为。

## 1. 基线事实与先修问题

以下事实来自上述固定提交；实施前必须重新读取最新 `canary` 与相关未合并 PR。下面的 “需要处理” 不等于已证明所有路径均在浏览器触发。

| 现有位置                                                                             | 已核实情况                                                                                                             | 本轮处理                                                                                |                                         |                                                             |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| PR #427；`docs/development/device-execution-contract.md`                             | 已合并共享设备契约，PR 明确说明执行链路没有变化                                                                        | 复用契约，并完成行为层接入；不能把契约文件存在当成已完成                                |                                         |                                                             |
| `packages/types/src/agent/deviceExecution.ts`                                        | `resolveExecutionDevice()` 在找不到 session-bound 设备后继续检查其他默认值；`isDeviceBindingInvalid()` 是分开的 helper | 在权威统一入口及共享 resolver 内保证硬绑定失效优先阻断，补回归测试                      |                                         |                                                             |
| `src/services/targetRequiredError.ts`                                                | `requireLocalExecutionTransport()` 允许 \`deviceId                                                                     |                                                                                         | isDesktop\`，Desktop 无 ID 可继续落本机 | 新公共设备接口要求显式 ID；旧兼容适配层只在可证明身份时补齐 |
| `src/services/projectFile.ts`                                                        | 已有 device RPC / 本机 IPC 分流；`readProjectFileBytes` 对 device-backed 调用直接返回 `undefined`                      | 复用 service，去掉隐式目标；明确 unsupported，或者完整补齐真实字节读取链路              |                                         |                                                             |
| `src/services/mcp.ts`                                                                | stdio 工具与本地 URL 的执行位置受 `isDesktop` 影响；存在直接 Electron IPC 调用                                         | 按连接的服务端 / 设备作用域与授权目标路由，不按查看页面的平台猜测                       |                                         |                                                             |
| `src/features/LocalFile/LocalFolder.tsx`、`src/features/Portal/LocalFile/Header.tsx` | 直接依赖 `localFileService`                                                                                            | 审计可达性；拆分纯 Host 动作与设备资源动作，后者通过统一 service                        |                                         |                                                             |
| `src/store/chat/slices/agentRun/actions/dispatch/agentDispatcher.ts`                 | 保留 `client / gateway / hetero` 与平台参与的路由模型                                                                  | 迁移产品层到执行意图与权威设备上下文；不能只改 enum 名称                                |                                         |                                                             |
| `packages/app-config/src/routes/settings.ts`                                         | 已有 settings capability registry，并对 Proxy/SystemTools 等设置做宿主 gate，包含退役与深链接规则                      | 扩展而非复制；保留正确的 gates，补动态设备能力和设置作用域                              |                                         |                                                             |
| `packages/device-control/src/dispatch.ts`                                            | 已有 Desktop 与 CLI 共用的设备 RPC dispatcher                                                                          | 复用处理器与协议；无需另建 Device SDK / 网关                                            |                                         |                                                             |
| `apps/server/src/services/deviceGateway/authorizedToolCall.ts`                       | 已有派发前设备授权复查                                                                                                 | 汇聚入口并保留复查，不绕开它做本机快捷路径                                              |                                         |                                                             |
| PR #426                                                                              | 审阅时为 draft；涉及自动化、显式 Device 绑定与结果恢复；PR 自述完整浏览器到设备验收尚未通过                            | 对齐接口与迁移所有权，不复制其 outbox、事件调度或回执；不因本轮 UI 完成就打开事件自动化 |                                         |                                                             |

不要把 `client` 类型名残留、历史文档或测试夹具本身当成 “浏览器仍在运行旧 Agent loop” 的证据；必须追实际执行入口。

## 2. 目标架构

```text
Web composition root                     Desktop composition root
Host = browser                           Host = Electron
        \                                  /
         +---- 共享 UI / routes / stores --+
                       |
        +--------------+-------------------+
        |                                  |
  HostPort（宿主动作）                业务/设备/执行意图
  附件选择、外链                    principal + scope + subject
  Desktop 更新、原生菜单                     |
  不启动 Agent                     现有应用后端 / admission
                                      权限、设备解析、业务状态
                                               |
                                 已授权 Device Gateway / RPC
                                      /                 \
                              Device A                  Device B
                              本机 Mac                  远程服务器
                                  \                     /
                         同一 device-control / agent-execution 语义
                           Prime / Codex / Claude Code adapters
                           fs / git / terminal / browser tools
```

“控制平面” 只是对现有后端职责的描述，不代表新建一种 “Orvilo Server” 产品或默认 Prime 宿主。

### 2.1 三个逻辑面与两个正交维度

- 产品面：Agent、对话、Issue、Project、Automation、权限、设备清单，两端共享。
- Host 面：当前访问外壳的能力；窗口、更新、原生选择器、外链、原生快捷键。
- Device 面：目标机器的执行、文件、Git、终端、工具、工作目录。

`host.kind` 与 `target.deviceId` 是正交维度。`Desktop + remote B` 必须是一等场景。不能用 `isDesktop` 推导 “本机可以执行”，也不能用 “B 有 Shell” 推导 “浏览器能打开自己的原生终端”。

### 2.2 原生客户端进程与设备进程

Desktop 外壳和本机 Device Host 在逻辑与授权上分开。可以同包分发；不要求立刻安装独立常驻系统服务。

现有 `apps/desktop/src/main` 保留窗口、托盘、更新、权限提示和 IPC façade；共享设备处理放入现有 `packages/device-control`，执行生命周期复用现有 `packages/agent-execution` 与 CLI 实现。不得由 CLI /server 运行时 import Electron controller 来复用代码。

窗口关闭不等于任务取消。明确 “关窗口”“退出 Desktop”“停止本机执行” 的区别：没有独立后台服务时，不承诺退出进程后本机任务仍运行；需要中断时先尝试停止、记录结果，再退出。远程 B 的任务不因 A 的查看窗口关闭而取消。机器睡眠、断网和进程崩溃按租约与重连处理，不伪装成成功取消。

## 3. 工程落点与依赖方向

下列标注 “新增” 的路径是建议落点；若实施时已有等价模块，合并到现有模块，不能保留两个实现。

| 位置                                                                  | 处理                                                                       |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/types/src/agent/deviceExecution.ts`（现有）                 | 修正设备选择安全语义；公共纯类型，不依赖 React、Electron、数据库           |
| `packages/types/src/device/operation.ts`（建议新增）                  | 设备资源引用、操作上下文、错误 / 可用性类型；若已有对应 types 则扩展原文件 |
| `src/platform/host.ts`、`web.ts`、`desktop.ts`（建议新增）            | `HostPort` 与双宿主实现；只描述宿主动作                                    |
| `src/spa/entry.web.tsx`、`entry.desktop.tsx`（现有）                  | 独立注入 HostPort 与 transport，禁止业务组件自行判断宿主                   |
| `src/services/projectFile.ts`、`mcp.ts`、现有 Git/catalog services    | 收敛到显式设备上下文；不复制业务服务                                       |
| `packages/app-config/src/routes/settings.ts`（现有）                  | 扩展 capability、scope 与 route policy；不造第二个 settings registry       |
| `src/features/Settings/hooks/useSettingsCapability.ts`（现有）        | 读取已解析的宿主 / 业务上下文，向页面输出一致 gate                         |
| `apps/server/src/services/aiAgent/pipeline/heteroDispatch.ts`（现有） | 消费统一 admission 的最终执行计划，不二次挑设备                            |
| `apps/server/src/services/deviceGateway/*`（现有）                    | 候选集、授权复查、设备 RPC 与协议检查                                      |
| `packages/device-control/src/dispatch.ts`（现有）                     | 共用设备处理与真实 capability，执行前复查作用域                            |
| `apps/cli/src/device/agentRun.ts`、`agentRunRegistry.ts`（现有）      | 沿用生命周期、去重、停止与回执，不新建 Prime 专属实现                      |
| `scripts/ci/checkHostDeviceBoundaries.mjs`（建议新增）                | 构建图、导入边界、路由与反回归检查                                         |

依赖规则：

```text
shared UI -> browser-safe types + app services + HostPort interface
web entry -> web HostPort implementation
desktop entry -> desktop HostPort implementation -> narrow preload API
server -> shared contracts + authoritative services + gateway client
device-control / agent-execution -> Node / platform ports（不 import Electron app）
desktop main -> device packages + Electron shell adapters
CLI device daemon -> device packages + headless adapters
```

不要把整个 `packages/device-control` runtime 打包进 Web；只共享纯 contracts。原有从 Electron IPC 包导入的业务 DTO 迁移到中立 types，旧类型短期 re-export 兼容，避免复制三套形状。

本轮默认：Agent 和设备资源的业务请求统一走既有权威 admission / Device Gateway。Host 原生动作继续 IPC。先不要新增本机 fast path；若必须保留已存在的优化，必须显式验证相同 deviceId、同一授权票据、同一 handler 与回执，不得因没有 ID 自动启用。在线授权不可用时不得悄悄变为无授权本机执行。

## 4. 公共契约

### 4.1 HostPort：只负责当前访问外壳

下面是契约方向，不是声称已有的 API。按现有命名和 IPC 实现落地；不要用 optional function + 静默 no-op 伪装完成。

```ts
type HostKind = 'web' | 'desktop';
type HostCapability =
  | 'file.pickAttachment'
  | 'link.openExternal'
  | 'window.manage'
  | 'app.update'
  | 'os.openPermissionSettings';

interface HostContext {
  kind: HostKind;
  // 仅完成设备身份握手的 Desktop 可报告；只是“本机”标记，不是默认目标。
  localDeviceId?: string;
  capabilities: ReadonlySet<HostCapability>;
}
```

执行方法用判别联合或结构化 `HOST_UNSUPPORTED` 结果表达不支持。禁止暴露 `exec(command)`、`readAnyFile(path)`、`invoke(channel, any)` 给任意 renderer 调用。

原生文件对话框可以帮助本机设备登记工作目录，但 “选中路径” 不直接授予 Agent 全盘读写。登记时再次验证本机 deviceId、目录权限、工作区与 root scope。

浏览器可以通过用户授权的文件 / 目录选择能力处理附件。这不等于获得浏览器所在电脑的任意文件访问、Shell 或 Agent 执行权。保留上传、下载、复制、浏览器支持的通知；不要因为 “涉及本地” 就全部删掉。

### 4.2 设备上下文：先解析，再使用

公共设备方法不得再用 `deviceId?: string` 表达 “缺省就是本机”。调用方只提交执行意图，服务端解析执行身份；前端不能自签授权上下文。

```ts
// 新增/归并的契约示意。现有 RunSubject 原样复用。
interface DeviceResourceRef {
  deviceId: string;
  rootRef: string; // 已授权工作目录/仓库绑定引用，不是任意客户端路径
  relativePath: string;
}

type DeviceActionSubject =
  | { kind: 'resource'; resource: DeviceResourceRef }
  | { kind: 'run'; operationId: string; executionGeneration: number };
```

`rootRef` 优先引用现有目录 / 仓库授权记录；没有等价记录时可用服务端签发的作用域引用，不默认另建文件系统产品或新数据库树。Workspace（业务工作区）与工作目录（文件系统 root）是不同概念。

用户手工浏览文件 / Git 不要求伪造 Agent 或 Task；使用当前授权 principal 的 resource context。Agent 工具操作使用 run context，且必须匹配该 run 的设备、工作目录与 generation。

继续复用 `heterogeneousProvider: {type:'orvilo'}`、`executionTarget:'device'`、`boundDeviceId`；不新增可配置 `harness:'prime'`。实际 `harnessId` 是固定映射推导出来的执行记录字段，而不是设置项。

### 4.3 可用性必须可解释

用明确状态区分：`ready`、`loading`、`unsupported`、`blocked`、`unavailable`。具体命名与已有错误体系归并。

至少能区分：宿主不支持、设备未绑定、设备需选择、绑定已失效、设备离线、授权不足、协议不兼容、凭证未就绪、系统权限缺失、目标查询失败、操作能力不支持。

`undefined` 不能同时表示 “文件不存在”“网络失败”“远程尚未实现”。不支持的设备字节读取返回明确的 `OPERATION_UNSUPPORTED`，直到端到端实现完成；UI 不再给用户一个看似可用但无结果的按钮。

### 4.4 能力不是权限

Device 报告的 capability 只描述实现能力；服务端从会话和成员权限推导授权。有效可操作性是：产品仍存在、当前 Host/Device 支持、principal 被授权、资源在 scope 内、协议兼容、运行时就绪等条件的交集。并非每个动作都要求同时具备 Host 和 Device 能力，例如 Desktop 更新不依赖 Device。

可见设备不代表可执行设备，可执行不代表可安装 / 重启。按现有权限模型映射 view /execute/manage；不新增平行 RBAC。设备清单查询必须明确 complete /pending/failed，不能把失败当空数组。分页未完成不能按当前页数量判断 “只有一个设备”。

## 5. 设备解析与执行一致性

### 5.1 先落实绑定失效与策略检查

统一服务端 admission 必须在共享 resolver 之前构造已授权、scope 与版本有效的候选集，并在 resolver 内保证硬绑定失效不会落入 fallback。

顺序：

1. 从服务端会话确定 principal、workspace、Agent 配置；不信任客户端传来的 userId /permission flags。
2. 校验策略固定、成员覆盖权限、请求设备合法性。显式请求未授权设备应拒绝，不能悄悄忽略然后换成默认设备。
3. 已有 session/run 硬绑定若被撤销、删除或不兼容，返回 `DEVICE_BINDING_INVALID`。离线不属于这个分支。
4. 按既有优先链解析：session binding → 显式请求 → 用户对该 Agent 的偏好 → Agent/Workspace 默认 → 唯一合法候选 → 明确阻断。
5. 在派发前复查目标就绪与授权版本，写入最终 deviceId 和执行 generation，幂等提交。

策略 pinned 时，应先规范化 / 限制输入与候选集；不能只把 `explicitRequestAllowed` 设置为 false，却让未授权的用户偏好继续覆盖固定策略。管理员改变策略不得把正在运行的任务无声迁往另一台机器；按当前权限策略停止 / 阻断后续动作，或保留其授权有效期内的运行，必须有明确规则。

必须新增这些单测：

```text
session=A，A 不在合法候选中，只有 B -> DEVICE_BINDING_INVALID
session=A，A 不在合法候选中，请求显式 B -> 不能把“修复”混为正常 resume
session=A，A 离线，B 在线 -> 仍绑定 A；启动显示离线
显式请求未授权 C，默认 B 可用 -> 拒绝，不改跑 B
策略固定 B，用户偏好 A -> A 不能覆盖策略
清单失败或未加载完 -> 不得自动绑定、不判 0/1
没有历史选择，唯一合法 B -> 条件写入 B
两个并发入口首绑 -> CAS/事务避免互相覆盖
```

显式 “修复绑定到 B” 是单独受权动作：没有活动执行时更新绑定；已有会话需要新 execution session 与工作目录 / 上下文准备，不在旧 native session ID 上换设备。

### 5.2 selectable / runnable / selector

`selectableDevices` 按执行授权、scope、能力、版本产生；离线设备保留其最后已知合法能力，但标出离线和最后验证时间。`runnableDevices` 还要求在线、适配器就绪、必要凭证 / OS 权限以及启动容量等条件。未知就绪状态不冒充 ready。

```text
showDeviceSelector = permissionsLoaded
                  && deviceInventoryComplete
                  && canSelectDevice
                  && selectableDevices.length > 1
```

0 个：无 selector，显示阻断与连接设备入口。1 个：无 selector，条件解析并记录唯一设备。多个：有选择权时显示；固定策略或活动会话不能切换时仅显示不可编辑身份。绑定失效且只剩 B 时，无 selector，但可以显示 “修复绑定至 B” 的明确操作。

自动绑定只发生在服务端写入 /admission，不能靠页面 `useEffect` 修改 Agent config。偏好修改对新 execution session 生效，不能迁移正在运行的会话。

### 5.3 一个执行身份贯穿所有入口

普通聊天、Issue、自动化、子任务、继续、恢复、取消共用同一设备解析与 admission；保留既有的业务状态机。普通聊天继续使用 `{kind:'conversation', topicId}`；Task 使用 `{kind:'task', taskId, dispatchId}`，禁止创建假 Task ID 来过租约或授权。

执行计划记录：operationId、subject、agentId、deviceId、派生 harnessId、model route 引用、executionGeneration、配置 / 权限 / 能力快照版本与工作目录绑定。transport 只送达，不能重新选机器。

子任务默认继承 parent 的授权与设备作用域；只有显式允许的跨设备委派才重新授权和准备上下文。不得把 `parentRuntime` 当成跨设备授权。

Prime 的实际 Device transport、artifact、工具与会话接续必须完成真实验收后才标 ready。复用现有 ACP/adapter 边界；Prime NDJSON 不得冒充 ACP。Prime 与模型 broker 可在不同机器，不因推理配置决定设备。

### 5.4 生命周期、幂等与跨端接管

A 的 Desktop 发起 B 上的 run，在 Web 打开同一会话应继续观察 / 控制同一个 operation 与 device。关闭 Web 页面不停止设备任务；重新连接先查原 operation，不再次启动。

`cancel requested` 与 `cancelled` 分开：前者是请求，后者需要设备确认退出或确认所有受控副作用已经停止。断线显示 `unknown/reconnecting`，不是直接失败、成功取消或换机重跑。

沿用现有 operation 去重、lease、generation/fencing 和结果回执。取消 / 回调 / 流式输出必须匹配 operation + device + generation；旧世代回调不得覆盖新状态。外部写操作不能保证端到端 exactly-once 时必须保留 unknown outcome，禁止无条件自动重放。

自动化使用自身绑定的执行 principal/device，不使用最近打开页面的成员身份或设备。断网等待只允许沿用现有明确的队列 / 重试策略，不新增隐式换机 fallback。

## 6. 设备操作与资源语义

### 6.1 文件、Git 和附件

Agent 产物 / 工作目录文件用 DeviceResourceRef；用户上传的附件用现有 Asset/File 对象，两者不可混用。浏览器选的文件是上传来源，不自动变为 B 的文件路径；必须经明确上传 / 同步并获得 B 的资源引用。

设备切换时重新检查 repo binding、工作目录、工具与凭证；不能把 A 的 `/Users/alex/...` 或 session ID 直接送到 B。操作前由设备校验授权 root、相对路径和实际路径，处理 `..`、symlink/junction 逃逸与目标创建的父目录边界。复用经过验证的安全文件助手，不能只写字符串 startsWith。

远程文件预览 / 字节读取需有 read RPC、权限、大小限制、取消、错误、流式 / 分块机制与真实测试。小资源可沿用既有协议；大文件不要只增加无限 base64 JSON。未经授权的 HTML/SVG 预览不能接入带原生权限的 Electron 页面。

区分 “打开设备终端”“在当前电脑打开 Terminal”“在 Finder 显示文件”。前者是 Device 操作；后两者是 Host 操作，还需证明资源位于当前 Desktop 对应设备。远程文件不能调用本机 shell.openPath。

### 6.2 MCP 和网络位置

复用现有 connector 执行服务与 mcpService，明确连接执行作用域：受管理服务端连接，或某个已授权 Device 上的连接。

stdio MCP 进程应在绑定 Device 启动，不能随查看端在 Desktop / 后端之间漂移。`localhost` 属于实际连接发起方的网络空间，不属于 “用户当前正在看的网页”。设备本地 MCP URL 只能由那个 Device 访问；禁止把它发送到应用后端当成后端 localhost。

MCP 元数据查询、安装检查、工具调用、认证状态检查必须使用同一作用域，不能查询在 A、执行在 B。Remote HTTP 连接也要明确网络边界与 SSRF 策略；浏览器 host type 不能自动放宽私网访问。

不把任意 shell 命令安装器开放成通用按钮。只有已经实现、授权、审核包来源且有结果反馈的设备管理动作才可在 Web 远程使用；否则隐藏入口并提供准确的在设备上处理提示。

## 7. UI / 路由 / 设置设计

### 7.1 功能归属表

| 功能                                  | Web                        | Desktop        | 判断依据                                 |
| ------------------------------------- | -------------------------- | -------------- | ---------------------------------------- |
| Issues / Projects / 会话 / Agent 管理 | 保留                       | 保留           | 产品与成员权限                           |
| 查看 / 控制远程 Agent                 | 保留                       | 保留           | 已授权设备、真实 adapter 与执行状态      |
| 设备文件、Git、终端                   | 有合法目标与能力时提供     | 相同           | Device 与资源权限，不是 Host             |
| 上传附件、下载、复制                  | 浏览器支持范围内保留       | 保留           | Host 支持与用户授权                      |
| 应用更新、托盘、窗口管理              | 不加载                     | 提供           | Desktop Host                             |
| 为目标设备安装 / 重启 Agent           | 仅真实支持且有 manage 权限 | 同样           | 设备能力与管理授权，不等于 Desktop-only  |
| 本机原生权限设置                      | 不伪装远程弹窗             | 本机目标时打开 | Host + OS + target identity              |
| 远程 Browser/Computer Use             | 目标支持时提供             | 同样           | GUI、OS 权限与控制租约，不硬编码 OS 推断 |
| 钥匙串 / CLI 登录                     | 可展示受权状态，不泄露密钥 | 原生授权入口   | 秘钥留在所属安全边界                     |

### 7.2 设置分为四种存储作用域

- User：外观、语言等用户偏好，遵循既有同步规则。
- Workspace：团队策略、共享 Agent 默认、设备授权，仅受权管理员修改。
- Host：当前 Desktop 的窗口、托盘、应用更新、该应用进程代理；保存在当前安装作用域，不写共享 Agent。
- Device：目标设备的执行配置、工作目录、工具就绪等，绑定 deviceId 且需要设备管理权限。

同一个 “代理” 词可能分别指 Desktop 应用代理和 Device 执行网络配置，必须命名区分。模型认证 broker 不属于 Desktop-only，一律按现行安全设计保留。

沿用现有设置布局，新增清晰分组而不是再做一套控制台：通用设置、设备管理，以及仅 Desktop 的 “此应用 / 此电脑” 宿主设置。设备管理的详情清楚标识 B；不能泛称 “本地设置”。

### 7.3 展示规则

设备 selector 隐藏不等于运行信息隐藏。聊天 / 运行详情保留紧凑的 `运行于：Build Server B`；多个候选时才提供选择控件。单设备不增加冗余表单行。运行中展示绑定设备，不允许下拉直接迁移。

所有阻断文案指向实际责任对象，例如 “Build Server B 离线”“需要在 Mac A 开启屏幕录制权限”“此操作仅支持当前桌面应用”。避免 “本地执行失败” 但用户实际在远程 B 上操作。

新会话初始聊天框继续选择 Agent；默认跟随上次使用的 Agent；不因本轮重构新增创建 Agent 向导，不改变 sidebar 宽度、一级入口和业务导航。

### 7.4 一个 registry，多层防线

扩展 `SETTINGS_CAPABILITIES` 与现有导航登记，增加 scope、必要的 Host/Device 能力、加载 / 阻断规则。仍允许 “页面可访问但不主动展示入口” 的明确产品设计，保留 `offered => gate` 不变量，不强制二者恒等。

必须同时覆盖：导航、直接 URL、lazy import/loader、命令面板、快捷键、页面启动 effect，以及 service/API/IPC 处理。前端 gate 不替代服务端授权。

宿主不支持的路由在组件 import/loader 之前处理：返回轻量不可用 / NotFound 或安全迁移页，不能先挂载原生组件再隐藏。动态设备离线时保留有意义的业务详情与恢复信息；无权限时不泄露设备名称、路径或 payload。

旧链接仅在语义明确时 redirect；退役入口保持退役，不得回落到任意设置页伪装正常。页面 manifest 完整性检查要包括命令和深链接，不能仅统计 sidebar。

## 8. 安全与构建防线

Electron 侧必须验证实际配置：`contextIsolation: true`、`nodeIntegration: false`、renderer sandbox，限制导航与新窗口；preload 只暴露窄接口，校验 IPC sender /frame/origin 与参数。不要把 contextIsolation 误认为已经完成了业务授权，也不要为消除启动问题关闭隔离。

后端每次派发重新校验 principal、workspace、Agent、device 与资源；设备验证受权操作的目标身份、有效期、generation 和 scope。凭证沿用 broker / 设备安全存储，短期执行凭证绑定操作与设备；不在 agent config、gateway 消息或日志中放长期 API key。

设备 outbound 连接沿用现有 Gateway，不要求为浏览器公开一个未经保护的本机端口；不新增无认证 localhost HTTP 服务。控制者多个浏览器标签不会创造多个 writer；交互式终端 / Computer Use 的输入权需要显式、可撤销的 lease。

构建门禁至少包括：

1. 共享 UI /services 不得直接 import Electron 实现，允许范围集中在 Host adapter 与原生入口；迁移期现有违规进入带 owner 的 allowlist，禁止新增。
2. Web entry 的静态与动态依赖图不得可达 Electron/child_process/ 本机 runner / 原生更新模块；检查构建 module graph/chunk manifest，不能只 grep 输出字符串。
3. `packages/types`、route metadata 不得经 barrel re-export 引入 Node side effect。
4. server、CLI 的运行依赖图不得引入 `apps/desktop` / Electron app；复用逻辑下沉到已有设备包。
5. `isDesktop` / `__ELECTRON__` 仅允许在构建、composition root、Host adapter 与真正原生外壳内使用；不是要求全库计数归零。
6. SSR 适用部分与 SPA 启动不得猜测 UA 后先渲染 Desktop 页面；平台未知时使用稳定壳，Host 与权限信息未完成不得自动写配置。

## 9. 实施任务与并行分工

### WD-00：基线、入口与冲突盘点（集成 Agent）

先读仓库根及各目录的 AGENTS.md；检查最新 canary、相关 PR 和迁移登记。记录 `BASE_SHA`，不得直接在用户已有脏工作树操作。

产物：

- `docs/development/web-desktop-boundary-audit.md`：每个入口的 Host/Device/Product 分类、真实路径、API、原生依赖、可达性、缺失状态与 owner。
- `docs/development/web-desktop-architecture.md`：本方案适配现行代码的 ADR。
- 现有测试 / 构建基线与已知失败，相关 PR 文件重叠清单；尤其 #427 后续行为工作和 #426 自动化分支。

验收：至少覆盖设置、Agent 创建 / 配置、初始聊天框、文件 / Git、终端、连接器 / MCP、设备连接、Automation、Browser/Computer Use、更新 / 代理 / 权限 / 通知、命令面板、深链接。没有路径证据的入口列为待核实，不写 “已修复”。

### WD-01：统一契约与安全解析（集成 / 契约 Agent，必须先合入）

复用并修正 `deviceExecution.ts`，合并绑定失效、策略与授权验证；定义 Host/Device operation 与错误契约；明确从各旧字段到最终 deviceId 的映射；新增候选完整性与解析单测。

验收：第 5 节所有反例通过；新公共设备方法不能缺 ID；不得改出第二个 resolver。契约版本与 types 变更由一个 owner 管理。

### WD-02：Host adapter 与双入口（Agent A）

改 `src/spa/entry.web.tsx` / `entry.desktop.tsx`，注入 HostPort；将窗口、更新、原生菜单、选择器与原生导航收进 adapter；校验 preload 安全；先迁移有现成功能的调用者，不搭空接口。

验收：Web 无 preload 也可启动、登录、导航和使用远程设备；Desktop 保留原生功能；不存在 try/catch 吞异常或无操作成功结果。

### WD-03：统一 admission 与设备执行（Agent B）

对齐现有 chat /task/heteroDispatch/deviceGateway/device-control/ CLI 生命周期；同一个最终上下文覆盖 start/resume/cancel/subtask。Prime 设备执行与现有后续 PR 共享实现，不能新造分支。确保 deviceId、subject、generation 贯穿实际处理链。

验收：Web→B 和 Desktop A→B 运行到同一 B；A/B 交换控制端不换设备；无设备不落应用后端；Prime/Codex/Claude Code 行为按真实能力报告。没有实际 Prime Device transport 时，明确阻断，不假装 builtin 已完整可用。

### WD-04：文件、Git、MCP、目录与终端服务（Agent C）

升级现有 services 到显式 Device context；移动中立 DTO；拆分 Host 的 reveal/open 与 Device 操作；修复无 ID fallback、远程 undefined、MCP localhost 位置漂移；补齐仅本轮承诺开放的真实操作链。

验收：代码不再依据 host 决定 fs/git/MCP 执行位置；无法支持的动作有结构化错误与正确 UI gate；A 文件路径不会流入 B；远程字节读取若未实施不能保留假入口。

**落地记录（PR #440，base `refactor/wd-contract`）**

- 新增 `src/services/localExecutionIdentity.ts`：host 经 `gatewayConnection.getDeviceInfo()` 握手取得本机 `localDeviceId`，缓存 + 并发去重；`'unknown'` 哨兵与握手失败永不授权 IPC。`useFetchGatewayDeviceInfo` SWR 成功后 `primeLocalExecutionIdentity` 回填。`requireProvenLocalDeviceId` 为本地运行时入口统一前置。
- `requireLocalExecutionTransport(deviceId, op, evidence)`：`deviceId` → device RPC；`isDesktop && evidence.localDeviceId` → IPC；其余 → `TargetRequiredError`。裸 `isDesktop` 不再放行。全部审计调用点（git×18、projectFile×8、projectSkill、heteroAgentQuota、heterogeneousAgent）传 `resolveLocalExecutionIdentity()`。
- `projectFile.readProjectFileBytes` / `readExternalAssetForPublish` 返回 `DeviceOperationResult`：远程字节读取 → `OPERATION_UNSUPPORTED`（尚无客户端字节 RPC），查询失败 → `TARGET_QUERY_FAILED`，不再静默 `undefined`。
- `mcp.ts`：stdio 与 localhost/LAN http 端点在 "连接设备" 的网络空间解析 —— 绑定本机 → IPC（新增 `mcp.callHttpTool`，原 IPC 仅 stdio）；绑定远程 → `OPERATION_UNSUPPORTED` 结构化结果；无绑定且无法证明本机 → `TargetRequiredError`。`deviceId` 或话题 `executionConfig.boundDeviceId`（兼容旧 `boundDeviceId`）定目标；connector/cloud 腿不变。
- W2-D 入口逐项加本机身份前置：`localFileService`（32）、`electron/git`（19）、`electron/heterogeneousAgent`（11，含 CodexQuotaMenu 链）、`terminal`（4）、`heteroSession`（4）、`desktopSkillRuntime`（2）—— 不再有 "无 ID = 本机" 入口。
- **遗留契约缺口（提请契约层）**：① 客户端远程字节读取 RPC（`lambdaClient.device` 无 byte-read 入口）；② 客户端 device MCP RPC（`DEVICE_RPC_METHODS` 无 mcp 项，gateway 隧道仅服务端可达）；③ MCP 安装 / 清单调用点尚无 `deviceId`/ 话题上下文（当前 unbound→本地）。

### WD-05：设置、页面、selector、命令与路由（Agent D）

扩展现有 registry；按 User/Workspace/Host/Device 划分设置；0/1/N selector 共用组件；清理深链接和命令入口；保留上次 Agent 与现有稳定壳。依赖 WD-01 契约可先用 fixture 并行，但 fixture 不能替代实机验收。

验收：直接 URL 不触发 Electron 导入 /effect；0/1 不出现选择器；两候选中一台离线仍按 2 处理；固定策略不允许 override；设备 badge 与真实 run identity 一致；修改个人选择不污染其他成员。

### WD-06：依赖门禁与测试矩阵（Agent E）

添加边界 AST / 依赖图检查、registry 完整性、参数契约测试，以及双宿主 × 双设备端到端矩阵。变更影响 shared contracts、权限、gateway、device-control 或入口时必须扩展 CI 范围，不允许只跑改动目录的 UI tests。

验收：故意引入一次共享 UI→Electron import、设备 ID 缺失或深链接越界时，测试确实失败。测试不能靠永久 mock Electron 对象来给 Web 补能力。

### WD-07：集成切换、迁移、清理（集成 Agent）

先做真实纵向切片，再逐入口迁移，最后删除旧隐式路径。保持旧 run 的协议 / 身份到 drain 或明确终止；新 run 使用新契约；失败不回落旧本机 / 后端逻辑。生成最终审计表、失败项与截图 / 日志 / 运行证据。

验收：本说明第 11 节通过；无仅隐藏 UI 但可调用的退役 / 越界路径；所有 claimed completed 项均有相应证据。

### 依赖图与 worktree 纪律

```text
WD-00 -> WD-01 -> [WD-02, WD-03, WD-04, WD-05, WD-06] -> WD-07
```

共享接口、根 package.json、lockfile、数据库迁移 journal 由集成 Agent 单写。A-D 仅在其责任路径修改；跨域接口变更先提交给契约 owner。Agent E 可以写跨域测试，不直接重写其他 Agent 实现。

各 Agent 使用隔离 worktree 与唯一分支；统一基于已合入 WD-01 的提交再并行。禁止多人修改同一 worktree、相互 reset、批量 cherry-pick 未核验旧 PR。

可采用以下方式建立初始隔离工作树，命令示例需按本机目录调整：

```bash
git fetch origin canary
BASE_SHA=$(git rev-parse origin/canary)
git worktree add -b refactor/wd-contract ../orvilo-wd-contract "$BASE_SHA"
# 其余分支由集成 Agent 在 WD-01 合入后，从统一的新基线创建。
```

每个交付说明：范围、基线 SHA、修改路径、契约变更、测试命令 / 结果、未覆盖项、迁移 / 回滚方式。不得写 “所有问题已解决” 而不报告阻塞。

## 10. 迁移与发布顺序

采用增量替换；不是全仓重写。

1. 先修解析安全规则并建立契约与边界门禁。
2. 做最小真实纵向切片：A 的 Web/Desktop → 显式 B → 读取 B 的测试目录 → 发起一条合法 Agent 任务 → 查看结果 → 取消 / 重连。
3. 迁移普通聊天，再迁移 Issue / 子任务 / 自动化；业务生命周期沿用原实现。文件 / Git/MCP 可以按操作独立切换，但同一操作不能依错误自动 fallback。
4. 切换 settings /commands/routes；完成差异截图与构建图检查。
5. 等旧运行 drain 后退役 legacy `local` 语义与默认本机入口，保留有限历史解码兼容。

数据迁移原则：`local + deviceId` 保留真实绑定；`device + deviceId` 保留；`local` 没有可信 deviceId 进入 unresolved，不猜当前机器；`sandbox/embedded` 只有证明真实注册设备后才映射；用户默认修改不改历史 run；不得删除历史会话、记忆或模型配置。

先只加必要的兼容字段 / 协议版本，完成回填后再收紧约束；不随意增设第二套 Device 表。迁移编号、journal、DBML 与 #426 等分支由集成 Agent 协调，不在文档预占编号。

发布开关沿用现有机制，若需新开关只用于迁移 cohort，不作为第二套永久架构。回滚应阻断 / 退回兼容版本的控制界面，不能把绑定 B 的任务改到 A 或后端执行。旧客户端缺少新协议能力时 fail closed，并提示升级。

## 11. 必须通过的验收矩阵

| ID  | 场景                                | 必须观察到的结果                                              |
| --- | ----------------------------------- | ------------------------------------------------------------- |
| A01 | Web，无设备                         | 正常使用非执行业务；无 selector；执行明确阻断；不报缺 preload |
| A02 | Web，仅合法 B                       | 无 selector；启动记录与 B 实际进程一致                        |
| A03 | Desktop A，仅本机 A                 | 同样无 selector；执行记录仍有 A 的真实 ID                     |
| A04 | Desktop A，目标远程 B               | 文件、MCP、Agent 进程落 B；A 无错误本机副作用                 |
| A05 | A 在线，B 离线，两者合法            | 两候选保留；可修改时 selector 出现；不偷偷剔除 B              |
| A06 | 已绑定 B，B 离线                    | 保留 B；不换 A；按现有策略明确等待 / 阻断                     |
| A07 | 已绑定 A 被撤销，只剩 B             | `DEVICE_BINDING_INVALID`；显式修复而不是自动换绑              |
| A08 | 清单 / 权限查询失败或分页不完整     | 不按 0/1 处理，不自动写配置                                   |
| A09 | workspace 固定 B，成员偏好 A        | UI 不允许覆盖，服务端拒绝越权覆盖                             |
| A10 | Web 与 Desktop 打开同一会话         | deviceId /operationId/generation 一致，无新执行者             |
| A11 | 运行中改默认设备                    | 旧 run 不迁移，新 session 按新默认解析                        |
| A12 | 并发发送、重试与旧回调              | 无重复活动 writer；旧 generation 无法覆盖状态                 |
| A13 | 取消后网络中断                      | cancel-requested/unknown 与 confirmed-cancelled 分开          |
| A14 | Web 直达更新 / 原生权限路由         | 无原生组件 /effect/IPC 请求；正确不可用处理                   |
| A15 | 命令面板 / 快捷键进入原生动作       | 与页面同一 gate，不存在旁路                                   |
| A16 | 浏览器附件上传到远程任务            | 上传来源与 Device 文件引用分开，B 获得有效资源                |
| A17 | 远程文件点击 Finder/Terminal        | 不对 A 的原生系统误用 B 路径                                  |
| A18 | Device MCP 指向 localhost           | 只在所属 Device 网络空间解析与执行                            |
| A19 | 无能力 / 无授权 / 过期授权          | UI 与 API/Device 均拒绝；无成功 no-op                         |
| A20 | 新 Agent / 新 Conversation          | 无 Builder/model call；新会话不创建新 Agent                   |
| A21 | Prime/Codex/Claude Code 各执行      | 按真实 adapter 支持完成；无静默互相替代                       |
| A22 | Prime 第二条消息、重启、换设备      | 原生续会话与重建上下文正确区分，不假 resume                   |
| A23 | Automation 无人打开网页时触发       | 使用绑定 principal/device；非浏览器定时器或最近查看者身份     |
| A24 | Desktop 未启用本机 Device Host      | 仍可完整远程控制 B；UI 不假设本机可执行                       |
| A25 | Desktop 关窗口 / 退出 / 设备睡眠    | 与公开的生命周期语义一致，远程 run 不误取消                   |
| A26 | Web 构建与 server/CLI 构建          | Web 无原生执行依赖；server/CLI 无 Electron app 依赖           |
| A27 | 成员只更改自己的设备偏好            | 不覆盖其他成员或共享 admin 默认                               |
| A28 | 设备身份 / 路径 / 跨 workspace 篡改 | 服务端与设备拒绝，不泄露越权资源                              |

实机证据至少包含两个独立设备进程环境；用同一个进程换 deviceId 的 mock 不算远程验收。物理两台机器最佳；隔离 VM / 容器可证明进程 / 文件隔离，但必须标明，不冒充跨主机网络验收。

每次纵向验收生成唯一 nonce，在 B 的临时目录写入并读取对应内容，检查实际 Device 身份、进程、artifact 版本、operation/generation 和回执；确认 A 的测试目录没有产生该文件。UI、server、gateway、device 日志通过相同 trace/operation 对应，日志脱敏。

Prime 必须真的调用受控工具，不能由测试脚本代写文件冒充 Prime。真实模型 / 设备凭证不可用时记录阻塞，不以 mock 宣称通过、不绕过认证、不默认使用未经授权的付费调用。

## 12. 测试命令与最终交付

固定基线根 package.json 已提供 `bun run check`、`type-check`、`build:spa`、`desktop:build:main`、`test-app`、`test:e2e:smoke` 等脚本。实施 Agent 先读各包脚本与 check 帮助；server/CLI 测试必须按各自实际配置执行，不假定所有测试都在根目录 vitest 下。

建议运行顺序：

```bash
# 示例：路径按实际新增文件调整；不代表本说明已执行过这些命令。
bun run check --help
pnpm exec vitest run <本次契约与服务单测文件>
bun run check <本次变更文件>
bun run type-check
bun run build:spa
bun run desktop:build:main
bun run test:e2e:smoke
# 然后执行各包 headless/CLI 测试、依赖图检查、代表性 Desktop 打包启动与双设备场景。
```

已有失败必须单独登记，不允许将新增失败混进去。受影响包与发布构建必须达到可发布要求；不能把局部 lint 通过写成 “Web/Desktop 全部验收通过”。现存脚本需要修复时说明原因，不删除门禁或无差别扩大忽略。

最终交付至少包含：架构 ADR、入口 / 依赖审计表（每项处理结果）、实现与迁移、契约和安全回归测试、双宿主双设备截图 / 日志证据、未完成项及阻塞原因、旧路径清理清单、回滚说明。

本轮完成的判断不是 “Web 看不到 Desktop 按钮”，而是：

> 同一任务不因换访问端而换执行机器；同一设备不因访问端不同而更换权限规则；宿主专属能力不会从 UI、命令、路由、服务或构建依赖中泄漏。

## 13. 证据索引与外部参考

仓库事实可在固定提交下逐项核验：

- PR #427：合并状态、非行为改动声明、现行设备契约。
- `docs/development/device-execution-contract.md`。
- `packages/types/src/agent/deviceExecution.ts`。
- `src/services/targetRequiredError.ts`。
- `src/services/projectFile.ts`。
- `src/services/mcp.ts`。
- `src/store/chat/slices/agentRun/actions/dispatch/agentDispatcher.ts`。
- `packages/app-config/src/routes/settings.ts`。
- `apps/server/src/services/deviceGateway/authorizedToolCall.ts`。
- `packages/device-control/src/dispatch.ts`。
- `apps/cli/src/device/agentRun.ts`、`agentRunRegistry.ts`。
- 根 `package.json`。
- PR #426：仅引用其 draft / 范围 / 自述验收限制，不把 PR 自述测试当成本次独立验证。

外部原始文档（用于架构与安全背景，不是 Orvilo 当前实现的证据）：

```text
Electron — Security
https://www.electronjs.org/docs/latest/tutorial/security

Visual Studio Code Server — 远程环境可由 Desktop 或 Web 客户端访问
https://code.visualstudio.com/docs/remote/vscode-server

MDN — File System API — 浏览器用户授权文件访问与沙箱限制
https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
```
