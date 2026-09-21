import { loadModels } from '@orvilo/business-model-bank/model-config';
import type {
  AiProviderListItem,
  AiProviderRuntimeState,
  EnabledProvider,
  ProviderConfig,
} from '@orvilo/types';
import type { AIChatModelCard, AiProviderModelListItem, EnabledAiModel } from 'model-bank';
import { AiModelSourceEnum, isAiModelVisible, resolveModelSearchDefaultSettings } from 'model-bank';
import { DEFAULT_MODEL_PROVIDER_LIST } from 'model-bank/modelProviders';
import pMap from 'p-map';

const normalizeProvider = (provider: string) => provider.toLowerCase();

// Only inject settings during read; add or remove search-related fields in settings based on abilities.search
const injectSearchSettings = (providerId: string, item: any) => {
  const abilities = item?.abilities || {};

  // Model explicitly disables search capability: remove search-related fields from settings to prevent UI from showing built-in search
  if (abilities.search === false) {
    if (item?.settings?.searchImpl || item?.settings?.searchProvider) {
      const next = { ...item } as any;
      if (next.settings) {
        const {
          searchImpl: _searchImpl,
          searchProvider: _searchProvider,
          ...restSettings
        } = next.settings;
        next.settings = Object.keys(restSettings).length > 0 ? restSettings : undefined;
      }
      return next;
    }
    return item;
  }

  // Model explicitly enables search capability: add search-related fields to settings
  else if (abilities.search === true) {
    // If built-in (local) model already has either field, preserve it without overriding
    if (item?.settings?.searchImpl || item?.settings?.searchProvider) return item;

    // Otherwise use providerId + modelId
    const searchSettings = resolveModelSearchDefaultSettings(providerId, item.id);

    return {
      ...item,
      settings: {
        ...item.settings,
        ...searchSettings,
      },
    };
  }

  // Compatibility for legacy versions where database doesn't store abilities.search field
  return item;
};

/**
 * Deployment catalog for providers and models.
 *
 * User-managed providers/models (BYOK) are retired: persisted `ai_providers` /
 * `ai_models` rows are inert history and never read here. Enabled providers and
 * models come from `providerConfigs` (deployment `aiProvider` config) merged over
 * the builtin model-bank catalog.
 */
export class AiInfraRepos {
  private readonly providerConfigs: Record<string, ProviderConfig>;
  private modelBankModelsPromise?: ReturnType<typeof loadModels>;

  constructor(providerConfigs: Record<string, ProviderConfig>) {
    this.providerConfigs = providerConfigs;
  }

  /**
   * Builtin provider list in catalog order; `enabled` is deployment-managed.
   */
  getAiProviderList = async (): Promise<AiProviderListItem[]> => {
    return DEFAULT_MODEL_PROVIDER_LIST.map(
      (item) =>
        ({
          description: item.description,
          enabled: this.providerConfigs[item.id]?.enabled ?? false,
          id: item.id,
          name: item.name,
          source: 'builtin',
        }) as AiProviderListItem,
    );
  };

  /**
   * Enabled providers in catalog order.
   */
  getUserEnabledProviderList = async (): Promise<EnabledProvider[]> => {
    const list = await this.getAiProviderList();
    return list
      .filter((item) => item.enabled)
      .map((item): EnabledProvider => ({
        id: item.id,
        logo: item.logo,
        name: item.name,
        source: item.source,
      }));
  };

  /**
   * Builtin models of enabled providers, optionally filtered to enabled ones.
   */
  getEnabledModels = async (filterEnabled: boolean = true) => {
    const enabledProviders = await this.getUserEnabledProviderList();

    const builtinModelList = await pMap(
      enabledProviders,
      async (provider) => {
        const aiModels = await this.fetchBuiltinModels(provider.id);
        return (aiModels || [])
          .map<EnabledAiModel>((item) =>
            injectSearchSettings(provider.id, {
              ...item,
              abilities: item.abilities || {},
              providerId: provider.id,
            }),
          )
          .filter((item) => (filterEnabled ? item.enabled : true));
      },
      { concurrency: 10 },
    );

    return builtinModelList.flat().sort((a, b) => (a?.sort ?? Infinity) - (b?.sort ?? Infinity));
  };

  getAiProviderRuntimeState = async (): Promise<AiProviderRuntimeState> => {
    const [enabledAiProviders, allModels] = await Promise.all([
      this.getUserEnabledProviderList(),
      this.getEnabledModels(false),
    ]);

    const enabledAiModels = allModels.filter((model) => model.enabled);
    const enabledChatAiProviders = enabledAiProviders.filter((provider) => {
      return allModels.some((model) => model.providerId === provider.id && model.type === 'chat');
    });
    const enabledImageAiProviders = enabledAiProviders.filter((provider) => {
      return allModels.some((model) => model.providerId === provider.id && model.type === 'image');
    });
    const enabledVideoAiProviders = enabledAiProviders.filter((provider) => {
      return allModels.some((model) => model.providerId === provider.id && model.type === 'video');
    });

    const runtimeConfig = Object.fromEntries(
      enabledAiProviders.map((provider) => [
        provider.id,
        {
          config: {},
          keyVaults: {},
          settings:
            DEFAULT_MODEL_PROVIDER_LIST.find((item) => item.id === provider.id)?.settings ?? {},
        },
      ]),
    );

    return {
      enabledAiModels,
      enabledAiProviders,
      enabledChatAiProviders,
      enabledImageAiProviders,
      enabledVideoAiProviders,
      runtimeConfig,
    };
  };

