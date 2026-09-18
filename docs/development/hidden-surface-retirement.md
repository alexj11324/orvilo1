# 隐藏产品面退役

> 本文件是「隐藏产品面退役」战役的**入口清点表与处置记录**。
> 产品边界与判据见 [product-scope.md](./product-scope.md)；更早一轮的收敛记录见 [task-first-rollout.md](./task-first-rollout.md)。

## 判据

**任何产品对象都必须有父对象。** 凡是能凭空造出无主对象（没有 task /run/project 归属）的入口，一律退役。

完成判据不是「导航里没有这个按钮」，而是：**从任意入口都无法恢复旧产品，且正式构建不携带其实现。**

## 与更早一轮的关系

`feat/task-first-convergence`（S00–S80）已合并，304 处删除全部落在 `src/`，**`apps/server/**` 与 `packages/**` 零删除**。
本战役**不重复**那一轮已完成的删除（`/image` `/video` 工作台、个人画像浏览层、独立评测工作台 `/eval`、
`/memory` 浏览层、成长曲线、分享海报），只处理清点表列出的剩余面。

## 清点表

「处置」列使用：`RETIRE`（退役入口与实现）/ `NEST`（下沉）/ `KEEP_SHARED`（共享能力保留）/
`KEEP_COMPAT`（兼容读取）/ `STOP_PRODUCER`（停独立生产）/ `NEEDS_TRACE`（依赖未确定，**不可直接删**）。

### 一、Acceptance / Verify

| ID    | 用途                         | 真实入口                                                                                                                                 | 父对象       | 前端消费者          | 后端消费者                       | 处置                 |
| ----- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------- | -------------------------------- | -------------------- |
| HS-01 | 独立验收工作台列表           | `apps/workbench/app/routes.ts:6-10`                                                                                                      | 无           | workbench 应用      | `acceptance.list` / `listPage`   | RETIRE               |
| HS-02 | 独立验收详情与检查详情       | `apps/workbench/app/routes.ts:8-9`                                                                                                       | 无           | workbench 应用      | `acceptance.getBundle`           | RETIRE               |
| HS-03 | 独立 Verify 运行列表与报告   | `apps/workbench/app/routes.ts:11-14`                                                                                                     | 无           | workbench 应用      | `verify.*`                       | RETIRE               |
| HS-04 | Web 独立验收集合与详情       | `src/spa/router/desktopRouter.config.tsx:33-69`                                                                                          | 无           | Acceptance 工作区   | 同上                             | RETIRE               |
| HS-05 | 移动端独立验收路由           | `src/spa/router/mobileRouter.config.tsx:544-561`                                                                                         | 无           | Mobile              | 同上                             | RETIRE               |
| HS-06 | 项目级验收模块               | `desktopRouter.shared.tsx:658-672`（经 `:884` 镜像到 `/:workspaceSlug`）                                                                 | project      | Projects/Acceptance | 同上                             | RETIRE               |
| HS-07 | 任务详情验收指标行           | `AgentTasks/AgentTaskDetail/TaskAcceptanceStateRow.tsx`                                                                                  | task         | 任务详情            | `acceptance.getBySubject`        | **KEEP**             |
| HS-08 | 验收 Portal 面板             | `Portal/router.tsx:35-36` → `Portal/Acceptance` → `features/Acceptance/Viewer`                                                           | task / run   | 任务详情、聊天      | 同上                             | **KEEP**             |
| HS-09 | 全局验收抽屉宿主             | `features/GlobalOverlays/AcceptancePortalDrawer.tsx`                                                                                     | 对象驱动     | 主布局              | —                                | **KEEP\_COMPAT**     |
| HS-10 | 聊天 Markdown 深链开验收     | `Conversation/Markdown/plugins/Link/internalLink.ts:6,11,129-134`、`InternalEntityLink.tsx:163-167`、`InternalEntityPreview.tsx:127-143` | acceptanceId | 会话                | `verify.getAcceptanceBundle`     | NEST（改指任务映射） |
| HS-11 | 无主对象的验收创建 / 发布    | `apps/server/src/routers/lambda/acceptance.ts` 的 `ensure` / `attachRun` /flow 系列                                                      | **无**       | —                   | 自调用                           | **STOP\_PRODUCER**   |
| HS-12 | `agent-testing` 独立报告来源 | `packages/const/src/verify.ts:96-103`                                                                                                    | 无           | —                   | agent-testing harness            | **STOP\_PRODUCER**   |
| HS-13 | 任务完成门控引擎             | `apps/server/src/services/verify/**`（67 文件 / 13,135 行）                                                                              | task / run   | —                   | `task.ts`、`CompletionLifecycle` | **KEEP\_SHARED**     |

