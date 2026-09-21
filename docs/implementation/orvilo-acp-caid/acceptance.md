# P00 — 验收矩阵（acceptance）

> 初始状态全部为 `NOT_RUN`；缺环境 / 凭据 / 真机的记 `BLOCKED`，不得用 mock/skip 冒充通过。
> 证据须含：确切 source SHA、host/agent 版本、执行设备归属、失败注入项、CI run 链接。
> 单元测试 stub 到 dispatch 只证明参数传递，不证明真实 ACP 可用。
>
> **P20 更新（2026-09-19，SHA = P19 栈顶 `210a63a3` 分支 `test/retirement-and-parity-guards`）**：
> 本机真实运行了一次 dockerless dev 栈（PostgreSQL 17.11 + pgvector + Redis 8 + s3rver + Next/Vite dev，
> seeded `agent-testing@orvilo.aspectlylabs.com`）。可证明的「退役 / 准入 / 门禁类」行已按
> 实机 HTTP/DB 证据与已落地测试标 PASS；凡需真实 ACP harness、绑定可达设备、LLM 凭据或发布产物的行
> 一律记 `BLOCKED` 并写明缺什么（汇总见 `cutover-runbook.md` §5）。
>
> **R00 更正（2026-09-20，组合树 HEAD `51a2b7ed` = PR #148 `refactor/finish-legacy-retirement`）**：
> 独立审查（`01-review-report.md`）对 P00–P21 组合树发现 F01–F12。本矩阵已将复合行拆为
> 「退役负路径（-neg）」与「保留正路径（-pos）」两列：负路径 PASS 不自动证明正路径能力。
> 新增 `PARTIAL` 状态：已有部分证据但存在已知缺口，缺口由整改项 R01–R11 收口（见 `remediation/`）。
> 以全部 `PASS` 行汇总宣称整体验收通过仍然不成立 —— 见 §9 整改状态。

## 0. 组合树与 PR 清单（固定审查基线）

| Plan | PR   | Head SHA    | 计划依赖                    | 审查结论摘要                                  |
| ---- | ---- | ----------- | --------------------------- | --------------------------------------------- |
| P00  | #126 | `f377b5111` | —                           | 清点文档已交付；非产品验证替代                |
| P01  | #127 | `ac85ad500` | P00                         | 执行契约迁移已有成果                          |
| P02  | #128 | `384664e78` | P01                         | facade 拆分形成；F06/F09 待收口               |
| P03  | #129 | `848ca8433` | P02                         | 品牌清理有实改；产物 / 升级验证待补           |
| P04  | #130 | `685d3a9af` | P03                         | 双读窗口实现；升级矩阵待补                    |
| P05  | #132 | `c3ce5c95e` | P04                         | Provider 控制面退役；F10 待收口               |
| P06  | #133 | `84482e8d5` | P05                         | 观测面保留；F11 待收口                        |
| P07  | #134 | `348930214` | P06                         | live/historical registry 拆分                 |
| P08  | #135 | `59a044077` | P07                         | doc-only 审计；正路径 BLOCKED                 |
| P09  | #136 | `62df9e11e` | P08                         | 工具 outcomes 合同；F04/F05 待收口            |
| P10  | #137 | `097d6b91b` | P09                         | doc-only 审计；F06 待收口                     |
| P11  | #138 | `b68f9ff03` | P10                         | contract 元数据写入；F07 待收口               |
| P12  | #139 | `1de79faf2` | P11                         | 增量 patch/CAS 有实改                         |
| P13  | #140 | `571f55f13` | P12                         | 锁内依赖重验有实改                            |
| P14  | #141 | `6511fdacd` | P13                         | 预检 / 恢复有实改；F01/F02 阻塞               |
| P15  | #142 | `45bad7482` | P14                         | same-ref 串行化；F03 待收口                   |
| P16  | #143 | `b027ff313` | P15                         | goal-stop fences；F08 待收口                  |
| P17  | #144 | `2f34aab63` | P16                         | 集成状态 UI / 并发设置接线                    |
| P18  | #145 | `318017a48` | P17                         | 合同测试有价值；非真实设备生命周期            |
| P19  | #146 | `9d1a49042` | P04,P05,P06,P09,P10,P17,P18 | 防复活门禁有价值                              |
| P20  | #147 | `2fc8943cd` | P19                         | negative probes + runbook；核心正路径 BLOCKED |
| P21  | #148 | `51a2b7edc` | P20                         | 物理删除已提交；合并须待 R01–R11 门禁         |

