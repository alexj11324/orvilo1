# P19 — 退役与共享能力保留门禁（retirement /parity guards）

> 编号：P19 ｜ 依赖：P04、P05、P06、P09、P10、P17、P18
> 目标：用**可证伪**的测试门禁防止已退役功能复活、同时保护必须保留的共享能力不被误删。

## 设计原则

1. **门禁断言结构，不只是 grep 零命中**。每条规则扫描生产源码文本，命中即给出文件名 + 退役原因（为什么这个标识符属于已退役面）。零命中单独不可信 —— 因此每个守卫文件自带 falsifiability 套件：向扫描器注入一段违规源码，断言它确实转红；注入干净源码，断言不误伤。
2. **三层覆盖**：
   - `packages/heterogeneous-agents/src/retirementGuard.test.ts` — ACP host 包内：provider binding /server-default/quota 注入不得复活；`lobehub`/`LobeHub` 第一方字面量不得回潮；`@orvilo/agent-runtime` 及旧引擎类型不得被引入。
   - `apps/server/src/retirementGuards.test.ts` — 服务端：agentQuota 九个已退役 procedure 不得重新注册（七个观测面 procedure 必须保留）；`aiProviders`/`aiModels` 不得回到 `IMPORT_TABLE_CONFIG`；P05 删除的 10 个 OpenAPI 直连模型模块文件不得复活、路由 index 不得重新注册；`HeteroOperationCapability` 授权 union 不得回收 `model:invoke`（兼容读字面量恰允许出现一次）。
   - `src/retirementParity.test.ts`（app project）— 跨模块共享能力保留：run 级验收证据工具注册（HS-14 关键保留）、ACP 事件词表完整（stream/tool/step/runtime\_end/error）、`session/request_permission` + `elicitation/create` + `session/cancel` 接线在位、任务验收查询消费者（`verify.ts`）、三条 hetero 传输路径（桌面 / 绑定设备 / 云端 sandbox 派发）。
3. **例外白名单集中**：
   - `@lobehub/` 包名与 `@lobehub/icons` 依赖说明符合法（指上游依赖，非我方 harness 身份）—— 品牌规则只命中引号紧贴的 `'lobehub` 与 `\bLobeHub\b`。
   - `internalJwt.ts` 中 `'model:invoke'` 兼容字面量恰一次（已签发 token 在 TTL 内仍可 verify）—— 用 `toHaveLength(1)` 而不是禁止出现，防「再注册一个 producer」同时不杀合法兼容窗口。
   - `heteroSessionBindingKey` 兼容元数据、`LOBE_*_ACP_COMMAND` 双读 env（大写）继续合法。
4. **本 PR 只补跨模块边界**。各退役 PR 自带的行为测试（P05 路由校验、P06 观测面、P09 装配、P16 围栏、P18 契约）不在这里重复。

## 附带修复

`spawnAgent.ts` 标准 ACP spawn 路径残留的 `clientVersion: 'lobehub-cli'` → `'orvilo-cli'`（与四条兄弟调用一致），由包内品牌守卫锁定。

## 验证

- `cd packages/heterogeneous-agents && bunx vitest run src/retirementGuard.test.ts` — 6 通过（含 falsifiability 注入转红 / 干净回绿）。
- `bunx vitest run apps/server/src/retirementGuards.test.ts src/retirementParity.test.ts` — 44 通过。
- `bun run check` — 对变更文件 lint + related tests 全绿。

## 门禁破坏样例（每项注入后预期转红）

| 注入                                                     | 守卫                        |
| -------------------------------------------------------- | --------------------------- |
| `import './providerBinding'` 进包源码                    | hetero retirement guard     |
| `clientInfo: { name: 'lobehub' }`                        | 品牌守卫                    |
| agentQuota 重新注册 `createAccount`                      | server quota procedure 守卫 |
| `aiProviders` 回 `IMPORT_TABLE_CONFIG`                   | importer 守卫               |
| `HeteroOperationCapability` union 加回 `'model:invoke'`  | capability grant 守卫       |
| `lambdaRouter` 丢掉 `connector`/`acceptance`/`verify`    | parity 注册守卫             |
| `builtinToolIdentifiers` 丢 `AcceptanceEvidenceManifest` | parity 证据工具守卫         |
