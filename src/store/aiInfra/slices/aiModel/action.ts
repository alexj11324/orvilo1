import { toast } from '@lobehub/ui/base-ui';
import isEqual from 'fast-deep-equal';
import { t } from 'i18next';
import type { AiModelReasoningConfig } from 'model-bank';
import type { SWRResponse } from 'swr';

import { mutate, useClientDataSWR } from '@/libs/swr';
import { aiModelKeys } from '@/libs/swr/keys';
import { aiModelService } from '@/services/aiModel';
import type { AiInfraStore } from '@/store/aiInfra/store';
import type { StoreSetter } from '@/store/types';

import { modelReasoningConfigKey } from './initialState';
import { aiModelSelectors } from './selectors';

type Setter = StoreSetter<AiInfraStore>;
export const createAiModelSlice = (set: Setter, get: () => AiInfraStore, _api?: unknown) =>
  new AiModelActionImpl(set, get, _api);

export class AiModelActionImpl {
  readonly #get: () => AiInfraStore;
  readonly #set: Setter;

  constructor(set: Setter, get: () => AiInfraStore, _api?: unknown) {
    void _api;
    this.#set = set;
    this.#get = get;
  }

  /**
   * Optimistically saves the user's per-model-instance reasoning defaults
   * (personal scope, cross-workspace). Rolls the local value back and surfaces
   * an error toast when the request fails.
   */
  updateModelReasoningConfig = async (
    id: string,
    provider: string,
    value: AiModelReasoningConfig,
  ): Promise<void> => {
    const key = modelReasoningConfigKey(provider, id);
    const previous = this.#get().modelReasoningConfigMap[key];

    this.#set(
      (state) => ({
        modelReasoningConfigMap: {
          ...state.modelReasoningConfigMap,
          [key]: { ...previous, ...value },
        },
        modelReasoningConfigUpdatingKeys: [...state.modelReasoningConfigUpdatingKeys, key],
      }),
      false,
      `updateModelReasoningConfig/optimistic/${key}`,
    );

    try {
      await aiModelService.updateAiModelReasoningConfig(id, provider, value);
    } catch (error) {
      this.#set(
        (state) => {
          const modelReasoningConfigMap = { ...state.modelReasoningConfigMap };
          // A leftover `[key]: undefined` would read as "cached empty" and stop
          // ensureModelReasoningConfig from ever fetching the server value
          if (previous === undefined) delete modelReasoningConfigMap[key];
          else modelReasoningConfigMap[key] = previous;
          return { modelReasoningConfigMap };
        },
        false,
        `updateModelReasoningConfig/rollback/${key}`,
      );

      toast.error(t('reasoningEffort.updateFailed', { ns: 'chat' }));
      throw error;
    } finally {
      this.#set(
        (state) => ({
          modelReasoningConfigUpdatingKeys: state.modelReasoningConfigUpdatingKeys.filter(
            (i) => i !== key,
          ),
        }),
        false,
        `updateModelReasoningConfig/settled/${key}`,
      );
    }

    // Revalidate only AFTER the updating marker is cleared: the server merges
    // this partial write into previously saved fields, and the fetch hook's
    // onSuccess skips writes while the key is marked updating — revalidating
    // inside the try block would drop server-preserved sibling fields whenever
    // the optimistic base (`previous`) had not been fetched yet.
    await mutate(aiModelKeys.reasoningConfig(provider, id));
  };

  /**
   * Best-effort imperative warm-up of the model-instance reasoning config for
   * non-React callers — e.g. the client sub-agent executor, whose override
   * model may never mount a ChatInput fetch hook. No-op when the key is
   * already cached or an optimistic update is in flight; fetch failures are
   * swallowed so the send path falls back to defaults instead of breaking.
   */
  ensureModelReasoningConfig = async (id: string, provider: string): Promise<void> => {
    // Right after a reload the model metadata may still be hydrating — settle
    // it first (bounded, no-op once loaded) so an unknown model isn't mistaken
    // for "no reasoning params" and skipped.
    await this.#get().ensureAiProviderRuntimeStateReady();

    // The config only matters for models declaring reasoning-family extend
    // params (resolveModelExtendParams ignores it otherwise) — skip the
    // blocking round trip for everything else.
    if (!aiModelSelectors.isModelHasReasoningExtendParams(id, provider)(this.#get())) return;

    const key = modelReasoningConfigKey(provider, id);
    if (key in this.#get().modelReasoningConfigMap) return;

    try {
      const data = await aiModelService.getAiModelReasoningConfig(id, provider);

      const state = this.#get();
      if (state.modelReasoningConfigUpdatingKeys.includes(key)) return;
      if (key in state.modelReasoningConfigMap) return;

      this.#set(
        (s) => ({
          // An empty config keeps the key (value undefined) so repeated calls
          // don't refetch a model that simply has nothing saved yet
          modelReasoningConfigMap: { ...s.modelReasoningConfigMap, [key]: data },
        }),
        false,
        `ensureModelReasoningConfig/${key}`,
      );
    } catch {
      // best-effort: resolver falls back to level defaults
    }
  };

  useFetchAiModelReasoningConfig = (
    id: string | undefined,
    provider: string | undefined,
  ): SWRResponse<AiModelReasoningConfig | null> => {
    return useClientDataSWR<AiModelReasoningConfig | null>(
      id && provider ? aiModelKeys.reasoningConfig(provider, id) : null,
      async ([, provider, id]) =>
        (await aiModelService.getAiModelReasoningConfig(id as string, provider as string)) ?? null,
      {
        onSuccess: (data) => {
          const key = modelReasoningConfigKey(provider!, id!);
          // Don't clobber an in-flight optimistic value with a stale response
          if (this.#get().modelReasoningConfigUpdatingKeys.includes(key)) return;
          // The store map keeps its `| undefined` shape — only SWR needs null.
          const value = data ?? undefined;
          if (isEqual(value, this.#get().modelReasoningConfigMap[key])) return;

          this.#set(
            (state) => ({
              modelReasoningConfigMap: { ...state.modelReasoningConfigMap, [key]: value },
            }),
            false,
            `useFetchAiModelReasoningConfig/${key}`,
          );
        },
      },
    );
  };
}

export type AiModelAction = Pick<AiModelActionImpl, keyof AiModelActionImpl>;