备注：`#131` 为无关 navigation/E2E PR，不属于本计划。并行链 #129–#133 已按依赖并入 P19 所在栈。

## 状态词汇

`NOT_RUN` 未执行・`BLOCKED` 缺前置（记原因）・`PASS`（附证据链接）・`FAIL`（附缺陷）・`PARTIAL` 部分证据，已知缺口挂到整改项

## 1. 退役与准入（旧体系不可复活）

| ID      | 场景                                           | 通过标准                                      | 状态    | 证据                                                                                                                                                                                                                                                                                   |
| ------- | ---------------------------------------------- | --------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E15     | 旧 Lobe engine/Provider 配置导入               | 历史可读；新执行拒绝并要求 ACP binding        | PASS    | IMPORT\_TABLE\_CONFIG 不再含 `aiProviders`/`aiModels`（P19 importer guard `apps/server/src/retirementGuards.test.ts`）；异构执行必经 dispatchAuthorization 绑定设备（本机 op 落 `error`/`No bound device for hetero agent`）                                                           |
| E16     | SDK/CLI/Labs/env 绕过                          | 不能恢复旧 LLM loop 或 Provider 凭据注入      | PASS    | `resolveQuotaAccountEnv`/`claudeCodeDirectEnv` 已删且由 P19 guards 锁定；`LOBE_*_ACP_COMMAND` 双读仅选 ACP 二进制路径，不携带凭据注入                                                                                                                                                  |
| E21-neg | 退役隐藏路由 / 旧客户端（退役侧）              | 任意认证方式返回一致退役错误                  | PASS    | 实机（SHA `210a63a3` dev 栈）：`POST/GET /api/v1/chat{,/translate,/generate-reply}`、`/api/v1/anthropic/messages`、`/api/v1/openai/chat`、`/api/v1/heterogeneous-relay/operations` → 404；trpc `agentQuota.{createAccount,switchAccount,selectAccountForAgent}` → `No procedure found` |
| E21-pos | 任务验收 /automation 等保留面正路径仍工作      | 保留功能真实可用，不仅 schema 校验活着        | BLOCKED | 保留面 `messages/responses/agents/topics` 存活证据仅为 400 schema 校验（非正向功能证据）、`agentQuota.listAccounts` 认证后返回 `[]`（空列表不证明正向能力）；正路径聊天 / 任务验收待 R11                                                                                               |
| E22     | 发布 bundle 与默认出站                         | 产物不含旧引擎；不请求退役 Lobe 服务          | BLOCKED | 源码侧已证（P19：hetero 包与 `src/` 无 `@orvilo/agent-runtime` import）；发布构建产物未扫 —— 缺一次固定 SHA 的 `bun run build` + dist 扫描（本机未跑 release build）                                                                                                                   |
| RB01a   | 全入口拒绝旧 engine ID / 未知 runtime / 无绑定 | UI/API/CLI/import/cron/webhook 一致           | PASS    | P19：production registry 仅含 live ACP 类型（registry 守卫 `extensionContract.test.ts` + `retirementGuard.test.ts`）；实机：goal.advance 派发的 hetero op 因无绑定设备显式落 `error`（无静默回退）                                                                                     |
| E14     | `autoStart:false` 旧调用                       | 明确 queued intent 或明确拒绝；不无声提前启动 | PARTIAL | 实机：`aiAgent.startExecution` 对不存在 op 显式报 `Operation ... not found`，对终态显式报错（负路径已证）；**缺口 F09**：合法 `idle` op 仍落到 `scheduled:false / success:true` 成功无动作，未验证 `autoStart:false` 合法输入合同 —— 整改 R05                                          |

## 2. ACP 真实执行边界

