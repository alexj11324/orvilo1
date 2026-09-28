# 执行扩展合约（Extension Contracts）

> 对应 P18（未来 Harness / 云执行扩展合约测试）。证明未来能力可以按既有三轴
> 接入而不改动 Chat/Task/CAID 核心代码；不提前上线任何未来产品。

## 三条扩展轴

执行路径的三个可替换轴各自独立、互不引用：

| 轴               | 落点                                                                                          | 新增一个实现需要                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Harness 身份** | `initialize` 请求的 `clientInfo`/`protocolVersion`（`AcpAgentSession.buildInitializeParams`） | 无 —— 宿主统一以 `orvilo`/`Orvilo` 身份握手，且只接受 ACP `protocolVersion: 1`                                                                            |
| **ACP driver**   | `AcpAgentRuntimeSpec`（spawn 侧）+ `AgentEventAdapter`（事件侧）                              | `HETEROGENEOUS_AGENT_CONFIGS` 描述符 + `ACP_AGENT_RUNTIMES` 运行时 spec + `localAgentRegistry` 适配器绑定（标准 ACP 词汇直接复用参数化 `TraeAcpAdapter`） |
| **运行目标**     | 本地 stdio / 绑定设备（`deviceGateway` RPC）/ 云沙箱（`SandboxProvider`）                     | 实现 `SandboxProvider`（`capabilities` + `callTool` + `exportFileToUploadUrl`），并在 `SandboxProviderKind` 联合与 `factory.ts` 分支登记                  |

未来暴露 ACP 的 Orvilo Harness 只需第二条轴：一个 spec + 一个描述符即可被
Task/Chat/CAID 复用，会话类与事件词汇不新增代码。未来云执行目标只需第三条轴。

## 一致性测试（test-only，无生产实现）

- `packages/heterogeneous-agents/src/spawn/extensionContract.test.ts`
  - 假 ACP 对端（PassThrough stdio + 桩 `spawn`）驱动**真实** `StandardAcpSession`：
    `initialize → session/new → session/prompt → session/update 流 → 完成 →
进程清理`全程通过，事件经 `AgentStreamPipeline` 落成统一 `AgentStreamEvent`。
    该测试首次运行即抓住 `standardAcpSession.ts` 仍以 `lobehub`/`LobeHub` 身份握手
    的 P03 遗漏，已修复为 `orvilo`/`Orvilo`。
  - `session/cancel` 取消 + 退出确认（`interrupt()` 仅在进程真正退出后 resolve）。
  - `protocolVersion: 2` 的对端被拒绝 —— 版本兼容硬门禁。
  - 适配器轴：`TraeAcpAdapter({eventPrefix:'fakeharness', provider:'orvilo-harness'})`
    注入 `AgentStreamPipeline`，未注册厂商的前缀 /provider 作为纯数据生效。
  - 生产注册表守门：每个可选本地类型都有活跃适配器或记录在案的传输别名
    （`cursor` → `cursor-acp`）；remote 类型全部保持已实现的 `remote-task` 派发；
    任何 fake/mock/test 键不得出现在生产注册表。
- `apps/server/src/services/sandbox/__tests__/extensionContract.test.ts`
  - 假云机器实现 `SandboxProvider` 接口即获得文件下发（首 call 前 `runCommand`
    下发、幂等）、命令透传、产物经共享上传 URL 回流与 file record 落地；
    `capabilities.shell = false` 时自动跳过 provisioning。
  - `SandboxProviderKind` 联合保持闭合；`SANDBOX_PROVIDER` env 为同名单 zod 枚举，
    未实现的 kind 无法被选择。

## 验证

- 新增测试 driver/target 不修改 Chat、Task、CAID 核心代码：本 PR 的全部生产改动
  只有 `standardAcpSession.ts` 的 `clientInfo` 品牌修正（测试所发现的回归）。
- 生产依赖图无假适配器 / 自研假引擎 / 自动云回退：注册表守门测试 + P07 的
  decoder/live 拆分（`registry.test.ts`）钉死。

## 回滚边界

不得为预留空间新增付费资源、云供应商调用或凭据池 —— 本 PR 没有任何生产侧新增，
仅有测试与文档；删除两测试文件与文档即可完整回滚。
