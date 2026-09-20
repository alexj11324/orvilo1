# P03 品牌例外白名单 (brand exception allowlist)

Orvilo 自主品牌面统一后，仓库中仍被允许保留 `Lobe*` / `lobehub` 字面量的位置。
按路径 + 标识逐条限定 —— 不允许整目录豁免；新增例外先更新本文件。

## 1. 第三方依赖身份（保留，属上游包 / 资产名）

| 位置 / 标识                                                                                                                                                                                                 | 保留理由                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `@lobehub/*` 包名与导出名（`@lobehub/ui`、`@lobehub/icons`、`@lobehub/lint`、`@lobehub/analytics`、`@lobehub/market-*`、`LobeHub`/`LobeChatProps`/`LobeHubText`/`LobeCustomToken`/`getLobeIconCDN` 等符号） | 第三方包 scope 与其 API 名，改名即断依赖                                           |
| `--lobe-*` CSS 变量、`lobe-theme`（`packages/const/src/settings/common.ts`）、`lobeTheme`（CodeMirror theme）                                                                                               | `@lobehub/ui` design-token 命名空间；`lobe-theme` 值同时是持久化设置值（P04 管辖） |
| `pnpm-workspace.yaml` 的 `@lobehub/*` catalog scope、`eslint.config.mjs`/`stylelint.config.mjs`/`prettier.config.mjs`/`commitlint.config.mjs` 对 `@lobehub/lint` 的引用                                     | 工具链包身份                                                                       |
| `public/not-compatible.html` 的 `@lobehub/webfont-*` npmmirror 字体 URL                                                                                                                                     | 上游托管的字体资产，暂无自有镜像                                                   |

## 2. 上游 sentinel /white-label 机制（保留，语义即「非上游品牌」）

| 位置 / 标识                                                                                                                                                   | 保留理由                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `packages/const/src/version.ts` 的 `BRANDING_NAME !== 'LobeHub'` / `ORG_NAME !== 'LobeHub'`                                                                   | white-label 判定把上游品牌名当哨兵值；Orvilo 永远为 true |
| `plugins/vite/customBrandingLoadingScreen.ts` 的同款比较 + `packages/business/const/src/branding.ts`、`apps/desktop/stubs/business-const/src/index.ts` 的注释 | 同上                                                     |

## 3. 持久化 / 线上标识（移交 P04，本 PR 不改）

| 标识                                                                                         | 说明                                         |
| -------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `LOBE_SYSTEM_STATUS`                                                                         | `statusStorage` 的持久化 localStorage key    |
| `LOBE_*_ACP_COMMAND` env override（`packages/heterogeneous-agents/src/spawn/acpRuntime.ts`） | 已发布给桌面 / CLI 用户的环境变量名          |
| `lobe_cc`（per-run MCP server 挂载名，`packages/types/src/agent/acpExecution.ts` 等）        | 线上 durable 标识：既有会话 / 工具调用引用它 |
| deep-link scheme、appId（`com.aspectlylabs.orvilo` 已是 Orvilo）、DB slug、历史记录中的旧名  | P04 的 identity 迁移范围                     |

## 4. 历史与文档（保留为史料）

| 位置                                                                              | 说明                         |
| --------------------------------------------------------------------------------- | ---------------------------- |
| `changelog/**`、`CHANGELOG*`                                                      | 上游历史，不改写             |
| `docs/**` 中叙述历史 / 上游事实的段落（如「the Lobe model loop is retired」）     | 指涉退役引擎本身的名称，属实 |
| `LICENSE`、`NOTICE`、`THIRD_PARTY_NOTICES*`                                       | 第三方署名，禁止删除         |
| 测试 fixture 中含 `lobehub` 的导入数据（`packages/database/.../fixtures/*.json`） | 旧导出格式的测试样本         |

## 本 PR 替换掉的自出面（非例外）

- `standardAcpSession.ts` ACP `clientInfo`：`lobehub`/`LobeHub` → `orvilo`/`Orvilo`（线上握手身份，自有面）
- `src/services/global.ts` 版本检查源：`registry.npmmirror.com/@lobehub/chat` → Orvilo GitHub releases latest
- 第一方注释中以「LobeHub」指代本产品者（drivers/types/shareGate）→ Orvilo

## 判定准则

看到一个 `Lobe*` 引用时按此顺序分类：

1. 第三方包 / 资产身份 → 保留（§1）
2. 比较哨兵（值是上游名、语义是「我们自己不是它」） → 保留（§2）
3. 已持久化 / 在线上有存量数据引用的 key → 移交 P04（§3）
4. 面向用户 / 面向 ACP 对端的自有产品名、标题、链接、图标 → 一律替换为 Orvilo（本节下表即唯一允许例外）