| ID  | 场景                        | 通过标准                                                              | 状态    | 证据                                                                                                                                                                                                                                        |
| --- | --------------------------- | --------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E01 | Web 控制设备 B 普通任务     | 真实握手→prompt→事件→终态；归属 B                                     | BLOCKED | 缺可达绑定设备（device-gateway wss 本机不可达 → 注册设备 offline）+ 真实 ACP harness CLI / 凭据                                                                                                                                             |
| E02 | Desktop 控制同一设备 B      | 与 E01 业务结果 / 权限一致，无原生旁路                                | BLOCKED | 同 E01；另缺已登录 Desktop Electron 会话                                                                                                                                                                                                    |
| E03 | Desktop 本机运行            | 同一 ACP 宿主语义，不启动旧引擎                                       | BLOCKED | 缺真实 ACP harness CLI 与凭据；本机未见任何旧引擎被拉起（退役侧已由 RB01a/E16 覆盖）                                                                                                                                                        |
| E13 | 非流式 / 流式 Agent API     | 本 operation 输出正确；无旧 executeSync、无无穷轮询；topic 级串扰修复 | BLOCKED | 单元 / 集成测试覆盖（`execAgent.*.test.ts`）但非真实执行；缺真实 harness + LLM 凭据下的 live 运行                                                                                                                                           |
| E09 | 服务端 / 宿主 / 网络重连    | 订阅重建不重复 prompt；session 恢复按协商能力                         | BLOCKED | 缺真实长连接宿主场景；代码侧 `session/cancel`+resume 语义有单测（`acpAgentSession`/`heteroResume`）                                                                                                                                         |
| E20 | 第二 runtime / 节点 fixture | 不改 Chat/Task/CAID 核心即可接入；fixture 不进生产 registry           | PASS    | P18 `extensionContract.test.ts`：fake-peer 协议一致性（initialize/session/prompt/cancel）、adapter 注入不改核心、production registry 无 fake 键、`SandboxProvider` 假实现覆盖 provision/connect/cancel/cleanup/artifact 交接且类 union 封闭 |

## 3. 聊天闭环（保留能力）

| ID  | 场景                               | 通过标准                                                              | 状态    | 证据                                                                                                                                          |
| --- | ---------------------------------- | --------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 | 多轮 / 流式 / 持久化 / 错误 / 终态 | 消息归属与终态正确；断线≠完成                                         | BLOCKED | 需真实 LLM/harness 驱动完整会话；e2e cucumber 链存在但按纪律 mock LLM 不计入本行（本机未跑 e2e 服务器矩阵）                                   |
| C02 | 内置工具 + 外部 MCP+Connector      | 每工具 mounted/unsupported/unauthorized/failed 显式；必需失败禁止执行 | BLOCKED | P09 逐工具装配契约已由 `toolSurfaceAssembly` 测试覆盖（代码级）；真实 connector/MCP 握手未跑 —— 缺真实 connector 环境                         |
| C03 | 图片 / 多附件到执行目标            | 真到设备；不仅文件名                                                  | BLOCKED | 缺可达设备；`attachments` 打包上传 s3rver 链路本机可用但未走真实设备接收                                                                      |
| E10 | 审批 / 拒绝 / 撤权                 | 单次授权、作用域 + generation 绑定；观察者不可批准                    | BLOCKED | 需真实 ACP `session/request_permission` 往返；代码接线已证（P19 parity：`standardAcpSession` 处理 `request_permission`/`elicitation/create`） |
| E08 | 取消 / 设备失联                    | requested/confirmed/unknown 可区分；未确认不重启                      | BLOCKED | 真实失联场景缺设备；P18 fake-peer 证明 `interrupt`→`session/cancel`→close 序列；`cancelRequested` 语义有单测                                  |
| C04 | 重连 / 重新生成 / 线程 / 旧聊天    | 读历史不损坏；旧配置需显式 ACP 重绑定                                 | BLOCKED | 旧配置强制重绑定代码级已证（`heteroSessionBindingKey` 兼容读）；真实会话重连未跑                                                              |

## 4. 异步与群聊

| ID  | 场景                        | 通过标准                                             | 状态    | 证据                                                                                                                                                |
| --- | --------------------------- | ---------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| E05 | 两个改码 child 并行         | thread+worktree 双隔离；parent 按明确 child 结果收口 | BLOCKED | 服务侧双隔离 / 收口测试存在（P10/P14：`taskResultBridge`、`taskWorkspace` preflight/recovery）；真实双 child 并行执行缺 harness + 设备              |
| E06 | child 不结束 / 仍发心跳     | per-child 与 parent deadline 生效，不永久等待        | BLOCKED | watchdog/deadline 有单测（child-run 服务、advanceGoal waiting\_external 交棒 —— 本机 `goal.advance` 实测返回 `waiting_external`）；真实超时路径未跑 |
| E07 | callback 重复 / 乱序 / 迟到 | 去重；旧 generation 不回写；barrier 不提前完成       | BLOCKED | CAS / 去重有 `taskResultBridge` redis+model 测试；真实乱序注入未跑（无真实 worker）                                                                 |
| E11 | automation 关页后启动       | 不依赖 renderer；启动重验设备与权限                  | BLOCKED | server-persisted 投递已证（P10 doc + `taskResultBridge` 测试）；真实 automation 需 Hatchet/cron 环境与可达设备                                      |
| E04 | 重复点击 / ACK 丢失         | 同一 intent 单运行；unknown 不重发 writer            | BLOCKED | 意图去重（`pendingCreateLedger`/`dispatchAuthorization`）有测试；真实 ACK 丢失注入需真实 gateway                                                    |

