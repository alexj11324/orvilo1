# 对话列表的发送 pin 与底部 spacer

> 本文说明 `src/features/Conversation/ChatList/hooks/useConversationScroll.ts` 里「发送后把用户消息顶到列表顶部」（pin）与底部补偿区域（spacer）的生命周期，以及回复结束后视口何时回到底部。仓库级开发规范见 [`AGENTS.md`](../../AGENTS.md)。

## pin 与 spacer 各管什么

- **pin**：检测到发送后记下用户消息的索引，并在每次 spacer 布局变化时把它滚到列表顶部。
- **spacer**：列表末尾的一个占位行，高度 = 视口高度 −（用户消息顶部到回复底部的距离）。回复短时由它把用户消息「撑」在顶部；回复超过一屏后高度变成 0。

流式输出期间，spacer 即使高度为 0 也保持挂载：此时 pin 的位置本身已经成立，提前卸载会让尾部的 AutoScroll 重新挂载，把视口拖到末尾。

## 回复结束后怎样回到底部

pin 期间视口停在用户消息上，`atBottom` 为 false，AutoScroll 的流式跟随不会触发。所以回复结束时必须由 pin 自己收尾：

1. 生成结束后的一次测量得到高度 0（且不在生成中）→ 安排 `CONVERSATION_SPACER_TRANSITION_MS`（200 ms）后卸载 spacer。
2. spacer 从「挂载过」变为「已卸载」→ 释放 pin；若开启了「AI 回复时自动滚动」，调用 `scrollToBottom(false)` 回到底部。

关闭自动滚动时，pin 的位置就是最终停留位置，不做第 2 步的滚动。

注意：`isAIGenerating === false` 不等于「回复已结束」。发送后到生成操作真正开始之前（例如回复首包有延迟）它同样为 false，而新行尚未测量时 virtua 会用估算尺寸，测得的 spacer 高度可能为 0。不要把「未挂载 + 空闲 + 高度 0」当作回复结束的信号。

## 不能破坏的约束

- **已安排的卸载不能被后续测量重置。** 回复结束后布局还会继续变化，ResizeObserver 会反复触发测量；慢机器上间隔可能小于 200 ms。如果每次测量都重新计时，卸载会一直被推迟到布局完全静止为止，这段时间 pin 不释放，视口停在用户消息处而不是回到底部（慢机器上可达数秒；E2E `AGENT-SCROLL-001` 在只采样一次时读到的 `distanceToBottom 4467` 就是这个窗口）。只有 spacer 重新需要高度（高度 > 0，或重新开始生成）时才取消待执行的卸载。
- 用户在 pin 期间向上滚动会先通过 `user scrolled up` 释放 pin，因此走到「卸载后回到底部」的一定是自然结束的回复。

回归测试见 `useConversationScroll.test.ts`（「idle re-measures keep arriving after the stream ends」）以及 `e2e/src/features/journeys/agent/agent-scroll.feature`。
