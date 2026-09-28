# ACP 执行注册表边界收敛

> 对应 P07（ACP driver 与宿主边界收敛）。`packages/heterogeneous-agents/src/registry.ts`
> 由单一适配器表拆为两个互斥注册表。

## 拆分

- **Live registry**（`createLiveAdapter` / `listLiveAgentTypes`）：仅含 ACP 适配器 ——
  本地 agent 类型的参数化 `TraeAcpAdapter`，以及 `cursor-acp`/`droid-acp` 等传输键上的
  专用 ACP 适配器。`AgentStreamPipeline` 只从这里解析适配器。
- **Historical decoder registry**（`createTraceDecoder` / `listTraceDecoderTypes`）：
  `cursor`（legacy `CursorAdapter`）与 `claude-code-sdk`（`ClaudeCodeSdkAdapter`），
  仅供归档 stream-json 回放与测试解析。

`createLiveAdapter` 对 decoder 键抛「historical trace decoder」错误而非创建实例 ——
历史解析器无法经由活跃工厂启动；`listLiveAgentTypes()` 不暴露任何 decoder 键，两者
不相交由 `registry.test.ts` 钉死。

## 既有不变量（本 PR 未改动，仅核对）

- 本地 agent 全部经 ACP：桌面宿主逐类型实例化 `*AcpSession`；`cursor` 用户类型走
  `cursor-acp` 传输；CLI `hetero exec` 与云端 `spawnHeteroSandbox` 同样落到 ACP 会话。
- 能力协商：`session/load` 需 `agentCapabilities.loadSession === true` 否则抛错；
  `promptCapabilities.image !== true` 时剥离图像（unknown ⇒ 不支持，见
  `standardAcpSession.ts` / `cursorAcpSession.ts` / `droidAcpSession.ts` /
  `devinAcpSession.ts`）。
- 无 direct-LLM / 旧引擎回退：进程内 model loop 已在 P02 删除；远端通知路径经设备
  gateway 落到同一 ACP 宿主代码。
- `listLocalAgentTypes()` 仍含 `cursor`：它是可选的本地描述符（descriptor catalog
  一致性测试不变），其活跃会话由 `cursor-acp` 传输承载。

## 回滚边界

`cursor`/`claude-code-sdk` 解码器仍被测试与归档回放消费，不能删除；若未来无回放
需求再单独退役。