## 5. CAID 调度与集成

| ID     | 场景                                  | 通过标准                                               | 状态    | 证据                                                                                                                                    |
| ------ | ------------------------------------- | ------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| CAID-1 | A/B/C/D 非屏障闭环                    | A 集成后 C 启动，B 仍运行；ready = 空≠Goal 完成        | BLOCKED | 依赖调度语义有 `decideNextMove`/`goal` 测试 + P13 锁内重验；真实四任务闭环需可执行目标（缺 harness / 设备）                             |
| CAID-2 | exact-head / 集成证据                 | 陈旧 head/base/PR/run 不解锁；skipped-only CI 不算通过 | BLOCKED | P15 集成序列化 /re-baseline + verify evidence 测试存在；真实 PR/CI 场景需真实 repo+CI 环境                                              |
| CAID-3 | 崩溃 / 重复事件 / ACK 丢失 / 租约过期 | 唯一活跃 owner；不双写                                 | BLOCKED | 声明锁、CAS 恢复、generation fencing（P16）有服务测试；真实崩溃注入需长运行 worker                                                      |
| E12    | Verify/repair 与完成门控              | Agent 自报完成≠Done；CI/review/ 证据门保留             | BLOCKED | 门控保留：`acceptance` 路由器存活 + `AcceptanceEvidenceManifest` 在 `builtinToolIdentifiers`（P19 parity 实测）；真实 verify 流程需 LLM |
| CAID-4 | 人类 Pause/Cancel/Reject              | 不被 Manager/scheduler 推翻；已集成不暗 revert         | BLOCKED | goal-stop fences（P16）服务测试存在；真实推翻对抗场景需运行中编排                                                                       |

## 6. Provider/Quota/ 品牌 / 数据

| ID       | 场景                               | 通过标准                                                                       | 状态    | 证据                                                                                                                                                                                                                       |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P06a-neg | Quota 控制面退役                   | 无切号 / 托管 OAuth / 池路由入口                                               | PASS    | 实机：控制面 `createAccount`/`switchAccount`/`selectAccountForAgent` 全部 `No procedure found`；观测面 `listAccounts`/`getWindows`/`getLatestReadings`/`listSnapshots`/`listUsageTurns` 存活；UI 为只读行（P06 diff）      |
| P06a-pos | Quota 观测身份归属                 | 绑定所选执行设备；unknown≠0 / 满                                               | PARTIAL | **缺口 F11**：本地无 `deviceId` 时 `QuotaMenu` 回退 `claude[0]`、ingest 失败后 `find(externalId) ?? claude[0]` 可能显示错误身份读数 —— 整改 R09                                                                            |
| P06b     | 无 quota 服务时聊天                | 授权 ACP 运行仍按策略启动                                                      | BLOCKED | quota 不进执行链已由退役证明（执行侧不再读 quota account env）；「仍按策略启动」的通过侧需真实 harness 运行                                                                                                                |
| E17      | 账号管理面退役                     | create/bind/switch/select/loads 入口全部不可用                                 | PASS    | 实机 404（见 E21 行）；P19 server guard 对九个退役 procedure 逐项锁定、对七个观测 procedure 锁定保留                                                                                                                       |
| E18      | 品牌全表面                         | 新装 / 升级、Web/Desktop、通知 / 分享 / 导出 / CLI 均 Orvilo；第三方归属不误伤 | BLOCKED | Web SPA HTML 实测 Orvilo 品牌零 lobehub（`210a63a3`）；桌面安装 / 升级、通知 / 分享 / 导出、CLI 全表面未实机跑 —— 缺安装包 / 升级通道                                                                                      |
| E19      | 数据升级与回滚                     | 迁移幂等可重复；不触碰外部官方应用 / CLI 数据                                  | PASS    | 本机 177 个迁移全部应用（0090/0093 pg\_search 按 marker 规则跳过 → FTS 缺席，已在 runbook §1 声明）；再跑 `init-dev-env.sh migrate` 为 no-op 幂等通过；本栈唯一迁移 `0176_task_topics_contract` 为 additive nullable jsonb |
| P05a-neg | 非主聊天模型调用审计（退役侧）     | 用户 keyVault/BYOK 直连入口退役；无隐藏 generateObject 后门                    | PASS    | P05 `provider-retirement.md` 逐消费者处置；`initModelRuntimeFromDB` 已删（P19 server guard 零命中）                                                                                                                        |
| P05a-pos | 保留的规划 / 评审 / 反思判断走 ACP | 后台 Agent 判断经授权 ACP 运行或显式批准的例外                                 | PARTIAL | **缺口 F10**：`AiGenerationService.generateObject` → `initModelRuntimeFromDeploymentConfig` 仍走部署级 PROVIDER\_API\_KEY/PROXY\_URL 直连；规划 / Verify judge 链未 ACP 化 —— 整改 R08（或维护者显式 ADR 裁决）            |