**关键约束**：`AcceptanceService` 无唯一门面，被 6 个 router / 服务直接 `new`，任务终态判定经
`CompletionLifecycle.ts:1001` → `verify/lifecycle.ts:302` → `verify/settle.ts:89` → `statusService.ts:85`。
**任务门控不可拆**；HS-11/HS-12 必须在不触碰门控的前提下退役。

#### 一之二、Agent 侧入口（方案未列，补入）

| ID    | 用途                                                                                               | 真实入口                                                                                                                      | 父对象   | 前端消费者 | 后端消费者 | 处置                  |
| ----- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | ---------- | --------------------- |
| HS-14 | **Agent 提交验收证据的内置工具** `orvilo-acceptance-evidence`（`listCriteria` / `submitEvidence`） | `packages/builtin-tool-acceptance-evidence/**`，注册于 `packages/builtin-tools/src/identifiers.ts:37`、`index.ts:221,270-271` | **run**  | —          | 工具执行器 | **KEEP\_SHARED**      |
| HS-15 | 设置搜索索引里的技能页条目                                                                         | `src/features/SettingsSearch/items.ts:105,160`（`[SettingsTabs.Skill]` 关键词与 i18n key）                                    | settings | 设置搜索   | —          | RETIRE（随 Skill 页） |

> **HS-14 是本次核验中最重要的「不可删」判定。** 它的工具描述写明
> 「List the Acceptance criteria **of the run you are working in**」与
> 「Submit evidence produced by your work for one Acceptance criterion」——**它是 run-scoped 的**。
> 而任务完成门控有一道硬闸：声明了 `requiredEvidence` 的检查缺失证据即判 `uncertain` 并
> **hold 住交付**（`services/verify/executor.ts:250-287` 的 `runStructuralGate`）。
> **删除该工具会让任务永久无法通过完成门控。**
> 这是「不得对含 acceptance 的东西做一刀切」的具体反例，也是
> `product-scope.md`「直接删除…… 而没有消费者证据」禁令所防的情况。

### 二、Skill 产品链

| ID    | 用途                                                             | 真实入口                                                                                         | 父对象       | 前端消费者                                            | 后端消费者                  | 处置                                         |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------ | ----------------------------------------------------- | --------------------------- | -------------------------------------------- |
| HS-20 | 个人设置动态页（无字面路由，由 `:tab` 通配 + componentMap 渲染） | `desktopRouter.shared.tsx:851`                                                                   | settings     | `Settings/skill`                                      | —                           | RETIRE                                       |
| HS-21 | 工作区技能设置页                                                 | `desktopRouter.shared.tsx:908-915`                                                               | workspace    | `Settings/skill`                                      | —                           | RETIRE                                       |
| HS-22 | Connector 设置（**与 Skill 共用 `ToolSettings`**）               | `Settings/connector/index.tsx:3`、`routes/(main)/[workspaceSlug]/settings/connector/index.tsx:3` | settings     | `Settings/skill`                                      | —                           | **KEEP\_SHARED**（先解耦）                   |
| HS-23 | 技能创建 / 导入 / 更新 / 删除                                    | `apps/server/src/routers/lambda/agentSkills.ts`（7 个写 procedure）                              | 无           | `src/services/skill/index.ts`、CLI `skill.ts:249-259` | `importer.ts`、`skillModel` | RETIRE                                       |
| HS-24 | 技能市场                                                         | `apps/server/src/routers/lambda/market/skill.ts`（5 个只读 query）                               | 无           | 技能商店                                              | `marketService`             | RETIRE                                       |
| HS-25 | 技能商店 feature                                                 | `src/features/SkillStore/**`                                                                     | 无           | 设置页、聊天输入                                      | —                           | RETIRE                                       |
| HS-26 | `?skill=` 深链选择入口                                           | `Settings/skill/index.tsx:75-82`                                                                 | 无           | 消息 CTA                                              | —                           | RETIRE                                       |
| HS-27 | `AcceptanceSkill` 具名导出 + 拉取端点                            | `packages/builtin-skills/src/index.ts:30-46`、`lambda/verify.ts:69-71` `PULLABLE_SKILLS`         | 无           | —                                                     | 拉取端点                    | RETIRE                                       |
| HS-28 | `lh acceptance install/update` 分发链                            | `apps/cli/src/commands/acceptanceRun.ts:1062-1186`、`apps/cli/src/utils/skillWiring.ts:29-71`    | 无           | 外部 Agent harness                                    | —                           | RETIRE                                       |
| HS-29 | **无鉴权直出**的安装指南                                         | `public/acceptance/skill.md:29,44`（经 `src/libs/next/proxy/define-config.ts:74`）               | 无           | 公网任何人                                            | —                           | RETIRE                                       |
| HS-30 | 产品内任务提示词要求安装                                         | `packages/prompts/src/prompts/task/index.ts:789`、`index.test.ts:461`                            | task prompt  | Agent 运行时                                          | —                           | RETIRE                                       |
| HS-31 | 内置技能内容                                                     | `packages/builtin-skills/src/{task,artifacts,orvilo}/**`                                         | Agent 运行时 | 运行时注入                                            | —                           | **KEEP\_SHARED**（迁移任务约束后保留窄接口） |
| HS-32 | 开发仓库技能软链                                                 | `.agents/skills/acceptance` → `packages/builtin-skills/src/acceptance`（**符号链接**）           | 无           | 开发 Agent                                            | —                           | RETIRE                                       |

