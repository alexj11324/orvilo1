# ORV-107 — Refactor Conversation into ACP control/presentation layer

Linear: ORV-107 ("Refactor Conversation into ACP control/presentation layer").

Closes the last client-side escape hatch to the model runtime: every preset-task
LLM call that used to stream through `chatService` → `POST /webapi/chat/[provider]`
now runs as an ACP-bound `aiChat.outputJSON` judgment (`aiChatService.generateJSON`).
With all callers migrated, the client chat service, its webapi route, the parallel
client-side `mecha` copy, and the frozen-call replay tooling that depended on that
transport are deleted.

## Migrated (preset tasks → `aiChatService.generateJSON`)

All calls resolve `model`/`provider` via `agentByIdSelectors.getAgentModelById` /
`getAgentModelProviderById` (DEFAULT\_\* fallbacks), pass a chain-produced
`{ messages }` payload plus a strict JSON schema, and carry tracing metadata
(`agentId`, `topicId`, `promptVersion`, `scenario`, `schemaName`).

| Caller                                              | Chain                                                                                    | New scenario / schema                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `translateMessage` (translate slice)                | `chainLangDetect` → `chainTranslate`                                                     | `LangDetect` / `LANG_DETECT_JSON_SCHEMA`, `MessageTranslate` / `TRANSLATE_JSON_SCHEMA` |
| `internal_summaryHistory` (agentRun memory)         | `chainSummaryHistory`                                                                    | `HistorySummary` / `SUMMARY_HISTORY_JSON_SCHEMA`                                       |
| compression step in `conversationLifecycle`         | `chainCompressContext`                                                                   | `ContextCompress` / `COMPRESS_CONTEXT_JSON_SCHEMA`                                     |
| Agent meta autocompletions (AgentSetting store)     | `chainPickEmoji`, `chainSummaryDescription`, `chainSummaryTags`, `chainSummaryAgentName` | `AgentMeta` / per-task `*_JSON_SCHEMA`                                                 |
| `analyzeMedia` (builtin-tool-orvilo-agent executor) | `buildAnalyzeMediaContent` (multimodal parts)                                            | `MediaAnalysis` / `MEDIA_ANALYSIS_JSON_SCHEMA`                                         |
| `apps/cli generate text`                            | none — direct `outputJSON` tRPC mutation                                                 | `cli_generate_text` / `CLI_TEXT_SCHEMA`; new `--agent <id>` flag supplies the binding  |

Notes:

- Structured output is non-streaming: translate drops progressive stream updates
  (single `updateMessageTranslate` write), compression reads `data.summary`,
  meta autocompletions apply the parsed value in one shot.
- `outputJSON` takes no `temperature`/`max_tokens`/`stream`; chains that emitted
  them were narrowed to `{ messages: OpenAIChatMessage[] }`.
- `TRACING_SCENARIOS` gained `AgentMeta`, `ContextCompress`, `HistorySummary`,
  `LangDetect`, `MediaAnalysis`, `MessageTranslate`.

## Deleted

- `src/services/chat/` — `index.ts` (`chatService`), `types.ts`, `helper.ts`
  and their tests; the client-side `mecha/` parallel copy
  (`agentConfigResolver`, `contextEngineering`, `memoryManager`,
  `modelParamsResolver`, `skillEngineering`, `toolSetComposer`,
  `orviloSkillPlaceholders.test`, `index.ts`).
- `src/app/(backend)/webapi/chat/[provider]/route.ts` + test — the last
  unenumerated model-runtime hole under `acpJudgmentGuards.test.ts`.
- `packages/agent-tracing/src/replay/` (judge, payload, replayFrozenCall,
  replayTrajectory, trajectory + tests) and `src/cli/replay.ts`;
  `apps/cli trace op replay` — frozen-call replay cannot be expressed over
  tool-free `outputJSON` and its only transport was the deleted route.
- `docs/development/basic/chat-api(.zh-CN).mdx` — documented the deleted route.
- CLI `generate text` flags that `outputJSON` cannot express (`--stream`,
  `--temperature`, `--max-tokens`).
- `API_ENDPOINTS.chat` in `src/services/_url.ts`.

## Kept

- `src/services/chat/mecha/{skillPreload,toolPreload}.ts` — still imported by
  `conversationLifecycle` for prompt assembly.
- `webapi/tts/openai` — uses `createBizOpenAI` deployment credentials, not the
  per-user BYOK path (out of scope).
- `packages/agent-tracing/src/goal/replay.ts` (`replayGoalTrajectory`) — separate
  domain module unrelated to the deleted transport.
- `src/proxy.test.ts` `/webapi/chat` entry — asserts the path prefix does NOT
  match the SPA proxy; still true and harmless.
- `e2e/src/mocks/llm` browser interceptor for `/webapi/chat/*` — residual dead
  mock; the gateway-mode runtime no longer uses the browser path.

## Verification

- `bun run check` over all 39 touched files: lint clean, 283 tests passed.
- `bunx tsgo --noEmit`: zero new errors attributable to this change (remaining
  repo errors are stack collateral fixed on their introducing branches plus
  pre-existing baseline noise).
- `acpJudgmentGuards` still passes — with `webapi/chat/[provider]` gone there is
  no server-side path that invokes the model runtime outside
  `runAcpJudgment` / the enumerated `basic` exceptions.

## Follow-ups

- `docs/development/acp-judgment-closure.md` lists `webapi/chat/[provider]` in
  its residual table — superseded by this change (route deleted).
- ORV-108 owns the drizzle table drops for the retired generation/messenger
  schema (still present by design).