## 7. 发布判定硬条件（Q0 前置）

```text
旧 Lobe engine 可执行入口 = 0              ← 已证（#107 删除 + P19 无 import 守卫 + 实机无回退）
旧模型循环生产可达路径 = 0（源码 + 发布产物 + 条件注册均查） ← 源码/注册已证；发布产物待 E22 解锁
生产 registry 未实现/未验证能力 = 0        ← 已证（P18 production registry 守卫）
第一方品牌表面旧品牌残留 = 0（登记的第三方/归属/历史例外除外） ← 源码侧已证；全表面待 E18 解锁
Provider/account-pool 控制入口 = 0          ← 已证（实机 404 + P19 guard）
异步路径无丢失证据/取消/超时保障            ← 服务测试已证；真实链路待 §4 行解锁
保护功能有真实成功与拒绝用例                ← 拒绝用例已实机证明（bound-device 拒绝）；成功用例缺 harness
固定整合 SHA 的全部必需 CI 与 Q0 通过        ← 待固定 SHA + CI 绿（@hugeicons 上游修复前置）
整改 findings 全部收口（R01–R11）          ← F01–F12 未收口前 P21 保持 draft、不得合并发布
```

## 8. 验收纪律

- 真实 ACP/Preview 用例必须真机执行；环境缺位记 `BLOCKED` 并写明缺什么（设备、登录、runner、Vercel 限流等）。
- `Q0` 为只读独立验收，对固定组合 SHA 出证据矩阵，不接受 “测试全绿” 叙述代替行为证据。
- 回滚底线：退到最近 ACP-only 版本或暂停 CAID 新调度；**不以复活 Lobe engine 为回滚**。

## 9. 整改状态（F01–F12 → R01–R11）【历史记录 — R 轮冻结账】

> 本节是 R 轮整改时的快照；R01–R11 后续被 SA01–SA09、SB01–SB13 轮次接续整改并全部合入 `release/caid-remediation-integration`。行状态以 SB 轮终审裁决为准，本节不再更新，也不作为当前验收证明。

独立审查发现 12 项问题；完成定义按 `IMPLEMENTED / UNIT_OR_CONTRACT_TESTED / INTEGRATION_TESTED / LIVE_ACCEPTED / RELEASE_READY` 分级记录，互不相冒。

