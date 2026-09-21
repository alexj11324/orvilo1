# Slimming — ORV-116: Census Coverage Closure + Strict Boundary Gate

> ORV-116 收口报告。状态：**complete**（本 PR head 上 `node scripts/slimming/census.mjs --check` → 0 violations）。

## 1. 入口问题（Codex 独立复核发现的五个缺口）

Gate D 开启时的真实数据面：

| 缺口                                      | 起始值 | 现状                                                                  |
| ----------------------------------------- | ------ | --------------------------------------------------------------------- |
| UNCOVERED source files                    | 4,355  | **0**                                                                 |
| conflicting disposition files             | 8      | **0**（由 ORV-114 结清；新增 allowance 机制覆盖剩余合法重叠）         |
| INVESTIGATE capabilities                  | 2      | **0**（ORV-114 knowledge → KEEP；ORV-115 achaos → DELETE + 物理删除） |
| DELETE caps still matching files          | —      | 0（7 个 DELETE cap 全部 fileCount=0）                                 |
| unresolved internal imports               | 562    | **0**（562 修复至 0，不可解的全部走显式豁免）                         |
| `--check` 只查 DELETE unexplained inbound | —      | **fail-closed on 全部六类违规**                                       |

## 2. 覆盖收口方法

4,354 个 UNCOVERED 文件没有使用任何 catch-all glob（没有 `src/**`、`apps/**` 这种偷懒写法），全部归入域能力：

### 新增 14 个 KEEP 能力（domain-scoped）

| capability             | 覆盖文件数 | 语义                                                                                                                                                              |
| ---------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-tools`（扩展）  | 1,352      | + features MCP\*/Plugin\*/SkillsList/ToolTag、libs {mcp,composio}、services {mcp,composio,skill\*,webBrowsing,workRegistration}、PluginStore                      |
| `data-infra`（扩展）   | 1,270      | + queue/hatchet/fileUpload/vent、S3 module、upload router                                                                                                         |
| `app-shell-navigation` | 815        | `src/routes`/`src/layout`/`src/spa`、入口文件、Home/Nav/CommandMenu/Onboarding 面                                                                                 |
| `agent-management`     | 622        | Agent builder/settings/sidebar、Group\*、Hetero\* UI、work registry、agent 域 lambda + services                                                                   |
| `client-foundation`    | 643        | `src/hooks`/`src/utils`/`src/types`/`src/const`/`src/helpers`/`src/business`、基础 libs、未认领 `src/services`                                                    |
| `server-core-routing`  | 528        | lambda 基建（`_helpers`/`_schema`/`config`/index/\_template/ 全部 lambda 测试）、async/mobile/router-hono 壳、platform config、`business*`/`config` 包、vite 配置 |
| `settings-and-billing` | 320        | Settings/ProfileEditor/User/SelfLearning、quota/usage                                                                                                             |
| `dev-tooling`          | 314        | `scripts`/`tests`/`e2e`/`plugins`、DevPanel/DevDock                                                                                                               |
| `shared-ui`            | 253        | `src/components`/`src/styles`                                                                                                                                     |
| `cli-control-plane`    | 210        | `apps/cli` 全量                                                                                                                                                   |
| `files-and-resources`  | 158        | FileViewer/ExplorerTree/Resource\*/LibraryModal、file/library store                                                                                               |
| `memory`               | 61         | userMemory 全链                                                                                                                                                   |
| `search`               | 48         | search/ftsSearch/ftsSearchSync                                                                                                                                    |
| `sharing-publishing`   | 40         | Share 面 + share/shareChat routers                                                                                                                                |
| `observability-admin`  | 29         | analytics/bootMetrics/traces/observability + llmGenerationTracing                                                                                                 |
| `notifications`        | 19         | email/push/webhookUser/resourceEvents                                                                                                                             |

其余 UNCOVERED 归入既有能力（conversation-surface /tasks-caid/acp-execution/documents-pages/desktop-mobile-shell/auth-infra/knowledge-context/file-ingestion/data-portability/workspace/github-linear-integration/eval-surface/openapi-api）。

## 3. Unresolved imports 562 → 0 的三类处理

- **解析器真缺陷**（\~470）：desktop `apps/desktop/src/main` 的 `@/`/`~common/` 别名作用域；workspace exports-map 子路径（含 `{import,types,default}` 条件项）；`pkgByName` 同名覆盖（`apps/desktop/stubs/business-const` 遮蔽 `@orvilo/business-const`，改为 name→候选数组逐个试）；`resolveAsFile` 补 `?query`/`#frag` 剥离、`.d.ts` 探测、裸目录→package.json exports \['.']/main→`/src/index`；`extractSpecifiers` 逐字符剥 `//` 和 `/* */` 注释并保字符串。
- **非真实 import**（\~85）：测试断言字符串、fixture transcript、模板字面量内的 import 文本、codemod 的 pattern 常量、动态 specifier（`./${locale}`）、构建期生成物（`./types.gen` 等）。逐条登记 `boundary.json` 的 `importExceptions`（35 条，每条带 owner=`alexj11324`、reason、expiry='persistent'）。
- **strict gate 现在认 `exempted` 标记**：未豁免的 unresolved 进 violation，豁免的进统计不进违规。

