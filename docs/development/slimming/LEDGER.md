# Slimming 02 — 产品边界冻结 + KEEP/DELETE ledger

> 本文件冻结 Repository Slimming 的产品边界与处置决策。
> 数据面真相由 `scripts/slimming/boundary.json` + `node scripts/slimming/census.mjs` 生成的
> `docs/development/slimming/census.json` / `CENSUS.md` 承载；本文件是决策理由与流程规则。
> 基线：`release/caid-remediation-integration`（ACP/CAID integration tree 最新状态）。
>
> 词表映射（沿用 P00 inventory，不重造分类）：`RETIRE`→DELETE、`KEEP_SHARED`/`THIRD_PARTY`/`KEEP`→KEEP、
> `REPLACE`/`RENAME`→REWRITE\_FOR\_ACP、`DEFER`/`NEEDS_TRACE`→INVESTIGATE。

## 1. 冻结边界（KEEP 词表）

以下能力为产品边界内成员，**不因包名 / 目录名触发删除审查**：

| 能力域                                               | 范围                                                                                               | census id                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------- |
| Workspace / Teams / Projects / Members / Permissions | 工作区、成员、权限、资源转移                                                                       | `workspace`                       |
| Tasks / graph / dispatch / review / automations      | goal→plan→dispatch→verify→review 全链路与 CAID 锚点（P00 §Q）                                      | `tasks-caid`                      |
| Agent identity + ACP harness binding                 | heterogeneous-agents registry、agent-execution、agent-manager-runtime、mecha                       | `acp-execution`                   |
| Gateway / Device control                             | agent-gateway-client、device-gateway、device-control、desktop-bridge                               | `acp-execution`                   |
| Collaboration / presence / shared conversations      | collaboration-gateway、share host                                                                  | `collaboration`                   |
| GitHub / Linear integration                          | connector/linearSync/repository routers 与 services、Connectors UI                                 | `github-linear-integration`       |
| Conversation / activity UI                           | Conversation/ChatInput/activity/intervention 展示面（见 §3 REWRITE）                               | `conversation-surface`            |
| Auth / DB / storage / observability                  | better-auth/OIDC、credential vault、database/trpc/types/utils                                      | `auth-infra` / `data-infra`       |
| Harness-native agent tools                           | builtin-tool-\* / builtin-skills / builtin-agents、editor-runtime、web-crawler、python-interpreter | `agent-tools`                     |
| Documents / Pages                                    | AgentDocument\*、PageEditor、Portal、ResourceManager                                               | `documents-pages`                 |
| Desktop / mobile / share hosts                       | apps/desktop、apps/workbench、apps/share                                                           | `desktop-mobile-shell`            |
| Data portability                                     | DataImporter、importer/exporter                                                                    | `data-portability`                |
| Model-runtime 相邻包                                 | `context-engine`/`prompts`/`model-bank` —— 任务 / 评审仍在消费的 prompt 文本与类型                 | `model-runtime-adjacent-packages` |
| Eval 面                                              | `agentEval*`/`ragEval` routers、`workflows/agentEvalRun`、`eval-dataset-parser` 保留               | `eval-surface`                    |
| Market 服务层                                        | `services/market` 中 retained tool-install/connector 管道（skill storefront 面已随 ORV-104 删除）  | `market-service`                  |
| Knowledge base / RAG                                 | knowledge/knowledgeBase lambda、chunk/KB-access 服务、KB server runtime（ORV-114 裁决：边界内）    | `knowledge-context`               |
| File ingestion                                       | `packages/file-loaders` —— Document/local-file-shell/OpenAPI file service 的解析管道（ORV-114）    | `file-ingestion`                  |

## 2. DELETE 决策（附依赖闭包状态）

每项 DELETE 的闭包工作清单由 census 的 `inbound.unexplained` 输出给出 —— 列表清零即闭包完成。

