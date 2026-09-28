import { getModelPropertyWithFallback } from '@orvilo/model-runtime/getModelPropertyWithFallback';
import { uniqBy } from 'es-toolkit/compat';
import type {
  AiFullModelCard,
  EnabledAiModel,
  ModelAbilities,
  OrviloDefaultAiModelListItem,
  Pricing,
} from 'model-bank';
import { isAiModelVisible } from 'model-bank/aiModel';
import { type SWRResponse } from 'swr';

import { useClientDataSWR } from '@/libs/swr';
import { type AiInfraStore } from '@/store/aiInfra/store';
import { type StoreSetter } from '@/store/types';
import {
  type AiProviderRuntimeConfig,
  AiProviderSourceEnum,
  type EnabledProvider,
  type EnabledProviderWithModels,
} from '@/types/aiProvider';

export type ProviderModelListItem = {
  abilities: ModelAbilities;
  contextWindowTokens?: number;
  description?: string;
  displayName: string;
  id: string;
  knowledgeCutoff?: string;
  pricing?: Pricing;
  releasedAt?: string;
};

type ModelNormalizer = (model: EnabledAiModel) => Promise<ProviderModelListItem>;

const getModelProperty = async <T>(
  model: EnabledAiModel,
  propertyName: keyof AiFullModelCard,
): Promise<T | undefined> => {
  const inlineValue = (model as Partial<AiFullModelCard>)[propertyName];
  if (inlineValue !== undefined) return inlineValue as T;

  return getModelPropertyWithFallback<T | undefined>(model.id, propertyName, model.providerId);
};

const dedupeById = (models: ProviderModelListItem[]) => uniqBy(models, 'id');

const createProviderModelCollector = (
  type: EnabledAiModel['type'],
  normalizer: ModelNormalizer,
) => {
  return async (enabledAiModels: EnabledAiModel[], providerId: string) => {
    const filteredModels = enabledAiModels.filter(
      (model) => model.providerId === providerId && model.type === type && isAiModelVisible(model),
    );

    if (!filteredModels.length) return [];

    const normalized = await Promise.all(filteredModels.map((model) => normalizer(model)));
    return dedupeById(normalized);
  };
};

const normalizeChatModel = async (model: EnabledAiModel): Promise<ProviderModelListItem> => {
  const [description, knowledgeCutoff, pricing] = await Promise.all([
    getModelProperty<string>(model, 'description'),
    getModelProperty<string>(model, 'knowledgeCutoff'),
    getModelProperty<Pricing>(model, 'pricing'),
  ]);

  return {
    abilities: (model.abilities || {}) as ModelAbilities,
    contextWindowTokens: model.contextWindowTokens,
    displayName: model.displayName ?? '',
    id: model.id,
    releasedAt: model.releasedAt,
    ...(description && { description }),
    ...(knowledgeCutoff && { knowledgeCutoff }),
    ...(pricing && { pricing }),
  };
};

const getChatModelList = createProviderModelCollector('chat', async (model) =>
  normalizeChatModel(model),
);

const buildProviderModelLists = async (
  providers: EnabledProvider[],
  enabledAiModels: EnabledAiModel[],
  collector: (
    enabledAiModels: EnabledAiModel[],
    providerId: string,
  ) => Promise<ProviderModelListItem[]>,
) => {
  return Promise.all(
    providers.map(async (provider) => ({
      ...provider,
      children: await collector(enabledAiModels, provider.id),
      name: provider.name || provider.id,
    })),
  );
};

const buildChatProviderModelLists = async (
  providers: EnabledProvider[],
  enabledAiModels: EnabledAiModel[],
) => buildProviderModelLists(providers, enabledAiModels, getChatModelList);

interface ModelCatalogState {
  aiProviderRuntimeConfig: Record<string, AiProviderRuntimeConfig>;
  builtinAiModelList: OrviloDefaultAiModelListItem[];
  enabledAiModels: EnabledAiModel[];
  enabledChatModelList: EnabledProviderWithModels[];
}

const MODEL_CATALOG_SWR_KEY = 'aiInfra/modelCatalog';

type Setter = StoreSetter<AiInfraStore>;
export const createAiInfraSlice = (set: Setter, get: () => AiInfraStore, _api?: unknown) =>
  new AiInfraActionImpl(set, get, _api);

export class AiInfraActionImpl {
  readonly #set: Setter;

  constructor(set: Setter, get: () => AiInfraStore, _api?: unknown) {
    void _api;
    void get;
    this.#set = set;
  }

  /**
   * Loads the static model catalog (model-bank cards + provider cards) into the
   * store. There is no server-side provider runtime anymore — builtin catalog
   * data is the whole source of truth — so this resolves identically for
   * logged-in and logged-out sessions.
   */
  useInitModelCatalog = (): SWRResponse<ModelCatalogState> => {
    return useClientDataSWR<ModelCatalogState>(
      MODEL_CATALOG_SWR_KEY,
      async () => {
        const [{ loadModels }, { DEFAULT_MODEL_PROVIDER_LIST }] = await Promise.all([
          import('@/business/client/model-bank/loadModels'),
          import('model-bank/modelProviders'),
        ]);

        const builtinAiModelList = await loadModels();
        const enabledAiModels = builtinAiModelList.filter((m) => m.enabled);

        const enabledProviders: EnabledProvider[] = DEFAULT_MODEL_PROVIDER_LIST.filter(
          (provider) => provider.enabled,
        ).map((item) => ({ id: item.id, name: item.name, source: AiProviderSourceEnum.Builtin }));

        const providersWithType = (type: EnabledAiModel['type']) =>
          enabledProviders.filter((provider) =>
            builtinAiModelList.some(
              (model) => model.providerId === provider.id && model.type === type,
            ),
          );

        const aiProviderRuntimeConfig = Object.fromEntries(
          enabledProviders.map((provider) => [
            provider.id,
            {
              config: {},
              keyVaults: {},
              settings:
                DEFAULT_MODEL_PROVIDER_LIST.find((item) => item.id === provider.id)?.settings ?? {},
            } satisfies AiProviderRuntimeConfig,
          ]),
        );

        const enabledChatModelList = await buildChatProviderModelLists(
          providersWithType('chat'),
          enabledAiModels,
        );

        return {
          aiProviderRuntimeConfig,
          builtinAiModelList,
          enabledAiModels,
          enabledChatModelList,
        };
      },
      {
        onSuccess: (data) => {
          if (!data) return;

          this.#set(
            {
              ...data,
              isInitAiProviderRuntimeState: true,
            },
            false,
            'useInitModelCatalog',
          );
        },
      },
    );
  };
}

export type AiInfraAction = Pick<AiInfraActionImpl, keyof AiInfraActionImpl>;
