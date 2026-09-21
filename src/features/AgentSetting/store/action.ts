import { TRACING_SCENARIOS } from '@orvilo/const';
import {
  chainPickEmoji,
  chainSummaryAgentName,
  chainSummaryDescription,
  chainSummaryTags,
  PICK_EMOJI_JSON_SCHEMA,
  PICK_EMOJI_PROMPT_VERSION,
  SUMMARY_AGENT_NAME_JSON_SCHEMA,
  SUMMARY_AGENT_NAME_PROMPT_VERSION,
  SUMMARY_DESCRIPTION_JSON_SCHEMA,
  SUMMARY_DESCRIPTION_PROMPT_VERSION,
  SUMMARY_TAGS_JSON_SCHEMA,
  SUMMARY_TAGS_PROMPT_VERSION,
} from '@orvilo/prompts';
import { type PartialDeep } from 'type-fest';
import { type StateCreator } from 'zustand/vanilla';

import { analyticsClient } from '@/libs/analytics/client';
import { aiChatService } from '@/services/aiChat';
import { globalHelpers } from '@/store/global/helpers';
import { useUserStore } from '@/store/user';
import { systemAgentSelectors } from '@/store/user/slices/settings/selectors';
import { type OrviloAgentChatConfig, type OrviloAgentConfig } from '@/types/agent';
import { type MetaData } from '@/types/meta';
import { type SystemAgentItem } from '@/types/user/settings';
import { merge } from '@/utils/merge';
import { setNamespace } from '@/utils/storeDebug';

import { type LoadingState, type SaveStatus, type State } from '../store/initialState';
import { initialState } from './initialState';
import { type ConfigDispatch } from './reducers/config';
import { configReducer } from './reducers/config';
import { type MetaDataDispatch } from './reducers/meta';
import { metaDataReducer } from './reducers/meta';

export interface PublicAction {
  /**
   * Autocomplete agent description
   * @param id - Agent ID
   * @returns A Promise for handling after asynchronous operation completes
   */
  autocompleteAgentDescription: () => Promise<void>;
  autocompleteAgentTags: () => Promise<void>;
  /**
   * Autocomplete agent title
   * @param id - Agent ID
   * @returns A Promise for handling after asynchronous operation completes
   */
  autocompleteAgentTitle: () => Promise<void>;
  /**
   * Autocomplete assistant metadata
   */
  autocompleteAllMeta: (replace?: boolean) => void;
  autocompleteMeta: (key: keyof MetaData) => void;
  /**
   * Auto pick emoji
   * @param id - Emoji ID
   */
  autoPickEmoji: () => Promise<void>;
}

export interface Action extends PublicAction {
  dispatchConfig: (payload: ConfigDispatch) => Promise<void>;
  dispatchMeta: (payload: MetaDataDispatch) => Promise<void>;

  internal_getSystemAgentForMeta: () => SystemAgentItem;
  resetAgentConfig: () => Promise<void>;

  resetAgentMeta: () => Promise<void>;
  setAgentConfig: (config: PartialDeep<OrviloAgentConfig>) => Promise<void>;
  setAgentMeta: (meta: Partial<MetaData>) => Promise<void>;

  setChatConfig: (config: Partial<OrviloAgentChatConfig>) => Promise<void>;
  toggleAgentPlugin: (pluginId: string, state?: boolean) => void;

  /**
   * Update loading state
   * @param key - Key of SessionLoadingState
   * @param value - Value of the loading state
   */
  updateLoadingState: (key: keyof LoadingState, value: boolean) => void;
  /**
   * Update save status
   * @param status - Save status
   */
  updateSaveStatus: (status: SaveStatus) => void;
}

export type Store = Action & State;

const t = setNamespace('AgentSettings');

