import { resolveHeteroAgentSystemContext } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveRunAgentConfig } from '../pipeline/resolveRunAgentConfig';

const {
  getInfoForAIGeneration,
  getPreference,
  isResourceAuthorOrAdmin,
  findGroupById,
  getGroupAgentsWithMeta,
} = vi.hoisted(() => ({
  getInfoForAIGeneration: vi.fn(),
  findGroupById: vi.fn(),
  getGroupAgentsWithMeta: vi.fn(),
  getPreference: vi.fn(),
  isResourceAuthorOrAdmin: vi.fn(),
}));

vi.mock('@/database/models/chatGroup', () => ({
  ChatGroupModel: class {
    findById = findGroupById;
    getGroupAgentsWithMeta = getGroupAgentsWithMeta;
  },
}));

vi.mock('@/database/models/workspaceUserSettings', () => ({
  WorkspaceUserSettingsModel: class {
    getPreference = getPreference;
  },
}));

vi.mock('@/database/models/user', () => ({
  UserModel: { getInfoForAIGeneration },
}));

vi.mock('@/server/services/resourcePermission', () => ({
  isResourceAuthorOrAdmin,
}));

const deps = {
  db: {} as never,
  userId: 'member-1',
  workspaceId: 'ws-1',
};

const webOnboardingRow = () =>
  ({
    agencyConfig: undefined,
    chatConfig: {},
    id: 'agent-web-onboarding',
    model: 'gpt-4',
    plugins: [],
    provider: 'openai',
    slug: 'web-onboarding',
    systemRole: '',
    userId: 'author-1',
    visibility: 'public',
    workspaceId: 'ws-1',
  }) as never;

describe('resolveRunAgentConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPreference.mockResolvedValue({});
    findGroupById.mockResolvedValue({
      id: 'group-1',
      title: 'Team',
      content: 'Coordinate the review.',
    });
    getGroupAgentsWithMeta.mockResolvedValue([
      { agentId: 'supervisor', role: 'supervisor', title: 'Coordinator' },
      { agentId: 'member', role: 'participant', title: 'Reviewer' },
    ]);
    isResourceAuthorOrAdmin.mockResolvedValue(false);
    getInfoForAIGeneration.mockResolvedValue({ responseLanguage: 'en-US' });
  });

  it('keeps a builtin runtime execution target over a saved member device override', async () => {
    // A workspace member pinned this agent to their local device …
    getPreference.mockResolvedValue({
      agentDeviceOverrides: {
        'agent-web-onboarding': { boundDeviceId: 'dev-1', executionTarget: 'local' },
      },
    });

    const { agentConfig } = await resolveRunAgentConfig(
      { ...deps, resolveAgentConfigOrThrow: async () => webOnboardingRow() },
      { identifier: 'agent-web-onboarding', throwIfExecutionAborted: async () => {} },
    );

    // … but the onboarding runtime disables execution outright, and the
    // runtime policy is merged on top of the member preference, not under it.
    expect(agentConfig.agencyConfig?.executionTarget).toBe('none');
  });

  it('reads the reply language for the caller on an ordinary run', async () => {
    await resolveRunAgentConfig(
      {
        ...deps,
        resolveAgentConfigOrThrow: async () =>
          ({ ...(webOnboardingRow() as object), id: 'agent-regular', slug: null }) as never,
      },
      { identifier: 'agent-regular', throwIfExecutionAborted: async () => {} },
    );

    expect(getInfoForAIGeneration).toHaveBeenCalledWith(expect.anything(), 'member-1');
  });

  it('applies a saved member device override to a regular workspace agent', async () => {
    getPreference.mockResolvedValue({
      agentDeviceOverrides: {
        'agent-regular': { boundDeviceId: 'dev-1', executionTarget: 'local' },
      },
    });

    const { agentConfig, memberDeviceOverride } = await resolveRunAgentConfig(
      {
        ...deps,
        resolveAgentConfigOrThrow: async () =>
          ({ ...(webOnboardingRow() as object), id: 'agent-regular', slug: null }) as never,
      },
      { identifier: 'agent-regular', throwIfExecutionAborted: async () => {} },
    );

    expect(memberDeviceOverride).toEqual({ boundDeviceId: 'dev-1', executionTarget: 'local' });
    expect(agentConfig.agencyConfig?.executionTarget).toBe('local');
  });
});

describe('group execution authority', () => {
  it('rejects a member claiming the supervisor role before configuration reaches dispatch', async () => {
    await expect(
      resolveRunAgentConfig(
        {
          ...deps,
          resolveAgentConfigOrThrow: async () =>
            ({ ...(webOnboardingRow() as object), id: 'member', slug: null }) as never,
        },
        {
          appContext: { groupId: 'group-1', scope: 'group', orchestrationRole: 'supervisor' },
          identifier: 'member',
          throwIfExecutionAborted: async () => {},
        },
      ),
    ).rejects.toThrow('Only the group supervisor');
  });

  it.each(['opencode', 'orvilo'] as const)(
    'composes the %s supervisor persona exactly once with its real roster',
    async (type) => {
      const source = {
        ...(webOnboardingRow() as object),
        id: 'supervisor',
        slug: null,
        systemRole: 'Coordinate the review.',
        agencyConfig: { heterogeneousProvider: { type }, executionTarget: 'local' },
      };
      const original = structuredClone(source);
      const result = await resolveRunAgentConfig(
        { ...deps, resolveAgentConfigOrThrow: async () => source as never },
        {
          appContext: { groupId: 'group-1', scope: 'group', orchestrationRole: 'supervisor' },
          identifier: 'supervisor',
          throwIfExecutionAborted: async () => {},
        },
      );
      expect(result.isGroupSupervisor).toBe(true);
      expect(result.agentConfig.plugins).toContain('orvilo-group-management');
      expect(result.groupSystemContext).toContain('Coordinator');
      expect(result.groupSystemContext).toContain('member');
      expect(result.groupSystemContext).toContain('Reviewer');
      expect(result.agentConfig.agencyConfig?.heterogeneousProvider?.type).toBe(type);
      const finalContext = [
        resolveHeteroAgentSystemContext(
          result.agentConfig.agencyConfig?.heterogeneousProvider,
          result.agentConfig.systemRole,
        ),
        result.groupSystemContext,
      ]
        .filter(Boolean)
        .join('\n\n');
      expect(finalContext.split(result.agentConfig.systemRole!).length - 1).toBe(1);
      expect(finalContext.split('<group_context>').length - 1).toBe(1);
      expect(source).toEqual(original);
    },
  );

  it('refuses a missing or inaccessible group instead of dispatching a claimed role', async () => {
    findGroupById.mockResolvedValue(undefined);
    await expect(
      resolveRunAgentConfig(
        { ...deps, resolveAgentConfigOrThrow: async () => webOnboardingRow() },
        {
          appContext: { groupId: 'group-missing', scope: 'group', orchestrationRole: 'supervisor' },
          identifier: 'supervisor',
          throwIfExecutionAborted: async () => {},
        },
      ),
    ).rejects.toThrow('Group not found');
  });
});
