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
