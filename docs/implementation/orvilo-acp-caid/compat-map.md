# P00 — 兼容与改名映射（compat-map）

> 每条映射必须带 `kind / old / new / owner / justification / expiry`。
> 旧入口只可读取迁移说明或历史记录；不得借兼容层重新开启旧执行器。
> 兼容层的明确禁令：不含旧执行器、不恢复退役 Provider、不让两名 MCP server 同时注册、
> 不把旧 alias 映射到未来自研 Harness。

## 1. 代码符号改名（第一方）

| kind       | old                                                    | new                                                                                                                  | owner    | justification                        | expiry                      |
| ---------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------ | --------------------------- |
| package    | `@orvilo/agent-runtime`（types/transport/utils/audit） | 迁入 `@orvilo/types/src/agentExecution` 或明确 contracts 子路径；包删除                                              | C0 + P01 | 消除旧引擎树残留依赖                 | P21 物理删除                |
| type       | `AgentState`（整包快照）                               | 拆分为运行事实契约 + `LegacyAgentStateSnapshot` decoder                                                              | P01      | 引擎私有字段不再当 ACP 权威          | snapshot 读取限期           |
| service    | `AgentRuntimeService` 门面                             | `services/agentExecution/{OperationStatusService,InterventionService,ChildRunService}` + 复用 CompletionLifecycle 等 | P02      | 按职责归并                           | 门面 procedure 限期转发     |
| type       | `LobeChatProps`/`LobeHubProps`（`ProductLogo/*`）      | `OrviloLogoProps`/`ProductLogoProps` 自有定义                                                                        | P03      | 第一方品牌类型不依附第三方品牌 props | 立即                        |
| wire/proc  | `aiAgent.startExecution`                               | `startRun` 语义或明确退役错误（queued-intent 迁移期内保留 shape）                                                    | RB01/P05 | 消灭 “接口成功实际没启动”            | P05 前决定                  |
| MCP name   | `lobe_cc`                                              | `orvilo_cc`                                                                                                          | P04      | 宿主 per-run MCP 命名统一            | 已存 session 工具名限期双读 |
| clientInfo | `title:'LobeHub'`                                      | `title:'Orvilo'`（standardAcpSession）                                                                               | P03      | ACP 握手自报第一方身份               | 立即                        |
| CLI        | `lh` bin                                               | `orvilo` 规范名，`lh` 限期转发（退役命令→退役错误）                                                                  | P03/P04  | 旧客户端升级窗口                     | 版本窗口由 P04 定           |
| state      | `waiting_for_async_tool`                               | 业务状态 × 等待原因 ×ACP session 三分                                                                                | P10      | 等待对象不一定是子 Agent             | 历史值永久可解码            |

## 2. 持久化标识（P04 迁移表，不得全文替换）

| kind                                       | old                                    | new      | 规则                                                     |
| ------------------------------------------ | -------------------------------------- | -------- | -------------------------------------------------------- |
| app/bundle/URL scheme/deep link            | lobe\* 系列（以 desktop 配置实查为准） | orvilo\* | PKCE/state 校验后限期映射；不开放任意跳转                |
| userData/Keychain service                  | lobe 前缀（实查）                      | orvilo   | 幂等迁移 + 备份；不得扫描用户另装的官方 LobeHub/CLI 数据 |
| localStorage/IndexedDB/CLI 配置路径        | 旧键                                   | 新键     | 双读单写，截止版本明确                                   |
| DB slug / 记录 ID/tool identifier/i18n key | 旧值                                   | 新值     | 迁移表 + 别名显示；历史内容不改写                        |
| 事件 wire 名（`agent_runtime_end` 等）     | 现名                                   | 中性名   | 先保兼容，协议版本化迁移                                 |
| Electron appId / 更新 channel / 签名身份   | 现值                                   | orvilo   | 只使用已核实归属且已配置的值；缺失即阻塞发布，不猜域名   |

## 3. 第三方与历史例外（精确白名单，非目录豁免）

| 类别        | 对象                                                                                            | 规则                                                      |
| ----------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| npm 包      | `@lobehub/{ui,icons,editor,charts,i18n-cli,lint,seo-cli,tts,analytics,market-sdk,market-types}` | 保留真实包名与版本；退役面依赖在消费者迁走后删除          |
| 许可 / 归属 | 根 `LICENSE`（Apache-2.0）、NOTICE、copyright、第三方 notices                                   | 保留真实主体；不把 upstream 署名改成 Orvilo               |
| 历史        | 用户消息、旧 Agent 输出、审计、历史 PR/docs                                                     | 不做全库字符串替换；显示层可用解析别名                    |
| decoder     | `cursor` legacy adapter、`claude-code-sdk` 适配器、旧 JSONL 轨迹解析                            | `HistoricalTraceDecoderRegistry` 精确路径；不出现启动能力 |

## 4. 兼容层红线

- 禁止 `ENABLE_LEGACY_*`、Labs flag、旧 API key 配置、desktop-only 路径复活旧模型循环。
- 无 ACP bridge 时不得悄悄走 `codex exec`/Claude SDK；**bridge 内部用上流 SDK 是合法实现细节**。
- 旧 Provider alias 不得映射到未来 Harness，不得用旧密钥替外部 CLI 登录。
- 未知 endpoint 保持未配置 / 明确阻塞，不回退 Lobe 云服务，不臆造域名。
