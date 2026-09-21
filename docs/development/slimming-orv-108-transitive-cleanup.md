# Slimming 09 — Transitive backend/data cleanup (ORV-108)

Closure sweep over the server/data layer after the capability retirements in
ORV-101…107. Everything that was kept as "inert history" during the earlier
passes is now physically removed from the schema, and the last runtime readers
were repointed at the deployment catalog.

## Dropped tables (migration `0185_drop_retired_capability_tables.sql`)

Nine tables whose schemas were already dead code — every backend writer and
reader was deleted in the earlier issues. All `DROP TABLE IF EXISTS … CASCADE`
(guards `0185_meta`, `_journal` and the regenerated `database-schema.dbml`
reflect this):

- `ai_providers`, `ai_models` — BYOK user/provider model rows. Inert since
  ORV-102 made `AiInfraRepos` catalog-only.
- `agent_bot_providers`, `system_bot_providers`, `messenger_installations`,
  `messenger_account_links` — Messenger/IM adapter stack (ORV-105).
- `generations`, `generation_batches`, `generation_topics` — ComfyUI/artwork
  generation stack (ORV-106).

Kept intentionally: `acceptance_flows`/`_nodes`/`_edges` + `acceptance_comments`
(live lambda `acceptance*` routers + models), `agent_skills`, eval tables,
connectors. Old production migrations were not rewritten — this is a forward
migration.

## Deleted schema surface

- `packages/database/src/schemas/{aiInfra,generation,messengerAccountLink,
messengerInstallation,agentBotProvider,systemBotProvider}.ts` and their
  `index.ts` re-exports.
- `relations.ts`: the `generations`/`generationBatches`/`generationTopics`
  relation blocks and the `generation` edge inside `filesRelations`.
- `idGenerator.ts`: the `gb`/`gt`/`gen` prefixes.
- `dataExporter`: `aiProviders`/`aiModels` entries in `baseTables`;
  `dataImporter` test updated to assert the tables are simply absent from an
  export (they were already unmapped).

## OpenAPI model endpoints serve the deployment catalog

`packages/openapi/src/services/model.service.ts` no longer queries the dropped
`ai_models` table. `GET /api/v1/models` + `GET /api/v1/models/:provider` now
read `AiInfraRepos` built from `getServerGlobalConfig().aiProvider` (the same
`enabled ?? false` normalization as `goalReviewModelConfig`), then filter
keyword/provider/type/enabled in memory and paginate. This matches the route's
documented "deployment-owned model catalog" contract.

Permission plumbing in `base.service.ts` lost the `targetProviderId(s)` /
`targetModelId(s)` workspace-scoped branches (they only resolved rows that no
longer exist; the `default` path returns the same owner-check outcome), and
`TTarget`/`TBatchTarget` dropped the matching keys.

## Also swept

- `packages/openapi/src/types/model.type.ts`: `MODEL_TYPES` reduced to the
  surviving `AiModelTypeSchema` set (chat/embedding/tts/asr/text2music/
  realtime); the `stt` input alias is preserved.
- `helpers/public-fields.ts`: `PublicModel` is now an explicit interface
  (was `Pick<AiModelSelectItem>`).
- `message.service.ts`: `as MessageItem` → `as unknown as MessageItem` —
  pre-existing baseline cast error, fixed here so the stack typechecks clean.

## Verified clean

- `bunx tsgo --noEmit` repo-wide: 0 errors.
- `bun run check` on the 14 touched files: lint clean, 68 related tests pass.
- No remaining references to any dropped table symbol outside migrations
  (remaining `generation`/`aiModels` hits are word collisions: ES index
  generations in ftsSearch, `AiModels` namespace in genServerAiProviderConfig).
- Webhooks (casdoor/logto/linear/memory-extraction), feature flags, queues/jobs
  and seeds contain no references to the retired capability tables.