  /**
   * Resolve the best provider for a given model.
   *
   * Matching pipeline:
   * 1) Build a map of provider -> enabled model ids (disabled models are ignored).
   * 2) Walk providers in priority order: preferred providers (if any) -> explicit fallback provider -> remaining providers that have enabled models.
   * 3) For each provider, look for an exact modelId match or any preferred model alias.
   * 4) If nothing matches, fall back to the configured provider (with a warning) or throw when no fallback exists.
   *
   * Handles:
   * - Preferred provider ordering (case-insensitive).
   * - Preferred model aliases.
   * - Disabled models are skipped.
   * - Missing matches: falls back when possible, otherwise surfaces an error.
   *
   * Edge cases to note:
   * - If preferredProviders are set, non-preferred providers are skipped unless they are also the explicit fallback.
   * - If fallbackProvider lacks enabled models, it is still returned (caller should ensure runtimeConfig has credentials).
   */
  static async tryMatchingProviderFrom(
    runtimeState: AiProviderRuntimeState,
    options: {
      fallbackProvider?: string;
      label?: string;
      modelId: string;
      preferredModels?: string[];
      preferredProviders?: string[];
    },
  ): Promise<string> {
    const { modelId, fallbackProvider, preferredModels, preferredProviders, label } = options;

    // Build a map of provider -> enabled model ids for quick membership checks; skip disabled models entirely
    const providerModels = runtimeState.enabledAiModels.reduce<Record<string, Set<string>>>(
      (acc, model) => {
        if (model.enabled === false) return acc;

        const providerId = normalizeProvider(model.providerId);
        acc[providerId] = acc[providerId] || new Set<string>();
        acc[providerId].add(model.id);

        return acc;
      },
      {},
    );

    // Normalize preferred providers so ordering is stable and comparisons are case-insensitive
    const normalizedPreferredProviders = (preferredProviders || [])
      .map(normalizeProvider)
      .filter(Boolean);

    // Provider search pipeline:
    // 1) iterate preferred providers (if given)
    // 2) fall back to the explicitly configured fallback provider
    // 3) consider any provider that has enabled models
    const providerOrder = Array.from(
      new Set(
        [
          ...normalizedPreferredProviders,
          fallbackProvider ? normalizeProvider(fallbackProvider) : undefined,
          ...Object.keys(providerModels),
        ].filter(Boolean) as string[],
      ),
    );

    // Candidate models include the requested modelId plus any preferred model aliases
    const modelTargets = new Set([modelId, ...(preferredModels || [])]);

    for (const providerId of providerOrder) {
      // If preferred providers are specified, skip non-preferred providers unless they are the explicit fallback
      if (
        normalizedPreferredProviders.length > 0 &&
        providerId !== normalizeProvider(fallbackProvider || '') &&
        !normalizedPreferredProviders.includes(providerId)
      ) {
        continue;
      }

      const models = providerModels[providerId];
      if (!models) {
        continue;
      }

      // Accept the first provider in order whose enabled models contain either the requested id or any preferred alias
      const match = Array.from(modelTargets).find((target) => models.has(target));
      if (match) {
        return providerId;
      }
    }

    if (fallbackProvider) {
      console.warn(
        `[ai-infra] no enabled provider found for ${label || 'model'} "${modelId}" (preferred ${preferredProviders}), falling back to server-configured provider "${fallbackProvider}".`,
      );
      return normalizeProvider(fallbackProvider);
    }

    throw new Error(
      `Unable to resolve provider for ${label || 'model'} "${modelId}". Check preferred providers/models configuration.`,
    );
  }

  getAiProviderModelList = async (
    providerId: string,
    options?: {
      enabled?: boolean;
      limit?: number;
      offset?: number;
      type?: string;
    },
  ) => {
    const defaultModels: AiProviderModelListItem[] =
      (await this.fetchBuiltinModels(providerId)) || [];

    let list = defaultModels
      .filter(isAiModelVisible)
      .map((m) => injectSearchSettings(providerId, m)) as AiProviderModelListItem[];

    if (typeof options?.enabled === 'boolean') {
      list = list.filter((m) => m.enabled === options.enabled);
    }

    if (options?.type) {
      list = list.filter((m) => m.type === options.type);
    }

    if (typeof options?.offset === 'number' || typeof options?.limit === 'number') {
      const offset = Math.max(0, options?.offset ?? 0);
      const limit = options?.limit;
      if (typeof limit === 'number') return list.slice(offset, offset + Math.max(0, limit));
      return list.slice(offset);
    }

    return list;
  };

  /**
   * Fetch builtin models from config
   */
  private getModelBankModels = () => {
    this.modelBankModelsPromise ??= loadModels();
    return this.modelBankModelsPromise;
  };

  private fetchBuiltinModels = async (
    providerId: string,
  ): Promise<AiProviderModelListItem[] | undefined> => {
    try {
      // use the serverModelLists as the defined server model list
      // fallback to empty array for custom provider
      const presetList =
        this.providerConfigs[providerId]?.serverModelLists ||
        (await this.getModelBankModels()).filter((model) => model.providerId === providerId);

      return (presetList as AIChatModelCard[]).map<AiProviderModelListItem>((m) => ({
        ...m,
        enabled: m.enabled || false,
        source: AiModelSourceEnum.Builtin,
      }));
    } catch (error) {
      console.error(error);
      // maybe provider id not exist
    }
  };
}