| Finding | 级别     | 整改        | 状态               | 摘要                                                                                                                                                                                                 |
| ------- | -------- | ----------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01     | P0       | R01         | 已实现，待合入门禁 | worktree 所有权归属须现证（`git worktree list --porcelain` + 注册表双证），归属不明→拒绝强删 / 回收；`同路径不同分支` 不再 force-remove，改停手报错                                                  |
| F02     | P1       | R01         | 已实现，待合入门禁 | 孤儿目录扫描比对注册表 + `git worktree list` 实况，未知目录进人工队列而非删除                                                                                                                        |
| F03     | P1       | R02         | 已实现，待合入门禁 | `withRepoRefLease` 拆分为短事务租约 + 事务外远程 I/O + owner fence 校验；`LeasedRepoRef` 合同记录持有者                                                                                              |
| F04     | P1       | R03         | 已实现，待合入门禁 | 外部 MCP/Connector 装配链已实现（`resolveExternalToolSurface` + `metadata.externalTools` + `heteroExecBuiltinTool` 回调经 `ToolExecutionService`），待合入门禁                                       |
| F05     | P1       | R03         | 已实现，待合入门禁 | `requiredToolIds` 准入已实现（部分失败即拒绝、`disableTools` 冲突显式拒绝、TaskRunner 传 `requiredToolIds`），待合入门禁                                                                             |
| F06     | P1       | R04         | 已实现，待合入门禁 | 终态白名单（非终态→pending）+ `event_outbox` 持久账本 + `awaitStartedAt` 死线→timeout 落 error + superseded 占位审计；消费 = await 结算 / 兼容 CAS win                                               |
| F07     | P1       | R06         | 已实现，待合入门禁 | `contract.content` 冻结指令 /verify/ 依赖回执并与 prompt 同源；续聊继承契约正文；`baseSha` 钉选（设备 post-add head / 远端预解析）+ `baseShaHistory`；`inputStale` 审计标记                          |
| F08     | P1       | R07         | 已实现，待合入门禁 | 按阶段独立失败预算（fetch-status/patch/merge 不再被首个成功清零）；merge-accepted reconcile 允许终态复核                                                                                             |
| F09     | P1       | R05         | 已实现，待合入门禁 | `startExecution` idle / 孤儿 metadata → `PRECONDITION_FAILED`、终态 → `CONFLICT`、不存在 → `NOT_FOUND`、running/parked → 幂等 `alreadyStarted`；`autoStart:false` 副作用前拒绝                       |
| F10     | P1       | R08         | 已实现             | 后台判断链（规划 / Verify / 反思）经 `runAcpJudgment` 授权 ACP 收口（PR #165，`refactor/acp-background-agent-judgments`，已并入集成分支）；无 binding 显式 `ACP_JUDGMENT_NO_BINDING`，不部署密钥兜底 |
| F11     | P2       | R09         | 已实现，待合入门禁 | 删除 `claude[0]` 身份兜底，观测键绑定执行节点 + runtime/profile + 已确认身份；契约见 `docs/development/quota-identity-observation.md`                                                                |
| F12     | 发布阻塞 | R00/R10/R11 | 部分收口           | 复合 PASS 已拆；`caid_dispatch` 服务端准入开关已上线（R10，默认关）；固定 SHA 正路径验收进行中（本文件 §10）                                                                                         |

- F09 → R05：修复已在 #158（`fix/execution-start-intent-contract`，draft）实现 —— `idle`/ 孤儿 metadata → `PRECONDITION_FAILED`，终态 → `CONFLICT`，不存在 → `NOT_FOUND`，`running`/parked → 幂等 `alreadyStarted:true`；`autoStart:false` 在任何副作用前拒绝（`BAD_REQUEST` / batch `results` 失败项）。合并门禁复核前保持 OPEN。

状态口径：本表 `OPEN` 表示整改 PR 未合入并通过门禁；各项收口后由 R11 在固定整合 SHA 上重跑对应回归行（`03-regression-matrix.md`）。

- F11 / R09：修复实现于本 PR（`fix/quota-identity-observation`）—— 删除 `claude[0]` 身份兜底，观测键绑定执行节点 + runtime/profile + 已确认身份；identity-binding 契约见 `docs/development/quota-identity-observation.md`。行状态待合并门禁通过后由 R11 收口。

## 10. R11 固定 SHA 验收（进行中）

**整合 SHA（终态冻结）**: `9ac1590283a319e68d27c7d1e2c4c8722a75b9ef` —— `release/caid-remediation-integration`（P00–P21 + R00–R11 + SA01–SA08 + SB01–SB13 + **SC01–SC07 整改**：`fix/sc-c02` `f375998a`/`4ab5d9a3`/`4f90c937`、`fix/sc-c01c03` `1cc9ba19`/`1aff676f`/`b32b6dc0`、`fix/sc-c04c05` `d69221cf`/`6f258c97`/`f76cd908`/`f79b2e8b`、`fix/sc-c06` `33ccd471`，PR #180 receipt FK + argsHash，`53eb73fa` judgment 追踪 cherry-pick + 收窄修复 `9ac15902`）合并进 `test/live-acp-caid-and-release-readiness`（合并 tip `d34c1293`，本节更正随文档提交）。合并树复核（@`9ac15902` 实测）：agentExecution + aiAgent + quota 摄取套件 **1100/1100 绿**（75 文件）；SC 批次触动的 18 个测试文件 **538 绿 1 skip**；`apps/server` 作用域 tsc = **302** 条 = 基线零新增；迁移 journal 0–183 连续且 `when` 严格递增（0182 fence\_seq + 0183 agent\_operation\_launches 共存）。

> 更正：本节此前冻结 `0b58f21c`；SC 批次当时未进入被审组合树，相关完成声明（含原「SC12」段落）属声明漂移，本节已按实测重写。