| capability                 | 语义                                                                  | 主要面                                                                                                                                                                                    | 状态快照（census）                                            |
| -------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `provider-byok`            | 用户自管 LLM Provider / BYOK /baseURL/model selection                 | `aiProvider`/`aiModel` lambda、`ModelSwitchPanel`/`ModelSelect`、provider settings routes、desktop providerBinding\*                                                                      | 89 files / 19 未解释入边                                      |
| `legacy-model-runtime`     | Lobe 自有的 model/agent runtime 残余                                  | `packages/model-runtime`（441 files 大头）、`webapi/chat/[provider]`、ModelRuntime module                                                                                                 | 441 files / 45 未解释入边                                     |
| `acceptance-surface`       | 独立 Acceptance 产品面（第二状态机）                                  | `src/features/Acceptance`（162 files）、`acceptance`/`acceptanceComment` lambda、verify/acceptance\* 服务                                                                                 | 175 files / 33 未解释入边                                     |
| `skill-store`              | Orvilo-owned skill 市场 / 分发                                        | `AgentSkillStore`、`AgentMarketSubmission`、`market`/`plugin`/`klavis`/`composio`/`agentSkills` routers、`src/app/(backend)/market`、agent profile store、`builtin-tool-skill-maintainer` | 40 files / 17 未解释入边                                      |
| `messenger-im-adapters`    | 非核心 IM 适配（feishu/wechat/qq/line/imessage/telegram/discord bot） | `chat-adapter-*`、`services/messenger`、`services/bot`、`features/Messenger`、settings/messenger、router-hono agent bot/messenger handlers                                                | 324 files / 29 未解释入边                                     |
| `comfyui-image-generation` | ComfyUI / ArtworkStudio / Orvilo 自有图像生成后端                     | `comfyui` router、`services/comfyui`、`ArtworkStudio`/`AgentArtworkStudio`/`AgentProfileArtwork`、`builtin-tool-image-generation`                                                         | 114 files / 12 未解释入边                                     |
| `achaos-chaos-toolkit`     | 独立 chaos engineering 子系统（Goal/Evals 愿景消费者均无真实引用）    | `packages/achaos/{core,database,process,runtime,runner,testing,tracing}` 七个 workspace 包 + `.agents/chaos` fixtures/docs                                                                | 32 files / 0 入边 → ORV-115 已物理删除，cap 转为 DELETE guard |

**通用 credential 基础设施豁免**：connector 所需的 OAuth、凭据 vault、webhook ingress、API-key 规则
（`TRPC_NAMESPACE_API_KEY_RULES`）属于 KEEP—— 删除项只针对 LLM-provider 专属抽象与上述产品面。

**messenger 接缝**：`BotCallbackService` 被 `taskResultBridge` 与 `workflows/onCreatorComplete` 调用
（任务完成→外部 bot 通知）。该投递链路属 IM 适配语义，随本项删除；若 GitHub/Linear connector 侧也复用它，
ORV-105 须先把那部分投递逻辑迁出。

## 3. REWRITE\_FOR\_ACP（保留能力、改换地基）

| capability             | 决策                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversation-surface` | Conversation 不拥有 prompt/model/provider/tool-loop 执行；UI → messages + task context + tool/activity 渲染 + intervention → ACP session/gateway（ORV-107）。Web/Desktop 共享 domain behavior。`src/store/aiInfra` 与 `useModel*` capability hooks 归入本项 —— 它们被 ChatInput/AgentManagerRuntime 活消费，须改写为 agent capability 来源而非 provider 模型表，随 ORV-107 一并落地。 |
| `openapi-api`          | 外部 REST/Responses API 保留为受支持面，但 Responses 语义须按 ACP operation 生命周期收口（P00 §H 遗留：非流式等本 operation 终态、输出归属绑定 operationId）。                                                                                                                                                                                                                        |

## 4. INVESTIGATE

**当前为空。** Gate D（ORV-114/115/116）已结清所有遗留项：

- `model-runtime-adjacent-packages` —— ORV-110 复核为 KEEP（任务 / 评审活消费；详见 census reason）。
- `market-service` —— ORV-110 复核为 KEEP（tool-install/connector 管道活消费；storefront 面已删）。
- `eval-surface` —— ORV-110 复核为 KEEP（ragEval/agentEval 为保留面）。
- `knowledge-rag` —— ORV-114 裁决为 KEEP，拆为 `knowledge-context`（KB/chunk/RAG 管道）与 `file-ingestion`（file-loaders）；ASR router 归 `conversation-surface`（唯一消费者是 ChatInput Dictation）；`DataImporter` 专属 `data-portability`，8 个 disposition 冲突清零。
- `misc-adjacent-packages`（`packages/achaos`）—— ORV-115 裁决 DELETE：七个 workspace 包零入边、Goal/Evals 消费者仅愿景性文档，已物理删除并转 DELETE guard。

任何新的 INVESTIGATE 项须仍带 owner + 证据 + follow-up，且 ORV-116 的 strict `--check` 会对其 fail-closed。

## 5. 删除纪律（全体 DELETE 项共用）

1. 不按目录名删：route/UI → store → API → service → package → schema/migration → locale → test → docs/config 全链闭包。
2. 生产迁移不做 destructive rewrite；已部署 schema 用 forward migration /tombstone/compatibility reader。
3. 仍以共享 primitive 为生的消费者先迁出再删（ORV-102 对 model-runtime 的硬约束）。
4. `census.mjs --check` 对该 capability 报零未解释入边 = 闭包完成的最低证据。

## 6. 与前置项目的关系

ACP Harness 退役 + CAID 工程化（P00–P21 / R / SA / SB / SC）已完成第一大刀：
`agent-runtime` 包已物理删除（P21）、旧服务端引擎已删（P70d）、quota 控制面已退役（P06）、
Provider 产品面已退役（P05）。本 ledger 只对残余收口，不重新做那套迁移。
