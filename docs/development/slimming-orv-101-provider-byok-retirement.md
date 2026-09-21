# Provider/BYOK surface retirement (ORV-101)

The user-managed LLM Provider / BYOK / baseURL / model-selection surface is
removed end-to-end. Orvilo's only model source is the static model-bank
catalog (`model-bank` + `@orvilo/business-model-bank/model-config`).

## Removed

- `lambda/aiModel` + `lambda/aiProvider` routers and their client services
  (`src/services/aiModel`, `src/services/aiProvider`).
- `src/features/ModelSwitchPanel` (panel, per-model reasoning sliders,
  detail panel, benchmark modal) and the feature `ModelSelect` pickers.
- All model/reasoning pickers in the wizards, agent/group profile editors,
  task detail, and `ChatInput` Params — plus the user-level
  `modelReasoningConfig` map and the topic-effort write machinery
  (`updateTopicModel`, `updateTopicReasoningConfig`, `updateTopicHetero*`,
  `updateTaskModelConfig`, `updateMemberAgentConfig`).
- `modelProvider` and `providers` locale namespaces and the
  `ModelSwitchPanel.*` / `ModelSelect.staleModel.*` keys.

## Kept (boundary)

- `src/store/aiInfra` is now a static catalog store: the same field names
  (`enabledAiModels`, `enabledChatModelList`, `enabledImageModelList`,
  `aiProviderRuntimeConfig`, `isInitAiProviderRuntimeState`) are populated
  once by `useInitModelCatalog()` (mounted in `DeferredStoreInitialization`),
  so capability selectors (`isModelSupport*`, `modelExtendParams`,
  `isModelHasBuiltinSearch`, …) and their \~40 consumers compile unchanged.
- The ActionBar Model chip and `CopilotModelSelect` render as read-only
  labels showing the effective model.
- The topic-scoped reasoning pin (`ChatTopicMetadata.reasoningConfig` /
  `heteroEffort`) keeps its server read path (`turnSetup.ts`); only the
  client write paths are gone. `resolveModelExtendParams` receives the pin
  via `topicReasoningConfig`.
- Server-side per-user provider data (`aiProviderAccess`, `AiInfraRepos`,
  `models/aiModel`, `business-server/aiProvider`) and generic connector
  credential infrastructure are untouched — owned by ORV-102 / ORV-108.
- `enabledImageModelList` stays until the image-generation stack is retired
  in ORV-106.
