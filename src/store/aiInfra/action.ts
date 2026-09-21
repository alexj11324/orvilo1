import { getModelPropertyWithFallback } from '@orvilo/model-runtime/getModelPropertyWithFallback';
import { resolveImageSinglePrice } from '@orvilo/model-runtime/resolveImageSinglePrice';
import { uniqBy } from 'es-toolkit/compat';
import type {
  AiFullModelCard,
  EnabledAiModel,
  ModelAbilities,
  ModelParamsSchema,
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
  approximatePricePerImage?: number;
  contextWindowTokens?: number;
  description?: string;
  displayName: string;
  id: string;
  knowledgeCutoff?: string;
  parameters?: ModelParamsSchema;
  pricePerImage?: number;
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

const hasParameters = (parameters?: ModelParamsSchema): parameters is ModelParamsSchema =>
  !!parameters && Object.keys(parameters).length > 0;

const resolveModelParameters = async (
  model: EnabledAiModel,
): Promise<ModelParamsSchema | undefined> => {
  // The `parameters` column defaults to `{}`. An empty object is truthy, so a
  // naive truthy check would skip the fallback and leave required fields
  // missing. Treat an empty object as "no inline parameters".
  if (hasParameters(model.parameters)) return model.parameters;

  return getModelPropertyWithFallback<ModelParamsSchema | undefined>(
    model.id,
    'parameters',
    model.providerId,
  );
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

const normalizeImageModel = async (model: EnabledAiModel): Promise<ProviderModelListItem> => {
  const [parameters, pricing, description] = await Promise.all([
    resolveModelParameters(model),
    getModelProperty<Pricing>(model, 'pricing'),
    getModelProperty<string>(model, 'description'),
  ]);

  const { price, approximatePrice } = resolveImageSinglePrice(pricing);

  return {
    abilities: (model.abilities || {}) as ModelAbilities,
    contextWindowTokens: model.contextWindowTokens,
    displayName: model.displayName ?? '',
    id: model.id,
    releasedAt: model.releasedAt,
    ...(parameters && { parameters }),
    ...(description && { description }),
    ...(pricing && { pricing }),
    ...(typeof approximatePrice === 'number' && { approximatePricePerImage: approximatePrice }),
    ...(typeof price === 'number' && { pricePerImage: price }),
  };
};

const getChatModelList = createProviderModelCollector('chat', async (model) =>
  normalizeChatModel(model),
);

const getImageModelList = createProviderModelCollector('image', normalizeImageModel);

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

const buildImageProviderModelLists = async (
  providers: EnabledProvider[],
  enabledAiModels: EnabledAiModel[],
) => buildProviderModelLists(providers, enabledAiModels, getImageModelList);

interface ModelCatalogState {
  aiProviderRuntimeConfig: Record<string, AiProviderRuntimeConfig>;
  builtinAiModelList: OrviloDefaultAiModelListItem[];
  enabledAiModels: EnabledAiModel[];
  enabledChatModelList: EnabledProviderWithModels[];
  enabledImageModelList: EnabledProviderWithModels[];
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

        const [enabledChatModelList, enabledImageModelList] = await Promise.all([
          buildChatProviderModelLists(providersWithType('chat'), enabledAiModels),
          buildImageProviderModelLists(providersWithType('image'), enabledAiModels),
        ]);

        return {
          aiProviderRuntimeConfig,
          builtinAiModelList,
          enabledAiModels,
          enabledChatModelList,
          enabledImageModelList,
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
