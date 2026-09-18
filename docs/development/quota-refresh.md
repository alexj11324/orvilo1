# Quota 菜单刷新语义

`QuotaMenu`（`src/features/ChatInput/ControlBar/HeteroControlBar/QuotaMenu/`）展示异构 agent 的额度快照。本文记录刷新管线的不变量——这些约束由 `QuotaMenu.test.tsx` 中的用例钉死。

## 刷新触发器

- **挂载**：打开菜单时读取持久化快照；仅 `revalidate`/`manual` 路径会真正咨询上游。
- **可见性 / 焦点**：`visibilitychange` 与 `focus` 事件触发被动重校验。隐藏标签页上的触发被直接忽略。
- **轮询**：每 `autoRefreshMs`（Claude 为 120s）触发一次被动重校验。

## 新鲜度门禁

被动触发统一过 `requestRevalidation` 门禁：

- `quota.updatedAt` 或 `lastRevalidateAtRef` 距当前 **严格小于** `autoRefreshMs`（`<`，不是 `<=`）时判定为新鲜，跳过咨询。恰好在窗口边界算作过期——快照时间戳与 interval 注册同刻时，整点 tick 的差值恰好等于窗口。
- `lastRevalidateAtRef` 记录上一次主动咨询上游的**发起时刻**，写入点收敛在 `loadQuota` 内：手动刷新与被动重校验都会打戳，纯挂载读持久化数据不打戳。

## 飞行中合并

- 上游咨询在途时到达的触发不另起请求，而是 park 在 `pendingRevalidateMsRef`；在途请求落地后 drain 重放一次。
- 由于 live 样本不可归因时 `snapshot.updatedAt` 停在持久化 receipt 上，drain 重放依赖 `lastRevalidateAtRef` 判断「刚咨询过」而不是依赖快照时间戳，否则 focus+visibility 成对到达会造成二次上游调用。

## 计时器与监听器

- 轮询 interval 只依赖 `[autoRefreshMs]`，回调经 `requestRevalidationRef` 转发；focus/visibility 监听器注册一次。渲染期的回调身份抖动不会重置倒计时。
- 瞬态错误有冷却窗口，冷却期内的被动触发同样被忽略。