**Skill 面的真实宽度（预检结果，比方案描述更宽）**—— 以下都是 Skill 管理的消费者，不能只处理 `Settings/skill`：

| 位置                                           | 说明                                                     |
| ---------------------------------------------- | -------------------------------------------------------- |
| `src/features/AgentSkillStore/**`              | 另一个技能商店 feature                                   |
| `src/features/ChatInput/ActionBar/Tools/**`    | **聊天输入的工具菜单**（`index.tsx`、`useControls.tsx`） |
| `src/features/ProfileEditor/AgentTool.tsx`     | Agent 配置里的工具选择                                   |
| `src/features/MCPPluginDetail/Agents.tsx`      | MCP 插件详情里的 Agent 关联                              |
| `src/features/SettingsSearch/items.ts:105,160` | 设置搜索的技能页关键词与 i18n key                        |
| `src/features/Settings/connector/index.tsx`    | Connector 入口（**必须保留**，先解耦）                   |

**关键约束**：Connector 的解耦入口有 **2 个**，且 Connector 专属组件**物理住在 skill 目录内**
（`AgentConnectorItem.tsx`、`AgentConnectorUsage.tsx`、`McpSkillItem.tsx`、`EditCustomPlugin.tsx`、
`ComposioSkillItem.tsx`），`ToolDetailType` 把两者混在同一个联合类型里。**先解耦，再删除。**

### 三、评测

| ID    | 用途                                    | 真实入口                                           | 前端消费者                                                        | 后端消费者             | 处置             |
| ----- | --------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- | ---------------------- | ---------------- |
| HS-40 | `agentEval` 服务端                      | `lambda/index.ts:121`                              | 无                                                                | CLI `eval.ts`（30 处） | **KEEP\_SHARED** |
| HS-41 | `agentEvalExternal` 服务端              | `lambda/index.ts:122`                              | 无                                                                | CLI `eval.ts`（9 处）  | **KEEP\_SHARED** |
| HS-42 | `ragEval` 服务端                        | `lambda/index.ts:179`、`async/index.ts:14`         | **死代码**：`src/store/library/slices/ragEval/actions/*` 无调用者 | workflow               | 前端链路 RETIRE  |
| HS-43 | `agent-eval-run/*` workflow（8 子流程） | `apps/server/src/hatchet/workflowTasks.ts:413-436` | —                                                                 | 保留可达               | **KEEP\_SHARED** |

### 四、其他隐形页面

| ID     | 用途                              | 真实入口                                                                                         | 门控                                         | 处置                                                                                 |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| HS-50  | 自建 OAuth 应用控制台             | `Settings/oauth-apps/index.tsx`、`lambda/oauthApp.ts`（6 procedure）                             | lab flag `enableOAuthApps`（默认 false）     | RETIRE                                                                               |
| HS-51  | 登录 / GitHub / Linear / 设备认证 | better-auth、Market OAuth 代理、Linear PKCE、oidc-provider `defaultClients`                      | —                                            | **KEEP\_SHARED**（不依赖 `oauthApp` router）                                         |
| HS-52  | Referral 空壳设置页               | `business/client/BusinessSettingPages/Referral.tsx`（3 行 `() => null`）                         | `enableBusinessFeatures`                     | RETIRE 注册（**只退空页面；`business/client/ReferralProvider.tsx` 的推荐能力保留**） |
| HS-53  | Plans / Credits / Billing / Usage | `business/client/BusinessSettingPages/{Plans,Credits,Billing,Usage}.tsx`（各 3 行 `() => null`） | `enableBusinessFeatures`                     | **NEEDS\_TRACE —— 本轮不动**                                                         |
| HS-53b | 工作区业务插槽路由                | `routes/(main)/[workspaceSlug]/settings/{plans,usage,credits,billing,budget}/**`                 | 同上                                         | **NEEDS\_TRACE —— 本轮不动**（是私有业务 overlay 的注入点，本机验不了）              |
| HS-54  | 记忆工作区外壳                    | `routes/(main)/memory/_layout/**`（Nav 仅剩 search + preferences）                               | 注册表标 `tier: 'retired'` + `stillResolves` | NEST                                                                                 |
| HS-55  | 记忆数据管理                      | `routes/(main)/memory/preferences/**`                                                            | —                                            | **KEEP**（用户删除自有数据的唯一入口）                                               |
| HS-56  | Agent 规则与经验                  | `/agent/:aid/self-evolving/**`                                                                   | —                                            | **KEEP**（标题 i18n 仍是 "Self-evolving / 自进化"，属遗留未同步）                    |
| HS-57  | 内置浏览器 `orvilo-browser`       | `packages/builtin-tool-browser/**`、`package.json:262`                                           | 本地运行时 + 设备在线                        | **KEEP**（**未退役**；`feat/acp-P60-browser-use` 正在处理）                          |

