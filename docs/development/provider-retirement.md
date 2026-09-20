# Provider 绑定与无主模型入口退役记录

> 对应 P05。清点来源：[inventory.md](../implementation/orvilo-acp-caid/inventory.md) G/H 两节；
> 上一轮隐藏产品面收敛见 [hidden-surface-retirement.md](./hidden-surface-retirement.md)。

## 判据

异构 Agent 只走**订阅登录**（CLI 原生 auth）一条凭据路径。任何把执行绑到 app-owned
provider /keyVault 的通道（server-default relay、BYOK binding、direct model 端点）连同
其 UI、类型、测试一起退役；**不能只隐藏 UI，写入 / 启动 / 导入路径必须一并收口**。

## 处置结果

| 面                                                                                                                                                          | 处置                                                 | 说明                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `providerBinding/` 宿主模块（desktop `modules/heterogeneousAgent/providerBinding{Host,Port}.ts` + 全部 per-CLI drivers）                                    | **RETIRE**                                           | 宿主侧为 BYOK binding 注入 env / 参数的整套实现，无其他消费者                                                                                                                                                           |
| `HeterogeneousAgentImpl.startSession` 的 `providerBinding` 参数                                                                                             | **RETIRE**                                           | session 仅存 `args`/`env`/`model`/`resumeSessionId`；`sendPrompt` 回收为普通实现                                                                                                                                        |
| `HeterogeneousProviderConfig.authMode`/`apiConfig` 与 `HeterogeneousApiConfig`/`HeterogeneousAuthMode` 类型                                                 | **RETIRE**                                           | 持久化 JSONB 里的旧字段不迁移、直接忽略；新增 `legacy apiConfig shape` 测试钉住该语义                                                                                                                                   |
| server-default relay：`getServerDefaultHeterogeneousCapability` / `beginServerDefaultOperation` / `settleServerDefaultOperation` / `serverDefaultApiConfig` | **RETIRE**                                           | TRPC 过程、客户端 fetch、SWR key、ProfileEditor 链路全删                                                                                                                                                                |
| `HeteroOperationCapability` 中的 `model:invoke`                                                                                                             | **RETIRE（收窄）**                                   | 仅移出可授予集合；`internalJwt` 校验白名单保留该字面量，存量 token 在有效期内仍可解析（双读窗口），无任何签发方再请求它                                                                                                 |
| `claudeCodeDirectEnv.ts`（sanitize + `HETEROGENEOUS_PROVIDER_BINDING_*` 错误常量）                                                                          | **RETIRE**                                           | binding 专用，无其他消费者                                                                                                                                                                                              |
| `modelPicker.tsx`、ProfileEditor 的 auth/api-mode UI、`HeteroControlBar` 的 `ChatInputCredits`、dispatcher 的 `authMode==='api'` 拦截                       | **RETIRE**                                           | 配额 chip 改为按解析出的 CLI 类型常驻，不再看 authMode                                                                                                                                                                  |
| `heteroSessionBindingKey` 的 `provider-binding:v1:*` 历史值                                                                                                 | **KEEP\_COMPAT（拒绝式）**                           | 保留 `heteroSessionBindingKey` 元数据（仍用于识别 engine 切换）；旧 binding key 与当前 `native:v1:*` 不等 → 恒判 `binding_changed`，会话**不能**在原生凭据下静默续跑，语义正确                                          |
| OpenAPI 直模型端点（chat /translate/generate-reply/replies post）                                                                                           | **RETIRE**                                           | route + service + spec 同步删除，spec 测试钉住「不存在」                                                                                                                                                                |
| `initModelRuntimeFromDB`（读 user keyVaults/baseURL + OAuth 刷新）                                                                                          | **REPLACE → `initModelRuntimeFromDeploymentConfig`** | 全调用点迁移：async 路由（image/video/file/ragEval）、lambda（video/chunk/asr/userMemories）、agentSignal、userMemory、systemAgent、toolExecution serverRuntimes、verify、webapi/chat。旁路逐项追过，无残留模型循环后门 |
| `/webapi/chat/[provider]` provider 参数                                                                                                                     | **KEEP + 校验**                                      | `initModelRuntimeFromDeploymentConfig` 内对 `ModelProvider` 枚举白名单校验，非部署托管 provider 直接 BadRequest                                                                                                         |
| 导入器 `aiProviders`/`aiModels` 表                                                                                                                          | **RETIRE**                                           | 从 `IMPORT_TABLE_CONFIG` 移除；测试钉住「导入 payload 中这两表被整体忽略」                                                                                                                                              |
| Locale：`heteroAgent.apiMode.*`(15) / `heterogeneousStatus.apiMode.*`(20) / `heterogeneousStatus.auth.*`(3)                                                 | **RETIRE**                                           | `packages/locales/src/default` + en-US/zh-CN 镜像同步删；其余 locale 留给每日 i18n 工作流                                                                                                                               |
| `model:invoke` API key scope（`packages/const`）、`getServerDefaultAgentConfig`/`apiMode:'responses'` 等同名异物                                            | **KEEP**                                             | 与退役面无关，逐一核对过消费者                                                                                                                                                                                          |

## 不可逆 / 双读注意

- 持久化 `heterogeneousProvider.authMode/apiConfig` 旧值**不清理**，下次保存被字段白名单自然丢弃；期间被忽略而非报错。
- `provider-binding:v1:*` 的存量会话 key 使得相关 topic 下次发送走「新建会话」路径而非续跑 —— 预期行为，非回归。
- 未触碰 OIDC / 凭据 vault。quota 账号体系在 P06 收口，见
  [quota-control-plane-retirement.md](./quota-control-plane-retirement.md)。

## 验证

- `bun run check <changed files>`：lint clean；相关测试全绿（宽并行批次里
  `agentSignal/index.integration.test.ts` 出现两次超时 / 计数假失败，单跑 4 文件 27 测试通过，
  符合基线已知的并行 flaky 形态）。
- `apps/server` `pnpm type-check`：302 errors ≤ 309 基线，新增为零。
- `rg` 全仓零命中：`providerBinding`、`serverDefaultHeterogeneous`、`authMode`（异构域）、
  `heteroAgent.apiMode` / `heterogeneousStatus.apiMode` / `heterogeneousStatus.auth`。
