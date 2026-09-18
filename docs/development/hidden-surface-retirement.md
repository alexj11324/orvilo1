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

## 交付记录

提交：`929106de 🔥 refactor(product)!: retire standalone acceptance/verify and the platform skill chain`
基线：`origin/canary@a90c4aea`　规模：**367 文件，+3,890 / −30,224 行（净 −26,334）**，其中 193 删除 / 12 重命名。

| 工作包              | 内容                                                                                                                       | 规模                     | 验证                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------- |
| 开发指令            | `AGENTS.md`、`.agents/skills/pr/SKILL.md`、`.github/PULL_REQUEST_TEMPLATE.md`、`testing-heterogeneous-agents`              | 5 文件                   | lint clean             |
| G01 能力决策源      | `packages/app-config/src/routes/settings.ts`（34 tab 全覆盖）+ 三处侧栏 + 工作区别名派生                                   | 7 新 / 7 改              | 独立复核 18 tests      |
| G02 Skill 全链      | Connector 解耦（`Settings/connector/**` 新 14 文件）+ 技能设置 / 商店 / 编辑 / 市场 / CLI / 内置工具包                     | 净删 11,669 行 / 94 文件 | 56 files · 474 tests   |
| G03 Acceptance 全链 | 独立平台 + AcceptanceSkill 分发链                                                                                          | 91 文件 / 11,368 行      | 56 files · 474 tests   |
| G04 隐形页面        | 自建 OAuth 应用控制台 + Referral 空壳页                                                                                    | 14 删 / 13 改            | 含 2 新回归门          |
| G06 结构门禁        | 跨包**双向**门禁（退役面不得复活 / 保留面不得消失）                                                                        | 1 新                     | 10 passed，**已证伪**  |
| C0 接线             | `componentMap{,.desktop}`、`lambda/index.ts`、CLI `program.ts`、三处侧栏、`WORKSPACE_SETTINGS_ALIASES`、`proxy.ts` matcher | 16 文件                  | lint clean · 71 passed |

**提交后复跑**：16 个门禁文件 / **249 tests passed**（lint-staged 的格式化未破坏任何东西）。

### G07 独立复核后的修正（第二轮）

独立复核给出 `REQUEST CHANGES`，6 项缺陷。**共同形状**：删掉了页面 / 行为，但它的**入口**和**消费者**活了下来 —— 这正是本次要消灭的那类残留，只是发生在自己身上。

| 编号 | 缺陷                                                                                           | 修法                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| D1   | 项目验收页删了 UI，`Sidebar.tsx` / `ProjectDashboard.tsx` 仍 `import getProjectAcceptancePath` | 连同已无用的 `ClipboardCheckIcon` / `TriangleAlertIcon` 一并删除（会直接编译失败）              |
| D2   | `buildRepairPrompt` 仍在教用户跑已退役的 `lh acceptance feedback / run`                        | 改为指向应用内验收面板 + `orvilo-acceptance-evidence` 工具（`listCriteria` / `submitEvidence`） |
| D3   | 命令面板与侧栏页脚仍能点进 `/settings/referral`                                                | 删条目；`Footer` 里随之失去唯一消费者的 `enableBusinessFeatures` 订阅与 memo 依赖一并清除       |
| D4   | 技能门禁用 `existsSync`，跟随后解析符号链接，悬空 `.agents/skills` 链接读作「不存在」          | 改用 `lstatSync(..., { throwIfNoEntry: false })`                                                |
| D5   | 设置搜索索引仍留着退役 tab 的 keyword 映射与 item                                              | 删 4 个映射 + 5 条 item，并把门禁扩到 `OAuthApps` / `Referral`（原先只覆盖 `Skill`）            |
| D6   | workbench 的 description 仍从 `verify` i18n 命名空间读取，宣传已退役的平台                     | 改为静态文案（`noindex, nofollow` 标签，但过期文案仍不该发）                                    |

**`enableOAuthApps`（D6 的另一半）判定为不做**：`packages/types` / `packages/const` 的偏好位保持不动，理由见「判定为不做」表的兼容性条目。

**门禁在第二轮又抓到 1 处复核没发现的真缺陷**：
`src/routes/(mobile)/me/settings/features/useCategory.tsx:102` 把 Referral 行**写在 `offered(SettingsTabs.Plans)` 分支内部**，而不是走自己的 `offered()` 门 —— 所以能力注册表把它标成 `retired` 也拦不住它。同一处的 `src/routes/(mobile)/settings/_layout/Header.tsx` 还给它留着标题映射。
**移动端测试把坏状态写成了正向断言**（`arrayContaining([... SettingsTabs.Referral])`），等于把它固化。

