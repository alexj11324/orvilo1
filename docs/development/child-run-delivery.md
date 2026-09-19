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