export const store: StateCreator<Store, [['zustand/devtools', never]]> = (set, get) => ({
  ...initialState,
  autoPickEmoji: async () => {
    const { config, meta, dispatchMeta } = get();

    const systemRole = config.systemRole;

    const { model, provider } = get().internal_getSystemAgentForMeta();

    get().updateLoadingState('avatar', true);
    try {
      const { data } = await aiChatService.generateJSON(
        {
          ...chainPickEmoji([meta.title, meta.description, systemRole].filter(Boolean).join(',')),
          model,
          provider,
          schema: PICK_EMOJI_JSON_SCHEMA,
          tracing: {
            agentId: get().id,
            promptVersion: PICK_EMOJI_PROMPT_VERSION,
            scenario: TRACING_SCENARIOS.AgentMeta,
            schemaName: PICK_EMOJI_JSON_SCHEMA.name,
          },
        },
        new AbortController(),
      );

      const emoji = (data as { emoji?: string } | undefined)?.emoji;
      if (emoji) dispatchMeta({ type: 'update', value: { avatar: emoji } });
    } catch (error) {
      console.error('[AgentSettings] autoPickEmoji failed:', error);
    } finally {
      get().updateLoadingState('avatar', false);
    }
  },
  autocompleteAgentDescription: async () => {
    const { dispatchMeta, config, meta, updateLoadingState } = get();

    const systemRole = config.systemRole;

    if (!systemRole) return;

    const preValue = meta.description;

    // Replace with ...
    dispatchMeta({ type: 'update', value: { description: '...' } });

    const { model, provider } = get().internal_getSystemAgentForMeta();

    updateLoadingState('description', true);
    try {
      const { data } = await aiChatService.generateJSON(
        {
          ...chainSummaryDescription(systemRole, globalHelpers.getCurrentLanguage()),
          model,
          provider,
          schema: SUMMARY_DESCRIPTION_JSON_SCHEMA,
          tracing: {
            agentId: get().id,
            promptVersion: SUMMARY_DESCRIPTION_PROMPT_VERSION,
            scenario: TRACING_SCENARIOS.AgentMeta,
            schemaName: SUMMARY_DESCRIPTION_JSON_SCHEMA.name,
          },
        },
        new AbortController(),
      );

      const description = (data as { description?: string } | undefined)?.description ?? preValue;
      dispatchMeta({ type: 'update', value: { description } });
    } catch {
      dispatchMeta({ type: 'update', value: { description: preValue } });
    } finally {
      updateLoadingState('description', false);
    }
  },
  autocompleteAgentTags: async () => {
    const { dispatchMeta, config, meta, updateLoadingState } = get();

    const systemRole = config.systemRole;

    if (!systemRole) return;

    const preValue = meta.tags;

    // Replace with ...
    dispatchMeta({ type: 'update', value: { tags: ['...'] } });

    const { model, provider } = get().internal_getSystemAgentForMeta();

    updateLoadingState('tags', true);
    try {
      const { data } = await aiChatService.generateJSON(
        {
          ...chainSummaryTags(
            [meta.title, meta.description, systemRole].filter(Boolean).join(','),
            globalHelpers.getCurrentLanguage(),
          ),
          model,
          provider,
          schema: SUMMARY_TAGS_JSON_SCHEMA,
          tracing: {
            agentId: get().id,
            promptVersion: SUMMARY_TAGS_PROMPT_VERSION,
            scenario: TRACING_SCENARIOS.AgentMeta,
            schemaName: SUMMARY_TAGS_JSON_SCHEMA.name,
          },
        },
        new AbortController(),
      );

      const tags = (data as { tags?: string[] } | undefined)?.tags ?? preValue;
      dispatchMeta({ type: 'update', value: { tags } });
    } catch {
      dispatchMeta({ type: 'update', value: { tags: preValue } });
    } finally {
      updateLoadingState('tags', false);
    }
  },
  autocompleteAgentTitle: async () => {
    const { dispatchMeta, config, meta, updateLoadingState } = get();

    const systemRole = config.systemRole;

    if (!systemRole) return;

    const previousTitle = meta.title;

    // Replace with ...
    dispatchMeta({ type: 'update', value: { title: '...' } });

    const { model, provider } = get().internal_getSystemAgentForMeta();

    updateLoadingState('title', true);
    try {
      const { data } = await aiChatService.generateJSON(
        {
          ...chainSummaryAgentName(
            [meta.description, systemRole].filter(Boolean).join(','),
            globalHelpers.getCurrentLanguage(),
          ),
          model,
          provider,
          schema: SUMMARY_AGENT_NAME_JSON_SCHEMA,
          tracing: {
            agentId: get().id,
            promptVersion: SUMMARY_AGENT_NAME_PROMPT_VERSION,
            scenario: TRACING_SCENARIOS.AgentMeta,
            schemaName: SUMMARY_AGENT_NAME_JSON_SCHEMA.name,
          },
        },
        new AbortController(),
      );

      const title = (data as { name?: string } | undefined)?.name ?? previousTitle;
      dispatchMeta({ type: 'update', value: { title } });
    } catch {
      dispatchMeta({ type: 'update', value: { title: previousTitle } });
    } finally {
      updateLoadingState('title', false);
    }
  },
  autocompleteAllMeta: (replace) => {
    const { meta } = get();

    if (!meta.title || replace) {
      get().autocompleteAgentTitle();
    }

    if (!meta.description || replace) {
      get().autocompleteAgentDescription();
    }

    if (!meta.avatar || replace) {
      get().autoPickEmoji();
    }

    if (!meta.tags || replace) {
      get().autocompleteAgentTags();
    }
  },
  autocompleteMeta: (key) => {
    const {
      autoPickEmoji,
      autocompleteAgentTitle,
      autocompleteAgentDescription,
      autocompleteAgentTags,
    } = get();

    switch (key) {
      case 'avatar': {
        autoPickEmoji();
        return;
      }

      case 'description': {
        autocompleteAgentDescription();
        return;
      }

      case 'title': {
        autocompleteAgentTitle();
        return;
      }

      case 'tags': {
        autocompleteAgentTags();
        return;
      }
    }
  },
  dispatchConfig: async (payload) => {
    const nextConfig = configReducer(get().config, payload);

    set({ config: nextConfig }, false, payload);

    if (get().onConfigChange) {
      get().updateSaveStatus('saving');
      try {
        await get().onConfigChange?.(nextConfig);
        get().updateSaveStatus('saved');
      } catch (error: any) {
        if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
          get().updateSaveStatus('idle');
        } else {
          console.error('[AgentSettings] Failed to save config:', error);
          get().updateSaveStatus('idle');
        }
      }
    }
  },
  dispatchMeta: async (payload) => {
    const nextValue = metaDataReducer(get().meta, payload);

    set({ meta: nextValue }, false, payload);

    if (get().onMetaChange) {
      get().updateSaveStatus('saving');
      try {
        await get().onMetaChange?.(nextValue);
        get().updateSaveStatus('saved');
      } catch (error: any) {
        if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
          get().updateSaveStatus('idle');
        } else {
          console.error('[AgentSettings] Failed to save meta:', error);
          get().updateSaveStatus('idle');
        }
      }
    }
  },
  internal_getSystemAgentForMeta: () => {
    return systemAgentSelectors.agentMeta(useUserStore.getState());
  },

  resetAgentConfig: async () => {
    await get().dispatchConfig({ type: 'reset' });
  },

  resetAgentMeta: async () => {
    await get().dispatchMeta({ type: 'reset' });
  },
  setAgentConfig: async (config) => {
    await get().dispatchConfig({ config, type: 'update' });
  },
  setAgentMeta: async (meta) => {
    const { dispatchMeta, id, meta: currentMeta } = get();
    const mergedMeta = merge(currentMeta, meta);

    try {
      void analyticsClient.track({
        name: 'agent_meta_updated',
        properties: {
          assistant_avatar: mergedMeta.avatar,
          assistant_background_color: mergedMeta.backgroundColor,
          assistant_description: mergedMeta.description,
          assistant_name: mergedMeta.title,
          assistant_tags: mergedMeta.tags,
          is_inbox: id === 'inbox',
          session_id: id || 'unknown',
          timestamp: Date.now(),
          user_id: useUserStore.getState().user?.id || 'anonymous',
        },
      });
    } catch (error) {
      console.warn('Failed to track agent meta update:', error);
    }
    await dispatchMeta({ type: 'update', value: meta });
  },

  setChatConfig: async (config) => {
    await get().setAgentConfig({ chatConfig: config });
  },

  toggleAgentPlugin: (id, state) => {
    get().dispatchConfig({ pluginId: id, state, type: 'togglePlugin' });
  },

  updateLoadingState: (key, value) => {
    set(
      { loadingState: { ...get().loadingState, [key]: value } },
      false,
      t('updateLoadingState', { key, value }),
    );
  },

  updateSaveStatus: (status) => {
    set(
      {
        lastUpdatedTime: status === 'saved' ? new Date() : get().lastUpdatedTime,
        saveStatus: status,
      },
      false,
      t('updateSaveStatus', { status }),
    );
  },
});