三处已删，并新增门禁「每个退役 tab 不得出现在任一设置侧栏（双壳层）」。
**已证伪**：还原含 Referral 的移动端文件后，门禁转红并点名文件与 tab；改回后 10 passed。

### 全仓类型检查（第三轮，判据 3 的硬证据）

方案判据 3 是「正式构建不携带其实现」。**这道判据由 CI 裁决，不在本机跑。**

本机跑不出可信结论，三个原因叠在一起：

- `bun run type-check` 的包装脚本在非 CI 下**故意** `exit 1`。
- 绕过它直接调编译器（`bunx tsgo --noEmit`）会**被 SIGKILL，退出码 137、日志为空** —— 而空日志与「跑完且无错误」**完全同形**。本轮就因此产生过一次假的「0 错误」读数（`rg -c "error TS"` 对空文件返回 0）。
- 包自身的 `type-check` 同样不可用：workbench 的 `exclude` **覆盖**而非合并根配置，把 `apps/desktop/**` 拉进来后报 295 个既有错误。

所以本机已加 hook（`~/.claude/hooks/block-local-full-typecheck.py`，带 25 例行为测试）**直接拦掉**这些调用，并把请求指向 CI。

**权威来源**是 `.github/workflows/test.yml` 的 `Typecheck` job，每次 push / PR 都跑。裁决以它为准。

> 唯一一次完整跑完（约 22 分钟、峰值 RSS ≈ 640MB）确实抓到了下面 3 个错误，但那是并发极少时的运气，不是可复现条件 —— 同一命令随后连续两次 137。**别把「有一次跑成了」当成「本机能跑」。**

**结论：`929106de` 当时有 3 个类型错误 —— 也就是说那个提交的正式构建根本编译不过。**
249 个测试与 lint 全绿都没发现，原因分别是：vitest 不做类型检查；lint 的 `no-unused-vars` 只看「定义了没用」，不看「用了没有」。
**这是本次唯一一个 lint 与测试都无法覆盖的缺陷类别，只能靠类型检查兜住。**

| 文件                                                    | 错误                                                                                                                              | 归属                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `Settings/connector/features/ConnectorList.tsx:408`     | `Cannot find name 'getComposioServerByIdentifier'` —— 解析器定义在 145–332 的 `useMemo` **回调内**，而该 JSX 在组件体里，看不到它 | **本波次新增文件**     |
| `packages/app-config/src/routes/settings.test.ts:15,34` | `enableOAuthApps` 已不属于 `SettingsCapabilityContext`                                                                            | 本波次（G01 删该字段） |
| `Settings/hooks/useSettingsCapability.test.ts:36`       | `Provider` 的 `children` 是必需 prop，`createElement` 的 children 实参重载不匹配                                                  | 本波次                 |

修法：把 `getComposioServerByIdentifier` 提升为组件级 `useCallback`，与紧邻的 `getOrviloSkillServerByProvider` 对称（并相应替换 memo 依赖项）；其余两处按其类型契约改。

**修后验证**：本机那次完整跑（rebase 前）报告 0 错误 —— 并用探针证伪过快轮结论（往 `src/` 与 `packages/` 各注入一个 `const x: number = "s"`，两次都被精确捕获为 `TS2322`，文件与行号正确）。**rebase 到最新 `canary` 之后的确认由本 PR 的 `Typecheck` job 给出**，不再依赖本机。

> 注：`ConnectorList.tsx:408` 那条一旦触发就是运行时的 `ReferenceError`，但该分支没有测试覆盖 —— 单测绿并不代表这条路径可达。

**覆盖范围的两处例外，必须单独说清**（否则「0 错误」会被读成覆盖了全部改动）：

