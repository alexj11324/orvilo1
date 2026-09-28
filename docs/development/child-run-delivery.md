# 异步子运行与群聊结果投递核对

> 对应 P10（通用异步子运行和群聊结果投递）。结论：结果投递已经是服务端持久化
> 路径，客户端轮询只是活跃页面的镜像 —— 客户端关闭不再决定 child 存活或结算。

## 投递链路（现状）

| 路径                                                          | 投递机制                                                                                                                           | 客户端关闭后的行为                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `callSubAgent`（virtual sub-agent，`resumeParentOnComplete`） | `createSubAgentBridgeHook` → `completeSubAgentBridge`：回填父占位 tool 消息 → `tryResumeParentFromAsyncTool` CAS 恢复 parked 父 op | Hatchet webhook `/api/agent/webhooks/subagent-callback` 重投；CAS 保证不重复恢复     |
| 群聊成员（`execGroupMember` isolated）                        | `createGroupActionMemberBridgeHook` → `completeGroupActionMember`：锚点回填 + K=N barrier + supervisor resume/finish               | 同上（`/api/agent/webhooks/group-member-callback`）                                  |
| direct mention / 客户端驱动 `execSubAgent`                    | `createThreadRunHooks` onComplete：`updateThreadRunProgress` + 将 last assistant summary 写回 `sourceMessageId`                    | 服务端写回照常完成；`ClientSubAgentTransport` 的 3s 轮询仅是活跃页镜像，死了不丢结果 |

## 逐条核对（计划步骤 → 现状）

1. **独立 child operation /parent-child/ 线程沿用 / 完成事实持久化** —
   `execAgentThreadRun` 建 isolation thread + 独立 `agent_operations` 行；
   `parentOperationId`/`threadId`/trigger 继承；完成事实写 `agent_operations`
   - thread metadata。
2. **按 child/parent generation 去重；父 busy 排队** — 恢复经
   `tryResumeFromAsyncTool` CAS（一次性）与 `settleRunningOperation` settle 标记；
   webhook 重投幂等（CAS 失败 → no-op，不重复唤醒父）。父 parked 时结果入
   持久占位（tool 消息 /pluginState），idle 时由受支持会话 turn 继续。
3. **群聊 all/any/k-of-n** — `expectedMembers` barrier 在
   `completeGroupActionMember` 内计数收敛，不依赖全批次屏障；未将 CAID 语义
   套进群聊。
4. **旧 snapshot producer 停止** — 全仓无新 `waiting_for_async_tool` 写入方
   （`agentNotify`/heteroFinish 只产出 done/error/interrupted）；存量 parked 行
   由 sweep/`finalizeAbandoned`/`AbandonOperationService` 收敛，CAS 成功不再当
   真实唤醒证据（只结算账目）。字段类型保留至排空后 P21 删除。

## 已知残留（非本 PR 范围）

- `waiting_for_async_tool` 状态谓词与消费方仍保留（KEEP\_HISTORY → P21）。
- `ClientSubAgentTransport` 的 30min 超时 / 3s 轮询属 UI 等待体验，非存活条件；
  若后续要展示中断恢复态，可在线程页复用 `sourceMessageId` 回写结果。

## R04 加固（F06 修复）

投递链路在 R04 补齐了四个环节：

1. **子态终态白名单** — `@orvilo/types` 新增
   `TERMINAL_AGENT_OPERATION_STATUSES`（`done|error|interrupted|abandoned`）+
   `isTerminalAgentOperationStatus`。`awaitAcpBuiltinToolChildren` 不再以
   `status !== 'running'` 判 settled：`waiting_for_human` / `waiting_for_async_tool`
   / `idle` / `paused` 等非终态一律返回 `pending`，不再把 "等待审批 / 挂起" 的子运行
   误判为完成。

2. **持久投递账本** — `completeSubAgentBridge` / `completeGroupActionMember` 在
   回填占位消息前，先向 `event_outbox` 写入 `agent_operation.child_result` 事件
   （`childResultEventId` = `child-result:{parent}:{child}:{toolCallId}:{generation}`，
   唯一索引去重：重投返回 `replayed`，不重复结算）。消费点：
   - ACP 等待路径（`awaitAcpBuiltinToolChildren`）结算成功时标记 `delivered`；
   - 兼容路径 `tryResumeParentFromAsyncTool` CAS 成功时标记 `delivered`。
     父忙期间结果保持在 pending 占位 + outbox 行，空闲后经合法 ACP 路径消费。

3. **跨调用前缀防串** — 占位清扫改用 `isOwnedToolCallId`（精确匹配或
   `{id}::m\d+` 锚定后缀），`tc_9` 的结算不再误伤 `tc_9extra` 这类共享前缀、
   属于其他工具调用的消息。

4. **等待期限与陈旧结果** — `heteroAwaitBuiltinToolChildren` 接受
   `waitDeadlineMs`（CLI 侧 `CHILD_WAIT_BUDGET_MS` 按剩余预算逐轮下传）。首个
   pending 接触时在自有占位上盖 `awaitStartedAt`（跨重连存活）；超期后占位落
   `status:'error', waitDeadlineExceeded:true` 并返回 `timeout`，供人工 / 门禁处理。
   迟到的 bridge 回调遇到 "已终态且非本事件键" 的占位时识别为 superseded：跳过
   回填（不覆盖死线结算），但仍以 `delivered:true` + `superseded` 记入账本并继续
   尝试 CAS 恢复，保证审计面完整。
