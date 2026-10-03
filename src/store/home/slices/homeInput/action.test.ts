import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HomeStore } from '@/store/home/store';
import type { StoreSetter } from '@/store/types';

import { HomeInputActionImpl } from './action';

const navigateMock = vi.hoisted(() => vi.fn());
const createAgentMock = vi.hoisted(() => vi.fn());
const updateAgentConfigByIdMock = vi.hoisted(() => vi.fn());
const refreshBuiltinAgentMock = vi.hoisted(() => vi.fn());
const sendMessageMock = vi.hoisted(() => vi.fn());
const refreshAgentListMock = vi.hoisted(() => vi.fn());
const toggleAgentBuilderPanelMock = vi.hoisted(() => vi.fn());
const toggleRightPanelMock = vi.hoisted(() => vi.fn());
const setChatPanelExpandedMock = vi.hoisted(() => vi.fn());
const createGroupMock = vi.hoisted(() => vi.fn());
const loadGroupsMock = vi.hoisted(() => vi.fn());

const enabledModels = vi.hoisted(() => ({
  isInit: true,
  list: [{ id: 'deepseek-v4-pro', provider: 'orvilo' }],
}));

const agentState = vi.hoisted(() => ({
  agentConfigMap: {
    agentBuilder: { model: 'deepseek-v4-pro', provider: 'orvilo' },
    groupAgentBuilder: { model: 'deepseek-v4-pro', provider: 'orvilo' },
    inbox: {
      model: 'gpt-4o-mini',
      provider: 'openai',
    },
  },
  agentMap: {
    // Personal-mode rows by default; a test flips `workspaceId` on to assert the
    // workspace-shared behaviour.
    agentBuilder: {} as { workspaceId?: string },
    groupAgentBuilder: {} as { workspaceId?: string },
  },
  builtinAgentIdMap: {
    'agent-builder': 'agentBuilder',
    'group-agent-builder': 'groupAgentBuilder',
  },
  createAgent: createAgentMock,
  inboxAgentId: 'inbox',
  refreshBuiltinAgent: refreshBuiltinAgentMock,
  updateAgentConfigById: updateAgentConfigByIdMock,
}));

vi.mock('@orvilo/builtin-agents', () => ({
  BUILTIN_AGENT_SLUGS: {
    agentBuilder: 'agent-builder',
    groupAgentBuilder: 'group-agent-builder',
  },
}));

vi.mock('@/services/chatGroup', () => ({
  chatGroupService: {
    createGroup: createGroupMock,
  },
}));

vi.mock('@/store/agent', () => ({
  getAgentStoreState: () => agentState,
}));

vi.mock('@/store/aiInfra', () => ({
  getAiInfraStoreState: () => enabledModels,
}));

vi.mock('@/store/aiInfra/selectors', () => ({
  aiModelSelectors: {
    getEnabledModelById: (id: string, provider: string) => (s: typeof enabledModels) =>
      s.list.find((m) => m.id === id && m.provider === provider),
  },
  aiProviderSelectors: {
    isInitAiProviderRuntimeState: (s: typeof enabledModels) => s.isInit,
  },
}));

vi.mock('@/store/agent/selectors', () => ({
  agentByIdSelectors: {
    getAgentById:
      (id: string) =>
      (state: typeof agentState): { workspaceId?: string } | undefined =>
        state.agentMap[id as keyof typeof state.agentMap],
  },
  agentSelectors: {
    getAgentConfigById:
      (id: string) =>
      (state: typeof agentState): { model: string; provider: string } | undefined =>
        state.agentConfigMap[id as keyof typeof state.agentConfigMap],
  },
  builtinAgentSelectors: {
    inboxAgentId: (state: typeof agentState) => state.inboxAgentId,
  },
}));

vi.mock('@/store/agentGroup', () => ({
  getChatGroupStoreState: () => ({
    loadGroups: loadGroupsMock,
  }),
}));

vi.mock('@/store/chat', () => ({
  useChatStore: {
    getState: () => ({
      sendMessage: sendMessageMock,
    }),
    setState: vi.fn(),
  },
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: {
    getState: () => ({
      toggleAgentBuilderPanel: toggleAgentBuilderPanelMock,
      toggleRightPanel: toggleRightPanelMock,
    }),
  },
}));

