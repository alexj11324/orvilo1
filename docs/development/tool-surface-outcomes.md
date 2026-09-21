# 工具装配结果契约（tool surface outcomes）

> 对应 P09（聊天工具、附件与审批闭环）中的装配契约部分。

## 语义

`resolveRunToolSurface`（`apps/server/src/services/aiAgent/pipeline/runToolSurface.ts`）
对每个请求的工具 id 产出一条 `ToolSurfaceOutcome`：

| status         | 含义                                                        | 现有 reason 例                                                                       |
| -------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `mounted`      | 工具 spec 已挂到宿主 per-run MCP /skill 以指令形式下发      | `''`（`kind` 区分 `tool`/`skill`）                                                   |
| `unsupported`  | 该 harness / 链路上不可调用                                 | `harness-cannot-mount-mcp` `no-server-runtime` `no-api-surface` `no-server-executor` |
| `unauthorized` | 策略拒绝（agent 禁用、chat 模式 allowlist、运行级开关压制） | `disabled-by-agent-config` `not-in-chat-mode-allowlist` `suppressed-by-run-config`   |
| `failed`       | 解析该 identifier 抛错                                      | 原始错误消息                                                                         |

## 不变量

- **无静默丢弃**：过去丢弃只进 debug log；现在每条 outcome 随
  `dispatchHeteroAgent` 写入 `agent_operations.metadata.toolSurface`，trace 可查。
- **必需工具失败禁止执行**：`exclusivePluginIds`（必需面）若声明了内置工具
  而无一挂载成功，`resolveRunToolSurface` 直接抛错 —— 如验收证据收集
  （`orvilo-acceptance-evidence`）、goal supervisor 这类「没有该工具
  这次运行就无意义」的调用方不再降级跑空。
- `disableTools` 整面关闭时 outcomes 为空数组（没产出任何请求处理）。
- secret 不出边界：outcome 只含 identifier / 状态 / 原因，不携带凭据。

## 验证

`apps/server/src/services/aiAgent/__tests__/runToolSurface.test.ts` 的
`outcomes` describe：mounted（tool+skill）、unsupported（非内置 /
harness 不可挂）、unauthorized（disabled set 拦截显式选中）、
exclusive 全丢 → throw、disableTools → 空 outcomes。
