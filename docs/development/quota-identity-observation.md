# Quota 观测的身份绑定契约（R09 / F11）

> 对应修复：`fix/quota-identity-observation`（→ `audit/freeze-integration-and-correct-evidence`）。
> 背景：P06 之后 `agentQuota` 只剩观测路径 —— 账户行由设备 ingest 写入、按
> `externalAccountId` 去重，面板只能读。F11 发现面板在无 `deviceId` 时回退
> `claude[0]`，以及 ingest 失败后 `find(externalId) ?? claude[0]`，都可能把
> 别人历史窗口画到当前运行头上。

## 契约

Quota 面板显示的持久化账户**只能**经由 "本执行上下文确认过的身份" 解析：

1. **观测键** = 执行上下文本身：`createQuotaSourceKey(provider, deviceId|'local', env,
{principal, workspace})`（provider + 执行节点 host + CLI profile env +
   登录主体 + workspace）。上下文切换（换设备 / 换 profile / 回本地 / 换
   登录用户 / 换 workspace）天然换键，不会继承别处确认过的绑定；login→logout
   切换额外清空全部绑定（匿名挂载不触发）。
2. **确认**只来自实时采样：`fetchClaudeCodeQuotaSnapshot` 返回 `status:'ok'`
   且带 `identity.externalAccountId` 时，`trustQuotaIdentity(contextKey, id)`
   记下绑定。实时样本是 "这个上下文此刻是谁" 的唯一权威 —— 即使它不带可入库
   的 readings 也要重绑（设备上换登录后立刻丢弃旧账户）。
3. **没有第一行兜底**。无绑定 → 不解析任何持久化账户，不预读 readings；
   未确认的 row 不会仅仅因为排在 `listAccounts` 首位而上屏。
4. **可见性回撤即解绑**：每次 `listAccounts` 成功后，不在可见集合内的
   `externalAccountId` 的绑定被 `pruneQuotaIdentityTrust` 清掉（撤权 / 跨
   workspace / 另一用户）；`isObservableQuotaAccount` 同时剔除
   `enabled:false` / `status:'disabled'` 的行。列表拉取失败时不做 prune —
   失败证明不了可见性，误清会让仍在有效的绑定凭空消失。
5. **ingest 失败不回借身份**：实时样本已确认身份但 `ingestSnapshot` 失败
   （或该身份的账户行在此 user/workspace 不可见）时，面板照常显示该样本，
   并加 `persistenceFailed` 标记渲染提示条
   （`heteroAgent.claudeQuota.persistFailed`），而不是退回某个旧账户的窗口。
6. **unknown 就是 unknown**：样本无 `identity.externalAccountId` 时头部渲染
   `heteroAgent.claudeQuota.unknownIdentity`；merged 视图不存在时 live 样本
   独立成立，只显示它自己的窗口 —— 绝不借用任一历史账户的窗口去补满。
   `buildClaudePanelSnapshot` 内部仍要求 live 样本与账户 `externalAccountId`
   正匹配才折叠（`liveBelongsToAccount`），双保险。
7. **成功但不可归因的采样撤销当前确认**（SA07）：`status:'ok'` 却拿不到
   `externalAccountId` 时，`resolveQuotaIdentityForLive` 直接删除本上下文的
   绑定并返回无账户 —— 设备上可能已换登录，绝不能继续把上一个确认身份的
   历史窗口当 "当前" 画出；面板只显示该样本自身的窗口 + unknown 身份。
8. **last-known 必须标记为未验证**：实时探测失败（fetch 失败 / 非 ok）而
   仍渲染最后确认身份的视图时（interim 与 merged 都一样），一律打
   `identityUnverified` 标记并以
   `heteroAgent.claudeQuota.identityUnverified` 提示 " 显示上次确认的身份，
   当前状态未验证 "—— 不得呈现为 current confirmed。

## 实现位置

- `quotaViewModel.ts`：`quotaIdentityTrust`（模块级 Map—— 重挂菜单不应要求
  重新向采样器确认）+ `trustQuotaIdentity` / `trustedQuotaIdentity` /
  `pruneQuotaIdentityTrust` / `resetQuotaIdentityTrust`；
  `resolveQuotaIdentityForLive`（身份决策的唯一入口：ok + 身份→绑定、
  ok + 无身份→撤销、无 ok 样本→保留已确认身份供标记为未验证的展示）；
  `isObservableQuotaAccount`；`ClaudeCodePanelSnapshot`（wire 类型 +
  面板私有标记 `persistenceFailed` / `identityUnverified`，不跨 IPC/RPC）。
- `ClaudeCodeQuotaMenu.tsx`：`fetchQuota` 按上述契约解析账户；gate 增加
  `!account` 分支 —— 未确认身份时永远先问采样器。
- `QuotaMenu.tsx`：新增 `getNoticeText` prop，`status:'ok'` 且有窗口时在
  窗口下方渲染提示条。
- `QuotaAccountIdentity.tsx`：无身份渲染 `unknownIdentity`；无
  `externalAccountId` 时不显示日历入口。

## 不变量

- 不改 `agentQuota` router 的任何入参 / 返回；不重开账户池 / 轮转 / CRUD。
- 合并门禁：两设备两身份 + ingest 故障 + 撤权场景下不串号（对应
  `QuotaMenu.test.tsx` 三条回归）。
