# 执行引擎溯源

每条 agent 执行在 `agent_operations.metadata.executionEngine` 上记录其执行引擎，使 trace 能回答「这一步到底由哪条引擎跑的」。

## 取值

- `hetero`：异构 agent 通道（ACP 客户端调用外部 CLI agent）。
- `native-runtime`：仓库内的 `AgentRuntimeService.executeStep` 循环。

## 写入点

三个 `recordStart` 入口分别打标：异构 relay、server-default relay、`CompletionLifecycle` 转发。标注与调用方自带 metadata 合并，调用方字段不被覆盖。

## 范围说明

本改动是**举证层**而非迁移：它让每次执行的引擎归属可查询、可聚合，是后续完整 ACP 迁移的验收前提。`native-runtime` 仍存在的操作在 trace 中显式可见；把它们全部迁到 ACP 通道是独立的更大工程。