vi.mock('@/store/groupProfile', () => ({
  useGroupProfileStore: {
    getState: () => ({
      setChatPanelExpanded: setChatPanelExpandedMock,
    }),
  },
}));

vi.mock('@/utils/stableNavigate', () => ({
  getStableNavigate: () => navigateMock,
}));

const createAction = () => {
  const homeState: Partial<HomeStore> = {
    refreshAgentList: refreshAgentListMock,
  };

  const setState: StoreSetter<HomeStore> = ((partial) => {
    if (typeof partial === 'function') {
      Object.assign(homeState, partial(homeState as HomeStore));
      return;
    }
    Object.assign(homeState, partial);
  }) as StoreSetter<HomeStore>;

  return new HomeInputActionImpl(setState, () => homeState as HomeStore);
};

describe('HomeInputActionImpl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAgentMock.mockResolvedValue({ agentId: 'agent-new' });
    createGroupMock.mockResolvedValue({
      group: {
        id: 'group-new',
      },
    });
    for (const key of ['agentBuilder', 'groupAgentBuilder'] as const) {
      delete agentState.agentMap[key].workspaceId;
      agentState.agentConfigMap[key] = { model: 'deepseek-v4-pro', provider: 'orvilo' };
    }
    enabledModels.list = [{ id: 'deepseek-v4-pro', provider: 'orvilo' }];
    enabledModels.isInit = true;
  });

  describe('sendAsGroup', () => {
    // Regression: the Private sidebar create entries pass `visibility: 'private'`;
    // dropping it here published the new group to the whole workspace.
    it('forwards visibility to the group creation request', async () => {
      const action = createAction();

      await action.sendAsGroup({ message: 'build a research group', visibility: 'private' });

      expect(createGroupMock).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: 'private' }),
      );
    });

    it('lands on the group conversation and fires the builder for prompt-based creation', async () => {
      const action = createAction();

      await action.sendAsGroup({ message: 'build a research group' });

      expect(setChatPanelExpandedMock).toHaveBeenCalledWith(true);
      // Regression: creation must land inside the group conversation, never the
      // intermediate profile/settings screen.
      expect(navigateMock).toHaveBeenCalledWith('/group/group-new');
      expect(sendMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          context: {
            agentId: 'groupAgentBuilder',
            // Names the freshly created group so the builder topic is stamped
            // with it, instead of relying on the not-yet-mounted group route to
            // have set `chatStore.activeGroupId`.
            editingGroupId: 'group-new',
            scope: 'group_agent_builder',
          },
          message: 'build a research group',
        }),
      );
    });

    it('creates a blank group without firing the builder or the profile panel', async () => {
      const action = createAction();

      await action.sendAsGroup({ message: '' });

      expect(navigateMock).toHaveBeenCalledWith('/group/group-new');
      expect(setChatPanelExpandedMock).not.toHaveBeenCalled();
      expect(sendMessageMock).not.toHaveBeenCalled();
      expect(refreshBuiltinAgentMock).not.toHaveBeenCalled();
    });

    it('passes the workspace slug to the group builder message context', async () => {
      const action = createAction();

      await action.sendAsGroup({ message: 'build a research group', workspaceSlug: 'team' });

      expect(sendMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          context: {
            agentId: 'groupAgentBuilder',
            editingGroupId: 'group-new',
            scope: 'group_agent_builder',
            workspaceSlug: 'team',
          },
        }),
      );
    });

    it('keeps syncing model/provider onto a personal group agent builder', async () => {
      const action = createAction();

      await action.sendAsGroup({ message: 'build a research group' });

      expect(updateAgentConfigByIdMock).toHaveBeenCalledWith('groupAgentBuilder', {
        model: 'gpt-4o-mini',
        provider: 'openai',
      });
    });

    it('never writes model/provider onto a workspace-shared group agent builder', async () => {
      agentState.agentMap.groupAgentBuilder.workspaceId = 'ws-1';
      const action = createAction();

      await action.sendAsGroup({ message: 'build a research group' });

      expect(updateAgentConfigByIdMock).not.toHaveBeenCalled();
    });
  });
});