SA 轮新增回归：SA01 工作树认领 / 孤儿恢复、SA03 租约 unknown/fence/merge-intent、SA05 contract 链 + CAID claim 准入、SA06 durable 状态权威 + judgment 加固、SA07 quota 身份撤销 + principal/workspace 信任键、SA02/SA04 外部工具授权 pins + 子结果 ACK 账本（CI 修复含 jsonb coalesce 哨兵、`pins` 断言、judgment binding mock）。SA09 真机验收保持 BLOCKED（环境缺位）。

**SB 轮（第三轮终审）新增回归**：SB01 工作树认领物理身份（repo common-dir realpath + claim-pinned replay base + token-fenced cleanup，迁移 0181）、SB02 审批 receipt 范围哈希 + 纯 CAS 授权（P0）、SB03 审批续窗 windowId / 修订 CAS + grant epoch + receipt-before-notify、SB04 merge 三态判别（confirmed/rejected/unknown）、SB05 远程 fencing（remoteOperationId + expected-old ref 原子推送）、SB06 durable inbox 先于 ACK + 稳定 invocationId、SB07 首次准入唯一权威 deadline CAS、SB08 repair 读取冻结源合同 + 依赖 fail-closed、SB09 origin 持久化 + settlement grant + 终态准入复查、SB10 judgment 取消权威 + 总预算 AbortController、SB11 honest trace（no\_json/schema\_mismatch）+ 显式 slug、SB12 typecheckDiff 强制 envelope、SB13 迁移 journal 单调序修复（0179 fence\_seq）。另有基线修复：dep-blocked claim 回滚至 backlog + 手动完成视为有效 delivery（修复 cascade 回归）。

### 10.1 逐诊断 typecheck 对比（非总数免检）

> **以下 `cb02a617` 运行为 R11 时代历史记录（旧合并树）**，仅证明当时状态；当前冻结 SHA `9ac15902` 的 typecheck 对比以最新复跑结果为准（见本节末尾 SB/SC 更新）。

- 工具：`scripts/ci/typecheckDiff.mjs` —— 以 `file|code|完整多行消息` 为 bucket 做多重集合差（行 / 列不参与匹配，行号漂移不算新增）；任何 head 诊断无 base bucket 对应即硬新增。
- 已知修正：`pnpm type-check` 根脚本本地拒跑（`scripts/type-check.mjs` CI-only guard），脚本需 `CI=true`；作用域模式 `--scope apps/server` 走包内 `tsc --noEmit`。
- head（`cb02a617`，旧整合树，历史记录）`apps/server` 实测 **302** 条 = 既有基线；merge 期间发现并修复两处回归：merge 冲突误留 `providerBinding` re-export（模块已被 P05 删除）→ `0750d823` 移除；connectorOverlap 测试类型收窄 → `f8c88403`。
- **结果（历史运行，PASS\@cb02a617）**：base `origin/canary` = 309 条，head = 302 条；added keys 11（均为同文件行号漂移，base 中同 file+code 已存在）、removed 18、perFileCountDrift 1 个文件；**hard-new file+code = 0**。复跑：`node scripts/ci/typecheckDiff.mjs --base origin/canary --head HEAD --scope apps/server`（head 用 `--head-log` 复用日志）。
- **SB12 协议收紧**：诊断消息不再截断 300 字符、多行 continuation 参与 bucket 匹配；`--head-log` 只接受带强制 envelope 的采集产物（`--capture <file>` 生成：head SHA/tree SHA、dirty 状态 + 补丁哈希、exit/signal/completed、scope、node+pnpm+lockfile+tsconfig 指纹、日志 sha256）。envelope 缺失 / 篡改 / 脏树 / 指纹漂移均拒绝；live `--head` 必须等于当前 checkout 且工作树干净；豁免条目必须有非空 `reason` + 未过期 `expires`。
- **SB12 残留收口（SC07）—— 已并入被审组合树**：实现于 `fix/sc-c06` `33ccd471`（T3 合并 `2f7af894`）。file-less 全局诊断（`error TS5083:` 类无定位行）解析为 `<global>` 诊断参与 diff（CE07）；冒号格式 `file:l:c - error TS####:` 同样可解析；未被识别的 error/warning 类别行（非 TS code、`warning` 类别、无 code 的 `error:`、畸形 `error TS...` 无冒号）默认阻塞不再静默当 runner 噪声；`--head-log` 回放补回「非零退出 + 零可解析诊断 = 失败」（CE08）；`tc-tree-sha` 必须是 40-hex 且等于 `git rev-parse <head-sha>^{tree}`（CE09）；env 指纹增加 tsc/tsgo 版本与 tsconfig extends 链；live 采集前后校验 `HEAD^{tree}` + 干净工作树。回归测试 `scripts/ci/typecheckDiff.test.ts`（37 例，合并树 `9ac15902` 实测 37/37 绿）。
  - _更正记录：旧文写作「SC12 轮」并在代码未落地前给出能力完成声明 —— 属声明漂移；以上能力现已在 `9ac15902` 树上核验存在（脚本 + 测试均在场）。_

