# Quota 控制面退役记录（观测 - only 收口）

> 对应 P06。清点来源：[inventory.md](../implementation/orvilo-acp-caid/inventory.md) F 节；
> 相邻退役面见 [provider-retirement.md](./provider-retirement.md)。

## 判据

Quota 是**观测面**，不是执行控制面。异构 Agent 的凭据一律是执行设备上的 CLI 原生登录：
app 不得管理 managed/referenced 凭据账号，不得维护 pool/pinned/weighted 路由，也不得按
quota 结果向执行注入 `CLAUDE_CONFIG_DIR` /profile env。保留的是：绑定执行设备 + 原生
identity snapshot 的额度采样、读取、校准与日历展示，unknown 状态如实呈现（≠0 ≠满额度）。

## 处置结果

| 面                                                                                                               | 处置          | 说明                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `agentQuota` router：`createAccount`/`deleteAccount`/`updateAccount`                                             | **RETIRE**    | 账号行只由 `ingestSnapshot` 按 `(provider, externalAccountId, 执行设备)` 幂等 upsert 产生                                       |
| `bindAccount`/`unbindAccount`/`listBindings`/`switchAccount`/`resolveAccountLoads`/`selectAccountForAgent`       | **RETIRE**    | TRPC 过程、`AgentQuotaService` 对应方法、`AccountLoadView`、客户端 `agentQuotaService` 封装一并删除                             |
| `quota/loadBalancer.ts`                                                                                          | **RETIRE**    | pinned/weighted 路由的唯一实现处；删除导出与 `quota.test.ts` / `agentQuota.pipeline.test.ts` 中对应用例                         |
| `resolveQuotaAccountEnv.ts`（`agentRun` transports/hetero）                                                      | **RETIRE**    | quota→`CLAUDE_CONFIG_DIR` env 注入的唯一写入点；executor 不再消费 `quotaAccountPlan`                                            |
| `QuotaAccountManagerModal`（编辑 / 绑定 / 切换 modal）                                                           | **RETIRE**    | 连同 `claudeQuota.manage.*` locale 键（en-US/zh-CN 已镜像删除，其余 locale 走每日 i18n）                                        |
| `QuotaAccountSwitcher` → `QuotaAccountIdentity`                                                                  | **REPLACE**   | 菜单内改为只读身份行：执行设备上报的原生 identity（displayName/email + planTier），无 Manage/Switch 入口                        |
| `ClaudeCodeQuotaMenu`                                                                                            | **REPLACE**   | 账号选择改为「执行设备可信 externalAccountId 命中则展示，否则取该设备 `claude-code` 首条观测」，不读 binding、不读 pinning      |
| `ingestSnapshot`/`recordUsage`/`getWindows`/`getLatestReadings`/`listSnapshots`/`listUsageTurns`、`listAccounts` | **KEEP**      | `listAccounts` 保留为只读观测列表（注释写明注册路径）；授权依据是执行设备绑定 + 调用者权限，非客户端自报身份                    |
| `agentQuota` schema/`AgentAccountBindingModel`/`AgentProviderAccountModel`                                       | **DEFER→P09** | 存量 binding 行无读者；字段收敛与数据销毁在审计 FK/usage 归属后另行授权，本 PR 不动                                             |
| `quota-sampler`、`device-control/claudeCodeQuota`                                                                | **KEEP**      | 设备侧采样上报链路原样保留（含原生 auth.json/keychain 解析、OAuth API 探测）                                                    |
| `quota/cost.ts`/`calibration.ts`/`windows.ts`/`readings.ts`/`identity.ts`                                        | **KEEP**      | 纯数学与解析库，无执行副作用；个别当前无消费者的 helper（如 `currentUtilization`、`parseClaudeCredentialPlan`）属共享库保留范围 |

## 不可逆 / 双读注意

- 存量 `agent_quota_account_bindings` 行不再有任何读取方，视为冻结数据；与 P05 的
  `provider-binding:v1:*` session key 一样属「拒绝式兼容」—— 旧绑定不再影响执行路径。
- run 归属：executor 仅把 `runExternalAccountId`（执行设备探测到的原生 identity）写进
  usage 记录，不再回退到 quota plan；采样归属永远以设备上报为准。
- `credentialRef` 仍由 `ingestSnapshot` 写入（`origin:'keychain'`），作为身份来源的审计
  记录，无任何读取方将其用于鉴权或注入。

## 验证

- `bun run check <changed files>`：lint clean（3 处自动修复已审），测试 207 通过。
- `rg` 零命中：`resolveQuotaAccountEnv`、`selectAccountForAgent`、`bindAccount`（quota 域）、
  `QuotaAccountManagerModal`、`claudeQuota.manage`。
- 无 quota 服务时：executor 的 quota 探测全 `.catch(() => null)` 旁路，授权 ACP 聊天按既定
  策略照常启动（`heterogeneousAgentExecutor.test.ts` 钉住该路径）。