## 4. Strict `--check`（fail-closed on 六类）

`evaluateCheck(census)` 现在对以下每类都产生 violation：

1. `uncoveredFiles.length > 0`
2. `conflictingDispositionFiles.length > 0`
3. `investigateCapabilities.length > 0`
4. `deleteCapabilitiesWithFiles.length > 0`（DELETE glob 重新匹配到文件 = 回归）
5. DELETE caps 有 `inbound.unexplained > 0`（原有规则保留）
6. `unresolvedImports` 中非豁免项 > 0

### overlapAllowances —— 窄豁免而非宽放行

`boundary.json` 新增 `overlapAllowances: [{broad, narrow, reason}]`：当且仅当一个文件的 capability 集合完整落在某条 `{broad,narrow}` 对内时，跨 disposition 重叠豁免（域认领优先）。当前唯一一条：`client-foundation`（宽 base globs）vs `conversation-surface`（对具体 hook/service 文件的 REWRITE 认领），覆盖 14 个合法重叠文件。任何其他跨 disposition 重叠仍是 violation。判定逻辑导出为 `isDispositionConflict` 供测试。

## 5. 可证伪性

`scripts/slimming/census.test.mjs`（`node --test`，11 个测试）逐类注入违规断言 gate 会变红：clean 通过、uncovered/conflicts/INVESTIGATE/DELETE-with-files/unexplained-inbound/unresolved 各自失败、exempted unresolved 放行、overlap allowance 三条边界（无 allowance 失败 / 有 allowance 放行 / 集合外有第三个 cap 仍失败）。该测试已在 `test.yml` 的 `slimming-boundary` job 里作为 `--check` 之后的一步执行 —— **CI 不仅验证仓库干净，也验证 gate 本身会变红**。

## 6. 验收对照（ORV-116）

| 验收项                                                        | 状态                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| UNCOVERED 全部归类，无 catch-all                              | ✅ 0 uncovered，40 caps 全 domain-scoped                                        |
| different-disposition overlap = error（除非 ledger 有窄豁免） | ✅ `isDispositionConflict` + `overlapAllowances`                                |
| unresolved imports 归 0 或小豁免文件                          | ✅ 562→0，85 条非真实 import 进 `importExceptions`                              |
| `--check` fail-closed 六类                                    | ✅ `evaluateCheck` + CI wired                                                   |
| falsifiability 测试每类违规                                   | ✅ 11 tests                                                                     |
| CI 运行该 gate                                                | ✅ `slimming-boundary` job（required gate）已在跑 `--check` + `census.test.mjs` |
