# Web/Desktop 统一执行目标路径核对

> 对应 P08（Web/Desktop 同一执行产品路径）。结论：双端已共用同一份目标解析、
> 授权与路由语义，计划所列差异面均为「必要宿主差异」而非功能缺口；本文件逐条登记
> 实现位置与钉住语义的测试。

## 逐条核对（计划步骤 → 现状）

### 1. 共享路由 / 操作协议；Web 无本机 IPC 时经受授权远端目标，功能入口不删

- 路由：`src/spa/router/desktopRouter.shared.tsx` 是唯一路由表（desktop/mobile 配置
  只做平台差异），web/desktop 同路径同入口；legacy 深链保留为 redirect。
- 执行目标解析：`src/helpers/executionTarget.ts` 的 `resolveExecutionTarget` /
  `resolveExecutionPlan` 是双端唯一入口；`clientExecutionAvailable`（本机可跑）与
  `deviceRoutingAvailable`（gateway 可路由）是两个独立门。web 上
  `clientExecutionAvailable=false` 时 `local` 目标如实降级为 `none`/ 经
  `boundDeviceId` 的 `device`，从不静默改道云 sandbox 或渲染端机器。
- 入口：`HeteroDeviceSwitcher` 在 web 上照常渲染设备列表、状态与授权提示；无设备时
  显示 download/enroll 引导，而非移除功能。

### 2. 统一 nativeSessionId/operation/target 映射；断线 ≠ 执行结束

- session 绑定键 `heteroSessionBindingKey`（`native:v1:*`）+ `operationId` 贯穿
  续聊 / 恢复；P05 起 `provider-binding:v1:*` 旧值恒判 `binding_changed`。
- 远端派发经 `runAdmission` 持久账本：`offline`（确定未送达）/`rejected`（被拒）/
  `unknown`（ack 丢失，可能仍在跑）三分 —— 断线不判完成，`unknown` 保留对账。

### 3. 新建 / 续聊 / 线程保持目标；设备不可用显式阻塞

- 目标快照：`snapshotTopicExecutionConfig` 在话题创建时冻结
  `executionTarget`/`boundDeviceId`；续聊沿用该快照。
- `resolveExecutionPlan`：`bound-device-offline`/`no-bound-device`/`no-online-device`/
  `ambiguous-online-devices` 全部落到 `device-unrouted` 带原因 —— 显式阻塞，不切换
  设备不上云。仅用户显式 `auto` 模式会在唯一在线设备上自动选路。
- `packages/types` `executionEnv: 'device-unrouted'` + `unroutedReason` 透传至工具层
  （`resolveUnroutedTexts` 向模型如实描述），设备回归后可绑定恢复。

### 4. 与 #95 统一看板 / 导航配合

本 PR 不重写一级 IA、不动 workspace slug；#95 保持独立 draft。

## 钉住语义的既有测试

- `src/helpers/executionTarget.test.ts`：`bound-device-offline`、`no-bound-device`、
  `ambiguous-online-devices`、`no-online-device` 全部分支断言 `device-unrouted`；
  web(`clientExecutionAvailable:false`)+bound 解析为 `device`。
- `src/features/ChatInput/hooks/useSelectExecutionTarget.test.ts`：web 选 local 无
  设备信息时 early-return；新建话题即冻结目标快照。
- `apps/server/.../heterogeneousAgent/runAdmission` 测试：`offline`/`rejected`/
  `unknown` 判定与不可重写性。
- `desktopRouter.sync.test.tsx`：shared 路由表双端一致性。

## 结论

无需删改 —— 本 PR 为核对 / 文档交付。后续执行目标语义变更应回到
`resolveExecutionTarget`/`resolveExecutionPlan` 单一入口，不得在各端散落重实现。
