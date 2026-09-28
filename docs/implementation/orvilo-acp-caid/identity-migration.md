# P04 — 持久化命名与升级兼容映射（identity migration map）

每条旧→新映射带 owner / 方式 / 期限。原则：幂等、现存新数据优先、旧记录 FK 与归属不变；
历史可读，但旧执行配置一律要求重新绑定 ACP，不得映射回已退役引擎。

## 背景事实（影响迁移规模）

本仓库根提交即已完成 `lobechat→orvilo` 产品改名（`cfa85e6d`），`orvilo://` scheme、
`com.aspectlylabs.orvilo` appId、`~/.orvilo` CLI 目录、`ORVILO_*` storage/env 名称
均为首发值 —— 不存在从「lobe\* 命名的已发布安装」升级的存量。因此迁移面 = 改名后
**才发布**、却沿用了旧 `LOBE_*`/`lobe_*` 命名的少量标识，加上自身演进产生的旧值。

## 迁移表

| kind         | old                                                                                                        | new                                       | 方式                                                                                                    | owner   | 期限                         |
| ------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------- | ---------------------------- |
| env          | `LOBE_AMP_ACP_COMMAND` / `LOBE_CLAUDE_CODE_ACP_COMMAND` / `LOBE_CODEX_ACP_COMMAND` / `LOBE_PI_ACP_COMMAND` | `ORVILO_*` 同名                           | 双读：优先新名，回退旧名（`readAcpBridgeOverrideEnv`）                                                  | P04     | P21 删除 `legacyOverrideEnv` |
| MCP mount    | `lobe_cc`（桌面 per-run `session/new` 挂载名）                                                             | `orvilo_cc`（`ASK_USER_MCP_SERVER_NAME`） | 挂载侧统一用常量；adapter 双读 `mcp__lobe_cc__ask_user_question` 与 `mcp__orvilo_cc__ask_user_question` | P04     | P21 移除 legacy 名           |
| JWT iss      | `urn:lobehub:internal`（room ticket / publish token）                                                      | `urn:orvilo:internal`                     | 签发写新值；verify 双 issuer 数组（jose `issuer: string[]`）                                            | P04     | 旧票 TTL 用尽后 P21 移除     |
| CLI bin      | `lh`                                                                                                       | `orvilo`                                  | 双 bin 共存（`lh`+`orvilo` 同入口）；`lh` 保留至退役命令窗口                                            | P03/P04 | P21 由退役命令错误替代       |
| localStorage | `ORVILO_GLOBAL`                                                                                            | `ORVILO_PREFERENCE`                       | 已有幂等迁移（`AsyncLocalStorage` 构造器搬 preference 并删旧 key）                                      | 既有    | 已落地                       |
| 导入格式     | `lobehub` 版导出 JSON                                                                                      | 现格式                                    | `dataImporter/deprecated` 继续解析（fixture 覆盖），历史归属不变                                        | 既有    | 保留 decoder，禁映射回旧引擎 |

## 刻意不改（upgrade-path 保护 / 第三方身份）

- `LOBE_SYSTEM_STATUS`：**未迁移** —— 该键从未在本产品发布（改名时同步为 `ORVILO_SYSTEM_STATUS`，发布值即新名）；不发明不存在的旧路径。
- DB slug / 记录 ID /tool identifier：全仓无 `lobe*`/`lobehub*` 前缀的自产标识（已扫描）；历史内容不改写。
- `lobe-theme`、`--lobe-*` CSS 变量、`@lobehub/*` 包 scope：第三方 design-token / 包身份，永久保留。
- deep-link scheme /appId/ Keychain：发布值已是 Orvilo（`orvilo://` / `com.aspectlylabs.orvilo`）；Electron safeStorage 不挂 service 名，无迁移对象。不得扫描用户另装的官方 LobeHub/CLI 数据 —— 本 PR 不触碰任何他人路径。
- 旧会话 / 导入 Agent：历史与 persona 保留（deprecated importer + 消息归属不变）；执行配置不再映射回旧循环 —— 需 ACP 重新绑定（该约束由 RB/P05 落地，不在本 PR 新造行为）。

## 验证

- 幂等 / 共存：`readAcpBridgeOverrideEnv` 新旧名并存时新名优先；仅旧名时回退；ticket verify 新旧 iss 均过；`mcp__lobe_cc__*` wire 名仍 rewrite 到 `askUserQuestion`。
- 中断安全：所有变更均为「读侧兼容」型，无可中断的多步写迁移；重启后读侧继续兼容。
- 导入 round-trip：`dataImporter` 旧格式 fixture 测试原样通过（不动 fixture = 不动历史样本）。