## 文档侧残留（G03 一并处理）

| 位置                                          | 内容                                                         |
| --------------------------------------------- | ------------------------------------------------------------ |
| `docs/orchestrator-session-handoff.md:104`    | 要求把 `orvilo.aspectlylabs.com/acceptance/<id>` 链接补进 PR |
| `docs/orchestrator-workspace-plan.md`         | 提到 Acceptance                                              |
| `docs/usage/agent/gtd.mdx`                    | 用户向文档，提到 Acceptance                                  |
| `docs/assets/brand/orvilo/variants/README.md` | 品牌资产说明                                                 |

**已确认干净**：`src/app/`（Next 页面壳）、`tests/`、`scripts/`、`e2e/`（仅任务名称含 "acceptance" 一词，非引用退役面）、`apps/share/`、`apps/server/src/hatchet/`、`apps/server/src/router-hono/`。

## `apps/workbench` 的独立判定

删掉 acceptance /verify 路由之后，`apps/workbench/app/routes.ts` 只剩：

```
index                        → homeRedirect
agent/:aid/docs/:docId       → 与主应用重复（见下）
*                            → catchall
```

**但「路由重复」不等于「部署重复」，不能据此整包删除：**

| 事实                         | 证据                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 主应用已有同名路由           | `src/spa/router/desktopRouter.shared.tsx:196,204,212,215`（含 `_layout`），路由文件 `src/routes/(main)/agent/docs/**` |
| 两者复用**同一个组件**       | `apps/workbench/app/components/agentDocReader.client.tsx` → `@/features/AgentDocumentReader`                          |
| workbench 是**独立部署**     | `apps/workbench/package.json` 的 `deploy: bun scripts/deploy.ts`、`wrangler deploy`、`@cloudflare/vite-plugin`        |
| 部署在 push 到 canary 时触发 | `.github/workflows/deploy-workbench.yml`                                                                              |

**已判定（`src/libs/next/proxy/define-config.ts` 的 rewrite 谓词给出答案）**：

> Workbench is the **mobile** bundle's agent document reader. Desktop and Electron serve the same
> route from the main router, and the `/verify` tree it used to own unconditionally is retired,
> so the rewrite is **device-gated** on the one route it still owns.

即 workbench 是**移动端**的 Agent 文档阅读器 bundle。它既不是「桌面端的重复页面」，也不是公开分享站，而是一个**仍然活着的移动端部署**。

**结论**：只退役 acceptance /verify 路由与其专属文件；`agent/:aid/docs/:docId` 路由、应用本体与部署入口**保留**，并把 rewrite 从「无条件」改为**仅移动端命中**。

## 波次与状态

| 波次 | 内容                                                | 状态   |
| ---- | --------------------------------------------------- | ------ |
| A    | G00 清点（本文件）+ G01 能力决策源 + 开发指令修正   | 进行中 |
| B    | G02 Skill 全链 / G03 Acceptance 收敛 / G04 隐形页面 | 待办   |
| C    | G05 后台停止与历史收尾 + G06 防复活 CI 门禁         | 待办   |
| D    | G07 独立验证与整合                                  | 待办   |

## 协调点

- `feat/acp-P60-browser-use`（HEAD 同为 `a90c4aea`）正在处理内置浏览器 —— 防复活门禁**不得**按「browser 已退役」编写。
- `a90c4aea` 删除的 `apps/server/src/services/oauthDeviceFlow/**` 是 P50 的 provider 设备流，**不是** OAuth 应用退役。
- `task-first-rollout.md` §4 未解决项 #1 记录：与 `bbd6ead3` 存在**两套并行退役机制**，该文档自述无法在本分支内收敛。
- `@orvilo/builtin-skills` 为 `private: true`，不走 npm 分发；`packages/sdk/src/generated` 对退役面零命中。
- `lh acceptance install` 只写进程级 `cwd/.agents/skills/`；`~/.claude/skills` 与 `~/.codex/skills` 全仓**只有读路径，无写路径**。
