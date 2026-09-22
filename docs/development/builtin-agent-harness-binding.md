# 内置 Agent 的 Harness 绑定不变量

> 对应 `fix/inbox-agent-harness-binding`。背景：退役整改后所有派发都走
> `heterogeneousProvider`/`gateway` 路由，任何没有 harness 绑定的 agent 在
> `agentDispatcher.selectRuntimeType` 处必然 `AGENT_BINDING_REQUIRED` —— 即
> 「存在但未绑定的内置 agent」从设计上不可能发生；一旦出现就是数据层写入缺口。

## 判据

内置 agent 的 harness 绑定在**创建时**经由 persist 配置选定，不允许后置补绑失败：

- `BuiltinAgentPersistConfig.agencyConfig`（`packages/builtin-agents/src/types.ts`）
  让内置 agent 在 persist 层声明自己的 `agencyConfig`。
- inbox 内置 agent 声明
  `heterogeneousProvider: { type: 'orvilo', engine: DEFAULT_ORVILO_ENGINE }`
  （`packages/builtin-agents/src/agents/inbox/index.ts`）—— 内置 `orvilo` harness
  没有自有二进制，借用所选引擎的 CLI（`claude-sdk`/`codex-app-server`）。

## 写入路径

`AgentModel.getBuiltinAgent` 是唯一的内置 agent 供应路径（惰性创建）：

1. **插入**：`agencyConfig` 取
   `withWorkspaceSelectionPolicyDefaults(persistConfig.agencyConfig)` —— 绑定随创建落库。
2. **读时自愈**：存量缺少 `heterogeneousProvider` 的内置行在下一次
   `getBuiltinAgent` 命中时从 `persistConfig.agencyConfig` 回填；已带绑定的行
   （如绑到 `codex-app-server` 的 workspace inbox）保持不动。
3. **sanitize 白名单**：`updateConfig` 的 inbox 收口点只剥**外部 CLI 类型**的
   `heterogeneousProvider`；`type: 'orvilo'` 是合法绑定予以保留。异构 model id
   的剥离规则不变。

## 影响面

- 「Migrate to Orvilo」（`EngineConfigCard` → `patchProvider({type:'orvilo'})`）
  依赖第 3 条才能写入 —— 之前无差别剥离会让该操作被静默吞掉。
- 回归钉：`src/models/__tests__/agent.test.ts` 覆盖创建带绑定、存量自愈、
  既有绑定不被覆盖、updateConfig 保留 `orvilo` 四类。