| 范围                    | 是否被根 `tsgo --noEmit` 覆盖           | 结论                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/**`、`packages/**` | 是（探针实测）                          | **0 错误**                                                                                                                                                                                                                                                                                                                                                           |
| `apps/workbench/**`     | **否**（在根 tsconfig 的 `exclude` 里） | 其自身 `type-check`（`tsc --noEmit`）报 **295 个错误，但全部是既有问题**：该包的 `exclude: ["node_modules"]` **覆盖而非合并**根的 exclude，于是把 `apps/desktop/**` 也拉进来（255 条是 `Cannot find module 'electron'` 一类）。改为 `exclude` 继承根配置才可用，属于既有配置问题，不在本波次范围。**本次改的 `app/lib/seo.ts` 与 `app/root.tsx` 在其中报错数为 0。** |

### CI 抓到的第 4 轮缺陷：既有套件断言了被退役的工具

`Test App (shard 2/2)` 在 `aae497ff` 上报 **1 failed / 5862 passed**，唯一失败是
`src/features/ProfileEditor/AgentUserTools/UserToolsSection.test.tsx` 的
「does not count pinned Skill Store in auto activation mode」：期望 `· 0`，实得 `· 1`。

**机制**：`isProfileConfigurableBuiltinTool`（`src/store/tool/slices/builtin/selectors.ts:91`）
的判据是 `alwaysOnToolIds` 与 `manualModeExcludeToolIds`。canary 上 `orvilo-skill-store`
**同时在这两个表里**，所以 auto 模式不计入、manual 模式计入 —— 这两条测试正是拿它当样例。
G02 删该工具时把两处也删了，于是 auto 模式下它变成「可配置」而被计入。

**注意这个失败的另一半**：manual 那条**仍然通过**（删除后它也变成「可配置」，恰好也是 1）。
也就是说**一半的红是巧合式的绿**，只看「有没有红」会漏掉这一层。

**修法**：样例换成 `orvilo-activator`（同样同时在两个表里），并加一条自检断言
`alwaysOnToolIds` / `manualModeExcludeToolIds` 必须包含该样例 —— 以后样例再被退役会**先**报
`expected [...] to include '<id>'`，而不是让人对着计数不符去猜。已证伪：换回
`orvilo-skill-store` 时自检立即转红并点名。

**同一类的第二、三处**（前一处修完、CI 才暴露下一处，所以改成一次扫完）：

- `src/features/ChatInput/ActionBar/Token/utils.test.ts` —— 断言 `getToolExcludeDefaultToolIds('manual')` 含
  `['orvilo-activator', 'orvilo-skill-store']`。改为与该函数实际返回的真实常量
  `manualModeExcludeToolIds` 比对，并补一条非空断言（否则常量被清空时等价断言会空洞通过）。
- `src/features/DevPanel/RenderGallery/fixtures/orvilo-skill-store.ts` —— 渲染画廊里该工具的 fixture。
  画廊的 manifest 来自 `builtinTools` 注册表，工具已不在表里 → 该 fixture **不可达**，连同导入与注册项一并删除。

**收尾方式改了**：不再等 CI 逐个暴露，而是**先扫出所有断言这几张表的文件**
（`alwaysOnToolIds` / `manualModeExcludeToolIds` / `defaultToolIds` / `activationModeControlledToolIds`），
确认「引用这些表 **且** 仍提及 skill-store」的集合为空之后才推。
本机复跑相关 5 个测试文件 / 84 用例全绿。

> 这与「判定为不做」表里 `orvilo-skill-store` 的 `NEEDS_TRACE` **不矛盾**：留的是**私有 overlay 可能提供**该工具这一事实（运行时按 manifest 条件启用），
> 而**开源树自身的构建里它已不存在**，所以内置注册表、`alwaysOnToolIds`、渲染画廊这些**本仓自己的表**里不应再留着它，测试也不该再拿它当样例。
>
> **后续（第五轮）**：该 `NEEDS_TRACE` 已被推翻并删除，理由与范围见下文「第五轮：skill-store 残留清理」。上表该行保留原文以便对照，但**结论已作废**。

### 判定为「不做」并附理由

| 项                                                                | 理由                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/workbench` 整包                                             | `@/features/AgentDocumentReader` 全仓**只有 workbench 在用**；主应用桌面路由用的是**另一个**组件 `AgentDocumentPage`；**`mobileRouter.config.tsx` 零 `docs` 路由**—— 移动端读 Agent 文档只有这一条路。迁移前置未满足，整包与部署入口保留，只退役其 acceptance/verify 路由并把 rewrite 改为设备门控。                                                                                                                                                                                                                                                                                                                                                                 |
| `Plans` / `Credits` / `Billing` / `Usage` 及工作区同名插槽        | `NEEDS_TRACE`。10 多个工作区路由引用 `BusinessSettingPages`，那是**私有业务 overlay 的注入点**，本机验不了。不得以开源默认为空推定线上为空。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `ragEval` 前端死链                                                | `NEEDS_TRACE`。`src/store/library/slices/ragEval/**` 无调用者，但它挂在 `library` store 上对外暴露，**下游私有 overlay 可能调用**。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/memory` 外壳                                                    | 实质部分已由上一轮完成（导航项 `tier: 'retired'`，`/memory/preferences` 作为 `stillResolves` 的数据管理入口保留）。「移走外壳」意味着给偏好管理器换路由 —— 用户可见的导航变更，且方案自己警告「不得删除用户唯一的数据管理路径」，本机无法做浏览器级验证。                                                                                                                                                                                                                                                                                                                                                                                                            |
| `orvilo-browser`                                                  | **未退役**，仍在发布包中。`feat/acp-P60-browser-use` 正在处理。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `verify` router 的 14 个零引用 procedure                          | `createRun`/`listRuns` 被 `agentEval` 用、`upsertReport` 被引擎 `reporter.ts` 用、`ingestResult` 被 hetero ingest 测试用。删它们会波及引擎与 eval 包。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `AcceptanceService.attachRun`、`filterManageableAcceptances`      | router 包装删除后已无生产调用者，只剩测试。但两者都在共享门控引擎内，删除应走门控评审。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `orvilo-skill-store` 的**提示接线**                               | ~~`NEEDS_TRACE`~~ → **第五轮已删**。原判据见下方「第五轮」一节；该行保留原文以便对照，结论已作废。原理由：G02 删了 `packages/builtin-tool-skill-store`，但两处活的提示仍指向它：`packages/builtin-tool-activator/src/systemRole.ts:25-63` 的 `<skill_store_discovery>` 无条件告诉模型「**CRITICAL: Always activate `orvilo-skill-store` FIRST**」并调用 `importFromMarket` / `importSkill`；`packages/context-engine/src/providers/SkillImportRouteInjector.ts` 是同一件事的注入器。**为什么当时不动**：`MessagesEngine.ts:260,439` 用 `manifests` 里是否存在该 identifier 来决定注入器是否启用（`isSkillStoreReachable`）—— 据此推测私有 overlay 可以提供同名工具。 |
| `.agents/**` 与 `docs/orchestrator-session-handoff.md` 的退役残留 | **本 PR 已修**。`rg` 默认**跳过隐藏目录**，所以前几轮的「已清干净」都是假结论。用 `--hidden` 才扫出：`PROCESS.md` 整节 Publish 流程（`lh acceptance run ingest` / `view`）、`agent-testing-bot/SKILL.md`、`common-mistakes.md`、`probe-mock-patterns.md`、`plan-feedback.md`、`report-init.sh`、`fixture.mjs`、`PROJECT.md`、`skills-audit/SKILL.md`，以及 `docs/orchestrator-session-handoff.md:104` 的 `/acceptance/<id>` 链接要求。另修 `.github/workflows/verify-workbench.yml:142` —— 它在**每个 PR** 上贴 `gateway-staging.aspectlylabs.com/acceptance`，而该路由随本波次删除。                                                                                |

### 第五轮：skill-store 残留清理（`chore/retire-skill-store-residue`）

第四轮把 skill-store 从**本仓自己的表**（内置注册表、`alwaysOnToolIds`、渲染画廊）里清掉，但**留了提示接线**（上表 `NEEDS_TRACE`）。第五轮推翻该保留决定并删净。

**推翻的依据**：原推理链是「`MessagesEngine` 用 manifest 存在性做门控 → 代码**预期**该工具可能缺席 → 私有 overlay **可能**提供它」。这条链的终点只证明**代码预期缺席**，不构成**下游提供了它**的任何证据 —— 是把「可能」读成了「有」。仓库所有者确认线上没有该工具后，按指示直接删除。

**删除范围**（全分支 13 文件，+110 / −740）

| 层           | 对象                                                                                                                                                                                                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 提示（静态） | `packages/builtin-tool-activator/src/systemRole.ts` 的 `<skill_store_discovery>` 整块（40 行）、`SKILL-FIRST` 与「Skill Marketplace」两条 best-practice 指令（该文件 42 删 / 1 增）                                                                                                                               |
| 提示（动态） | `packages/context-engine/src/providers/SkillImportRouteInjector.ts` 及其测试（`git rm`，共 576 行）、`MessagesEngine.ts` 的 `isSkillStoreReachable` / `SKILL_STORE_TOOL_ID` 与注入器实例化、`providers/index.ts` 的导出                                                                                           |
| 文案         | 23 个 locale 键：`setting.ts` 的 13 个 `skillStore.*` 与 2 个 `tools.builtins.orvilo-skill-store.*`，`plugin.ts` 的 8 个 `builtins.orvilo-skill-store.*`，以及 `locales/en-US`、`locales/zh-CN` 两份手维护镜像。（初版删了 16 个 `skillStore.*`，其中 **3 个是活文案**，已在下面「修正」一节取回，故此处记 13。） |

**没删什么，以及为什么**

- **其余 16 个语言目录**（`ar`、`de-DE` …）仍留着这些键。按 AGENTS.md，它们由 `bun run i18n` 的每日 CI 生成；手改会与自动翻译 PR 冲突，且源文件缺键时生成器本就会丢掉它们。
- **拿 `orvilo-skill-store` 当样例的测试**：`ToolsEngine.test.ts`、`enableCheckerFactory.test.ts`、`apps/server/.../toolOutcome.test.ts`。判据是「把 id 换成随机字符串，断言还成立吗」—— 成立。这些是被测函数的**显式入参**（测试局部常量 / 合成 payload），不是产品状态的副本，无漂移风险；改动是纯 churn。这与第四轮那两条**必须**改的用例不同：那两条读的是真实的产品常量。
- `src/libs/skillManagementRetirement.test.ts` 里断言其 executor 文件**不存在**的那条门禁保留 —— 它是防复活的常驻守卫。

**删除时的两个陷阱（都靠断言挡住，不是靠仔细）**

1. **TS 源文件里键的值可能独占多行**。`skillStore.wantMore.feedback.message` 是跨 16 行的模板字符串，`tools.builtins.orvilo-skill-store.description` 的值也独占一行。`rg` 报的是**键的行号**，不是**块的行号** —— 按 `rg` 的行号算区间会把值留成孤儿，而「残留计数归零」照样成立。故 TS 侧用**显式行区间 + 首尾哨兵断言**删除；哨兵实际挡下了一次 off-by-one。
2. **JSON 镜像不适用区间删除**。它们的值是转义的、一键一行，行的身份随内容变化。故 JSON 侧用**前缀匹配 + 删后 `json.loads` 复验** —— 后者才是能发现「留下孤儿的续行」或「悬空逗号」的检查，前缀计数发现不了。

**防复活门禁**：`src/libs/skillManagementRetirement.test.ts` 已有一条「不再发布 skill-store 内置工具」，但它守的是**包与注册表**，不覆盖提示接线 —— 注入器若经重排 / 拣选回来，它不会红。故补一条 `no longer points the model at a skill store that this repo does not ship`：断言 activator 提示里不再出现 `orvilo-skill-store` / `skill_store_discovery`，`SkillImportRouteInjector.ts` 不存在，且 `MessagesEngine.ts` 不再引用 `SkillImportRouteInjector` / `SKILL_STORE_TOOL_ID`。**断言落在标识符上而不是措辞上** —— 文案可以改，退役的标识符不得回归。

**验证**：`bun run check` 绿；`packages/locales` 包级 40 用例绿（其中 `defaultKeys.test.ts` 双向校验源 ↔ 手维护镜像）；`src/libs/skillManagementRetirement.test.ts` 显式单跑 24 用例绿。输出含 autofix，已按 AGENTS.md 逐行读 diff：一处是 `providers/index.ts` 导出列表的字母序重排（`ConnectorOwnershipInjector`、`ProjectInstructionsInjector` 本就错位），语义等价；一处是测试数组折行。

> **下面是初版写下的原话，保留以示警戒。它当时就是假的。**
> ~~「全仓 `--hidden`（含 `.agents/`）搜 `skillStore.` 与 `builtins.orvilo-skill-store`，代码与手维护 locale 中零命中。」~~
> 扫描用的是 `"skillStore\.` —— **双引号前缀**，那是为 JSON 镜像写的模式；而 TS 调用点写作 `t('skillStore.tabs.orvilo')`，**单引号，永远匹配不到**。「零命中」是**模式不对**的产物，不是事实。CI 的类型检查是唯一不同意这个结论的东西。

新增的 5 条断言**逐条独立证伪**过（注入 → 期望转红且命中该条报文 → 复原）：A `orvilo-skill-store`、B `skill_store_discovery`、C 注入器文件、D 引擎注入器引用、E 引擎常量，5/5 转红。两条方法论备注：**一次注入只证明第一条断言可红**（测试短路，后面几条被遮住），故必须一条一轮；且**快照必须自身为绿**才能当复原基准 —— 首次跑证伪时上一轮手动注入的样本没复原，备份下来的「基线」是脏的，于是每条探针都被第一条断言挡下、收尾也仍红，**整轮输出不含任何证据**，脚本已加前置断言防复现。

#### 第五轮的修正：3 个键其实是活的（CI 类型检查抓出）

推上后 `Typecheck` 红。定性走的是**先排除基线**，因为这里的基线不可想当然：

- `Typecheck` 带条件 `if: needs.check-duplicate-run.outputs.should_skip != 'true'`，而 canary 最近 **6 次 push 它全是 `skipped`** —— 「canary 是绿的」这个前提**无法从近期 run 推出来**，中间落地的提交全仓类型检查一次都没真跑过。
- 改判据：同期**真正执行过**它的分支里，`82d1f429`（我的 base 的后代）与多个 `fix/audit-*` 都是 `success`；且成功那两次该步骤耗时 **88s / 83s**，我这次 **95s** —— 同一量级，排除「快速失败 / OOM / 脚本早退」。故判定为**本提交引入**。

**根因**：`src/features/ChatInput/ActionBar/Tools/useControls.tsx`（13 个）与 `src/features/ProfileEditor/AgentTool.tsx`（8 个）把 `t('skillStore.tabs.orvilo' | '.custom' | '.community')` 当 `sourceLabel` —— **工具详情浮层的「来源」标签，是活 UI**，共 **21 个调用点**；`t()` 的键有类型，删键即编译错误。（**21** 这个数按编译器的报错逐条对齐过：`useControls.tsx` 13 条 + `AgentTool.tsx` 8 条 TS2345，与字面匹配数一致。仓库自带的 `chatgpt-codex-connector` 自动评审独立指出了同一问题，它给的数是 19 —— 以编译器为准。）同一个浮层里另有一个**动态拼接**的键 `tools.builtins.${item.identifier}.description`，它是带 `as any` 传的，所以那边删键不报错 —— 这也解释了为什么偏偏是这 3 个静态键出事。

**修法**：从 `origin/canary` 逐字节取回这 3 个键（不手打，直接 diff 验与原值一致）。名字 `skillStore.tabs.*` 是历史遗留，**用法是活的**；改名是另一件事，不在本 PR 范围。

**修正后的穷尽检查（本机不跑 tsgo 也能覆盖这一类）**：把**每一个**被删的键取出来，逐个做**引号无关**的 `rg -F` 字面量搜索（`-F` 避免键名里的 `.` 被当正则元字符）。23 个键全部零命中。它能覆盖 `t('k')` / `t("k")` / ``t(`k`)`` / `i18nKey="k"` 等所有引用形态 —— 上一轮缺的正是「引号无关」这一点。

**补的门禁**：`skillManagementRetirement.test.ts` 本就声明是**对称**门禁（一侧 must be gone，另一侧 must stay），而这次漏的正是 must-stay 那一侧。新增 `the tool-source labels that outlived the store are untouched`，断言这 3 个键在源文件与两份手维护镜像里都在。已双路证伪（源文件删键 → 红并点名；en-US 删键 → 红并点名），复原后逐字节一致。

**同一个根因还红了第二个 job，而我一开始以为它们是两回事**：`Test Database` 也 `failure`，失败步骤是 `Lint` —— 看着与我无关（我没动 `packages/database`）。但那个 job 的 `Lint` 跑的是 **`bun run lint`**，它的第 3 段就是全仓类型检查（`lint:ts → lint:style → type-check → lint:circular`）—— **CI 里它内嵌了类型检查**。所以两个 job 是同一个原因。

**为什么本机永远发现不了这一点**：`bun run lint` 在非 CI 下**故意** `exit 1`（`scripts/type-check.mjs` 拒绝在开发机跑 tsgo，怕 OOM），报「Full-repo type-check runs in CI only」。于是我只看到 `lint` 整体红，**分辨不出它红在第几段** —— 本地这条命令的失败是恒定的，不含信息。这与本仓那条「本地绿 ≠ 仓库完整」是镜像：这里是**本地红也不含信息**。

**顺带记录的判据**：`bun run check` 的 lint 是**改动文件范围**，`bun run lint` 是**全仓**；前者绿不蕴含后者绿。判一个「lint 会不会红」必须对准 CI 真正跑的那条命令。

**另一个容易误判的「合不了」**：两条 `Required Quality Gate` 都 `success`、分支也知道与 base 同步（`ce58d1ae`）之后，PR 仍停在 `mergeStateStatus: BLOCKED` 且 `mergeable: MERGEABLE`。原因不在检查，而在 ruleset 的 **`pull_request` 规则**：`required_review_thread_resolution: true` —— 仓库自带的 `chatgpt-codex-connector` 自动评审在这个 PR 上留了一条**未解决**的 review 线程（它独立指出了上面同一个缺陷，判 P2）。回复说明已在 `6069e5af` 修复并 resolve 后，状态变为 `UNSTABLE`（= 可合并，只因**非必需**检查 `Check all PR gates before Vercel` 仍红）。**判据**：`BLOCKED` 要先分清是**检查**没绿还是**线程**没解决 —— 用 `repos/…/rules/branches/canary` 看 `pull_request` 规则的参数，而不是盯着 check-runs。

### 已知的既有问题（非本次引入，已在基线验证）

`src/libs/oidc-provider/provider.test.ts`（4 例）与 `src/features/Conversation/WorkingSidebar/__tests__/index.test.tsx`（3–4 例）
在主仓库（代码 ≈ canary）上**本来就红**。

本机 load 很高时，宽并行跑会出现**成批超时形状的假失败**。判定方法：用**同一命令跑两次**—— 两次得到**不同的失败集合**即证明非确定性。
实测：第一次 11 failed / 2401 passed，第二次 2 failed / 2410 passed，两次唯一共同的失败是上面那个基线红文件。

`src/features/HomeSidebar/Footer/index.test.tsx` 有 2 条 `@eslint-react/no-unnecessary-use-prefix` **警告**（非错误）。
误报：`vi.doMock` 的工厂返回 `useBillboardMenuItems` / `useActiveNavKey`，这些名字**必须**保持 `use` 前缀才能被被测组件导入，但工厂本身不调用 hook。
已用 `git stash` 取 HEAD 版本单独跑 eslint 核对：**基线同样两条**，非本次引入。

### 一处需要在 PR 里显式声明的**不可逆**后果

自建 OAuth 客户端记录进 `oidcClients` 表，而 `adapter.ts:294-297` 把 `enabled === false` 当作「client 不存在」。
`setEnabled` 的唯一入口随控制台退役，因此**只有被用户显式停用过的自建 client 会永久无法复活**（只能直接改库）。
静态第一方 client（desktop /mobile/cli/market）来自 provider 的 `defaultClients`，完全不受影响。

## 波次与状态

| 波次 | 内容                                                | 状态                                    |
| ---- | --------------------------------------------------- | --------------------------------------- |
| A    | G00 清点（本文件）+ G01 能力决策源 + 开发指令修正   | **完成**                                |
| B    | G02 Skill 全链 / G03 Acceptance 收敛 / G04 隐形页面 | **完成**（与 A 合并为一次提交）         |
| C    | G05 后台停止与历史收尾 + G06 防复活 CI 门禁         | **完成**（G05 的 `NEEDS_TRACE` 项见上） |
| D    | G07 独立复核                                        | **完成**（`REQUEST CHANGES` → 已修正）  |

## 协调点

- `feat/acp-P60-browser-use`（HEAD 同为 `a90c4aea`）正在处理内置浏览器 —— 防复活门禁**不得**按「browser 已退役」编写。
- `a90c4aea` 删除的 `apps/server/src/services/oauthDeviceFlow/**` 是 P50 的 provider 设备流，**不是** OAuth 应用退役。
- `task-first-rollout.md` §4 未解决项 #1 记录：与 `bbd6ead3` 存在**两套并行退役机制**，该文档自述无法在本分支内收敛。
- `@orvilo/builtin-skills` 为 `private: true`，不走 npm 分发；`packages/sdk/src/generated` 对退役面零命中。
- `lh acceptance install` 只写进程级 `cwd/.agents/skills/`；`~/.claude/skills` 与 `~/.codex/skills` 全仓**只有读路径，无写路径**。
