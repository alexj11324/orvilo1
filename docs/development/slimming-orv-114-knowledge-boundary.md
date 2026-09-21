# ORV-114 — Knowledge/RAG 边界裁决与归类

## 裁决

原 `knowledge-rag` INVESTIGATE capability（54 文件）经 Codex Gate D 复核裁决为**保留**：

Knowledge/File-ingestion 不是死代码 —— `knowledgeBase` server runtime 已注册于 agent-tools，
`knowledge`/`knowledgeBase` lambda router 被 Agent/Project/Document 流程活消费，
`packages/file-loaders` 是 Document service、documentAccess、local-file-shell 与 OpenAPI file service
共用的解析管道。问题不在存废，在 ledger 分类错误。

## 拆分结果

| 新 capability                  | disposition       | 范围                                                                                                                                                                         |
| ------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `knowledge-context`            | KEEP              | `routers/lambda/{knowledge,knowledgeBase}.ts`、`__tests__/knowledgeBase.test.ts`、`_helpers/knowledgeBaseAccess.ts`、`services/{knowledgeBase,knowledgeBaseAccess,chunk}/**` |
| `file-ingestion`               | KEEP              | `packages/file-loaders/**`                                                                                                                                                   |
| `conversation-surface`（增补） | REWRITE\_FOR\_ACP | `routers/lambda/asr.ts` —— 唯一消费者是 `src/features/ChatInput/Dictation`（语音输入）+ `routers/lambda/index.ts` 注册                                                       |

`DataImporter`（8 文件）从 Knowledge glob 中拆除，专属 `data-portability` ——
此前的 KEEP/INVESTIGATE disposition 冲突来源即此重叠。

## census 工具变更

- 新增 `conflictingDispositionFiles[]` 输出字段：凡一文件被不同 disposition 的
  capability 同时命中（此前被 DELETE>INVESTIGATE>REWRITE>KEEP 静默优先序吞掉），
  逐文件列出 `capabilities` + `dispositions`。
- `--check` 对 conflictingDispositionFiles 非空 fail-closed（exit 1），
  并与 DELETE-unexplained-inbound 并列打印。
- `CENSUS.md` 增加 “Conflicting dispositions” 段落。

本 PR 落地时该字段计数为 0；若未来 ledger 再产生跨 disposition 重叠，CI 会直接红。

## 运行时不变量（已有测试锚点，全部保留）

- `serverRuntimes/__tests__/registry.test.ts` —— `knowledgeBaseRuntime` 注册断言。
- `routers/lambda/__tests__/knowledgeBase.test.ts` —— workspace permission + KB 增删改查。
- `services/{knowledgeBase,knowledgeBaseAccess,chunk}/index.test.ts` —— 管道行为。
- 顺带修复该测试里 `import()` type annotation 的 `consistent-type-imports` lint 违例。

## 验证

- `node scripts/slimming/census.mjs --check` → exit 0；conflicting dispositions = 0。
- `bun run check`（census.mjs + knowledgeBase.test.ts）→ lint clean、14 tests pass。
- knowledge-rag capability 从 boundary.json 移除，INVESTIGATE 总数随 ORV-115 归零。
