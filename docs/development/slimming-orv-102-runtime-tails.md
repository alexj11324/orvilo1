# Slimming 04 — Legacy model/agent runtime residual tails (ORV-102)

Continuation of the ORV-101 Provider/BYOK retirement. After the product surface
was removed, a layer of BYOK-era server plumbing remained in place even though
nothing reachable could still configure it. This note records what was verified
and what was deleted.

## Verification: ACP is the only production execution path

- Production agent execution resolves through `agentExecution` → ACP gateway /
  in-process agent runtime (`initModelRuntimeFromDeploymentConfig`). No
  production path instantiates a provider runtime from per-user credentials.
- The only surviving user-payload initializer is
  `initModelRuntimeWithUserPayload`, and every remaining call site passes a
  deployment-built payload (`{ runtimeProvider }` from
  `initModelRuntimeFromDeploymentConfig`, or the `webapi/chat/[provider]` route
  used by auxiliary calls such as title generation and translation). There is
  no code path that decrypts user `keyVaults` from `ai_providers` rows anymore.

## Deleted residuals

- `src/services/aiProviderAccess` (+ test): the compat shell that filtered
  builtin providers/models by user-hidden state. All business stubs returned
  `[]`/`{}`, and no consumer read the `hiddenBuiltinModels` /
  `modelRedirects` / `hiddenBuiltinModelsResolved` fields it produced.
- `src/utils/aiProvider`: `filterHiddenBuiltinModels`,
  `filterHiddenProviderModels`, `filterEnabledProvidersByModelType` — only
  consumed by the deleted shell.
- `packages/business-server/src/aiProvider`: empty stub exports
  (`getHiddenBuiltinModelsForUser`, `getModelRedirects`).
- `packages/database/src/models/aiModel` + `aiProvider` (+ tests):
  `AiModelModel` / `AiProviderModel` had no remaining callers after the
  user-row merge was removed from `AiInfraRepos`. The `ai_providers` /
  `ai_models` schemas and tables remain inert history; their schema/migration
  removal is owned by ORV-108.
- `packages/database/src/repositories/aiInfra/__tests__/getAiProviderDetail`:
  `getAiProviderDetail` (a per-user detail merge) is deleted with them.
- `packages/model-bank/src/types/aiProvider.ts`: the dead
  `BuiltinModelIdentifier` interface and the retired
  `AiProviderRuntimeState` fields (`hiddenBuiltinModels`, `modelRedirects`,
  `hiddenBuiltinModelsResolved`).
- `apps/server/src/modules/ModelRuntime`: `buildPayloadFromKeyVaults`
  (BYOK keyVault → payload mapping incl. the per-provider switch),
  `ProviderKeyVaults`/`EMPTY_KEY_VAULTS`, and the dead `resolveServerModel`
  helper chain (`getEnabledServerChatModels` / `findEnabledServerChatModel` /
  `toServerModelSelection`). `initModelRuntimeFromDeploymentConfig` now builds
  its payload directly as `{ runtimeProvider: provider }`.
- `toolExecution` `memoryEmbeddingRuntime` seam
  (`serverRuntimes/memory.ts` + `types.ts`): an injection slot that no
  non-test code ever set; memory search now always uses the deployment
  embedding runtime via `initModelRuntimeFromDeploymentConfig`.

## `AiInfraRepos` is now catalog-only

Constructor is `(providerConfigs)` — no database handle, no user/workspace
scope. Semantics:

- `getAiProviderList` / `getUserEnabledProviderList`: builtin
  `DEFAULT_MODEL_PROVIDER_LIST` order; `enabled` comes from deployment
  `providerConfigs` only.
- `getEnabledModels` / `getAiProviderModelList`: builtin catalog models of
  deployment-enabled providers; the user-row merge, `BRANDING_PROVIDER`
  residual filter, preference-only-row filter, and `stt→asr` DB normalization
  are gone. Builtin search-settings injection (`injectSearchSettings`) is
  retained.
- `getAiProviderRuntimeState`: `runtimeConfig` now carries stub entries for
  enabled providers (matching the client's `useInitModelCatalog` shape);
  nothing on the server reads it — provider matching runs on
  `enabledAiModels` via `tryMatchingProviderFrom`, and credentials resolve
  from deployment env inside `getParamsFromPayload`.

`fetchBuiltinModels` still honors `providerConfigs[id].serverModelLists` so a
deployment can pin an explicit model list.

## Deliberately kept (not tails)

- `packages/model-runtime`: the runtime engine is the sanctioned server LLM
  client (ACP/memory/verify/aiGeneration all call through it). ORV-102 removes
  residuals _around_ it, not the engine.
- `webapi/chat/[provider]` + `initModelRuntimeWithUserPayload`: live path for
  auxiliary server-side LLM calls (title generation, translation, memory,
  preset task results) with deployment credentials.
- `parseModels` / `genServerAiProviderConfig`: live deployment-config parsing.

## Validation

- Repo-wide `tsgo` typecheck: clean.
- `bun run check`: 21 files, lint clean, 110 related tests passed.