### 10.2 真机探针（dockerless：brew Postgres\@5432 + Redis\@6379 + s3rver\@29000，Next\@30953）

> 探针结果已于 **2026-09-20 在新冻结树 `9ac15902` 上重采**（合并 SC01–SC07 后的运行实例），下方各行即重采结果 —— 不再是 `0b58f21c` 时代数据。

| 探针                                                                                                      | 结果                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 退役面 `agentQuota.listManagedAccounts` / `createManagedAccount` / `aiChat.message` / `aiAgent.getAgents` | 全部 `404 NOT_FOUND`（路由已移除）                                                                                                                                                                                                                                                          |
| 保留面 `goal.list` / `agentQuota.ingestSnapshot`                                                          | 存在且认证门控（`goal.list` 匿名 401 / 带 `X-API-Key` 200 返回真实 payload；`ingestSnapshot` 匿名 401 / 带 key 400 —— mutation 可达且输入 schema 生效）                                                                                                                                     |
| `goal.submitPlan` 陈旧 token                                                                              | `409 CONFLICT "Stale planning input; no plan applied"` —— plan revision CAS 真实生效                                                                                                                                                                                                        |
| CAID 准入 OFF（默认）                                                                                     | `goal.tick` → `outcome: "waiting_external"` + 消息「CAID dispatch admission is disabled for this deployment/workspace」（回显 nodeId/taskId），任务保持 `backlog` 未被认领                                                                                                                  |
| CAID 准入 ON（`orvilo:runtime-config:feature-flags:published` 写 `{"caid_dispatch":true}`，5s 缓存后）    | `goal.tick` → 进入 `dispatchWork` → 条件 UPDATE 认领任务（`started_at` 落库）→ 派发执行 → 到达 agent-runtime 边界后诚实失败（本地无真实 agent runtime/webhook），任务落 `paused` + `Critical webhook delivery failed: task-on-complete` —— 证明门禁开启后真实走 orchestrated 派发而非假成功 |

- **e2e 已知基线失败（已对照确认，非本栈引入，亦非豁免 PASS）**：`Test Web App` 里 `agent-scroll.feature`「视口不应贴近聊天列表底部」失败（`scroll.steps.ts:364`，expected >320 /received 0）。canary 对照：canary push E2E run `35527292328`（canary @ `cb810785`，含 hugeicons 4.3.3 修复）与 `35518122478` 同一断言同一步骤同样失败（`scroll.steps.ts:364`，expected >320 /received 0，1/39 scenario），证实为 canary 同源基线缺陷（注：早前的 run `35526965367` 汇总虽 success 但 Test Web App job 实为 skipped，不作为覆盖证据）；本栈未触碰 `e2e/` 或聊天滚动代码。该行为确定性基线 FAIL，记 FAIL（基线），不登记为已获豁免的发布 PASS。

### 10.3 仍 BLOCKED 的行（环境缺位，不降级）

- 真实 ACP spawn / 设备派发（device-gateway `wss://device-gateway.aspectlylabs.com` 在本机不可达 → 设备只能 offline）
- 图像 / 附件真实往返（无真实 LLM key + S3 为本地 s3rver 模拟）
- ACK 丢失 / 服务崩溃 / 租约超时 / PR revision 移动 的**运行时**注入（单测已覆盖对应不变量；线上注入需要 Hatchet/agent-runtime 队列可用）

### 10.4 P21 删除前置（整合树复核）

- `@orvilo/agent-runtime` 活引用 = 0（仅 `retirementGuard.test.ts` / `contractBoundary.test.ts` 的字符串断言）
- `packages/agent-runtime/` 目录已物理删除（仅剩 `node_modules` 残留链接）
- 历史解码面保留：`historicalDecoderRegistry` + `createTraceDecoder` 在 `packages/heterogeneous-agents/src/registry.ts`
