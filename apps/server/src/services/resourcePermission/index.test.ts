// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrviloDatabase } from '@/database/type';
import {
  getWorkspaceScopedPermissionMatches,
  isWorkspacePrimaryOwner,
  resolveWorkspaceGrantedPermissions,
} from '@/server/services/workspacePermission';

import { canPerformResourceAction, isResourceAuthorOrAdmin } from './index';

const effectiveAccessMock = vi.hoisted(() => vi.fn());
// The *explicit* level (null when the resource has no `resource_permissions` row)
// is what decides whether a collaborative builtin bypasses the default.
const explicitAccessMock = vi.hoisted(() => vi.fn());

const grantedLevelMock = vi.hoisted(() => vi.fn());
const teamReadMock = vi.hoisted(() => vi.fn());
const teamWriteMock = vi.hoisted(() => vi.fn());
const teamAdminMock = vi.hoisted(() => vi.fn());
const activeWorkspaceMemberMock = vi.hoisted(() => vi.fn());
const activeWorkspaceRoleMock = vi.hoisted(() => vi.fn());

vi.mock('@/database/models/team', () => ({
  TeamModel: class {
    hasAdminAccess = teamAdminMock;
    hasReadAccess = teamReadMock;
    hasWriteAccess = teamWriteMock;
  },
}));
vi.mock('@/database/models/workspace', () => ({
  getActiveWorkspaceMembershipRole: activeWorkspaceRoleMock,
  hasActiveWorkspaceMembership: activeWorkspaceMemberMock,
}));

vi.mock('@/database/models/resourcePermission', () => ({
  ResourcePermissionModel: class {
    getAccessLevel = explicitAccessMock;
    getCollaboratorLevel = grantedLevelMock;
    getEffectiveAccessLevel = effectiveAccessMock;
  },
}));

vi.mock('@/server/services/workspacePermission', () => ({
  getWorkspaceScopedPermissionMatches: vi.fn(),
  isWorkspacePrimaryOwner: vi.fn(),
  resolveWorkspaceGrantedPermissions: vi.fn(),
}));

const permissionMatchesMock = vi.mocked(getWorkspaceScopedPermissionMatches);
const primaryOwnerMock = vi.mocked(isWorkspacePrimaryOwner);
const resolveGrantsMock = vi.mocked(resolveWorkspaceGrantedPermissions);
// Minimal stub: answers the builtin-marker and group-membership lookups with
// "nothing found", which is the ordinary case.
const emptyQueryDb = (rows: unknown[] = []) =>
  ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }),
  }) as unknown as OrviloDatabase;
const db = emptyQueryDb();
// `slug: null` = an ordinary agent, stated explicitly so the evaluator has no
// reason to resolve it from the database.
const meta = {
  slug: null,
  userId: 'creator',
  virtual: false,
  visibility: 'public',
  workspaceId: 'ws-1',
};

describe('canPerformResourceAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveGrantsMock.mockResolvedValue(['ai_model:invoke:all']);
    explicitAccessMock.mockResolvedValue(null);
    grantedLevelMock.mockResolvedValue(null);
    activeWorkspaceMemberMock.mockResolvedValue(true);
    activeWorkspaceRoleMock.mockResolvedValue('member');
    teamReadMock.mockResolvedValue(false);
    teamWriteMock.mockResolvedValue(false);
    teamAdminMock.mockResolvedValue(false);
  });

  it.each(['public', 'private'])(
    'requires an explicit Agent Use member grant for a %s Agent',
    async (visibility) => {
      permissionMatchesMock.mockResolvedValue({ hasAllScope: true, hasOwnerScope: false });
      effectiveAccessMock.mockResolvedValue('edit');
      const params = {
        action: 'use' as const,
        db,
        meta: { ...meta, visibility },
        resourceId: 'agent-1',
        resourceType: 'agent' as const,
        userId: 'member',
        workspaceId: 'ws-1',
      };
      await expect(canPerformResourceAction(params)).resolves.toBe(false);
      grantedLevelMock.mockResolvedValue('use');
      await expect(canPerformResourceAction(params)).resolves.toBe(true);
      activeWorkspaceMemberMock.mockResolvedValue(false);
      activeWorkspaceRoleMock.mockResolvedValue(null);
      await expect(canPerformResourceAction(params)).resolves.toBe(false);
    },
  );

  it('allows the creator to cancel and restore their own explicit Use grant', async () => {
    permissionMatchesMock.mockResolvedValue({ hasAllScope: true, hasOwnerScope: false });
    const params = {
      action: 'use' as const,
      db,
      meta,
      resourceId: 'agent-1',
      resourceType: 'agent' as const,
      userId: 'creator',
      workspaceId: 'ws-1',
    };
    await expect(canPerformResourceAction(params)).resolves.toBe(false);
    grantedLevelMock.mockResolvedValue('use');
    await expect(canPerformResourceAction(params)).resolves.toBe(true);
    grantedLevelMock.mockResolvedValue(null);
    await expect(canPerformResourceAction(params)).resolves.toBe(false);
  });

  it('keeps the Viewer ceiling even when a Use row and invoke capability exist', async () => {
    permissionMatchesMock.mockResolvedValue({ hasAllScope: true, hasOwnerScope: false });
    activeWorkspaceRoleMock.mockResolvedValue('viewer');
    grantedLevelMock.mockResolvedValue('use');
    await expect(
      canPerformResourceAction({
        action: 'use',
        db,
        meta,
        resourceId: 'agent-1',
        resourceType: 'agent',
        userId: 'member',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(false);
  });

  it('keeps Agent Use separate from management and workspace-wide levels', async () => {
    permissionMatchesMock.mockResolvedValue({ hasAllScope: false, hasOwnerScope: true });
    grantedLevelMock.mockResolvedValue('use');
    await expect(
      canPerformResourceAction({
        action: 'use',
        db,
        meta,
        resourceId: 'agent-1',
        resourceType: 'agent',
        userId: 'member',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(true);
    await expect(
      canPerformResourceAction({
        action: 'manage',
        db,
        meta,
        resourceId: 'agent-1',
        resourceType: 'agent',
        userId: 'member',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(false);
  });

  it.each(['use', 'edit'])(
    'does not grant ordinary Agent management from a member %s row or global edit',
    async (grant) => {
      permissionMatchesMock.mockResolvedValue({ hasAllScope: false, hasOwnerScope: true });
      grantedLevelMock.mockResolvedValue(grant);
      effectiveAccessMock.mockResolvedValue('edit');
      const params = {
        db,
        meta,
        resourceId: 'agent-1',
        resourceType: 'agent' as const,
        userId: 'member',
        workspaceId: 'ws-1',
      };
      await expect(canPerformResourceAction({ ...params, action: 'use' })).resolves.toBe(
        grant === 'use',
      );
      await expect(canPerformResourceAction({ ...params, action: 'edit' })).resolves.toBe(false);
      await expect(canPerformResourceAction({ ...params, action: 'manage' })).resolves.toBe(false);
      await expect(
        canPerformResourceAction({ ...params, action: 'edit', userId: 'creator' }),
      ).resolves.toBe(true);
      permissionMatchesMock.mockResolvedValue({ hasAllScope: true, hasOwnerScope: false });
      grantedLevelMock.mockResolvedValue(null);
      activeWorkspaceRoleMock.mockResolvedValue('admin');
      await expect(
        canPerformResourceAction({ ...params, action: 'edit', userId: 'admin' }),
      ).resolves.toBe(true);
      await expect(
        canPerformResourceAction({ ...params, action: 'use', userId: 'admin' }),
      ).resolves.toBe(false);
    },
  );

  it('grants team Page viewing and editing only through current team access and document RBAC', async () => {
    permissionMatchesMock.mockResolvedValue({ hasAllScope: true, hasOwnerScope: false });
    teamReadMock.mockResolvedValue(true);
    teamWriteMock.mockResolvedValue(true);
    const teamMeta = {
      teamId: 'team-1',
      userId: 'creator',
      visibility: 'team',
      workspaceId: 'ws-1',
    };

    await expect(
      canPerformResourceAction({
        action: 'view',
        db,
        meta: teamMeta,
        resourceId: 'page-1',
        resourceType: 'document',
        userId: 'member',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(true);
    await expect(
      canPerformResourceAction({
        action: 'edit',
        db,
        meta: teamMeta,
        resourceId: 'page-1',
        resourceType: 'document',
        userId: 'member',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(true);

    teamWriteMock.mockResolvedValue(false);
    await expect(
      canPerformResourceAction({
        action: 'edit',
        db,
        meta: teamMeta,
        resourceId: 'page-1',
        resourceType: 'document',
        userId: 'creator',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(false);
    activeWorkspaceMemberMock.mockResolvedValue(false);
    activeWorkspaceRoleMock.mockResolvedValue(null);
    await expect(
      canPerformResourceAction({
        action: 'view',
        db,
        meta: teamMeta,
        resourceId: 'page-1',
        resourceType: 'document',
        userId: 'member',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(false);
  });

  it('does not infer Agent Use from workspace management authority', async () => {
    permissionMatchesMock.mockResolvedValue({ hasAllScope: true, hasOwnerScope: false });
    effectiveAccessMock.mockResolvedValue('view');

    await expect(
      canPerformResourceAction({
        action: 'use',
        db,
        meta,
        resourceId: 'agent-1',
        resourceType: 'agent',
        userId: 'workspace-admin',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(false);
    expect(effectiveAccessMock).not.toHaveBeenCalled();
  });

  it('lets the Agent author bypass view-only Member Permissions', async () => {
    permissionMatchesMock.mockResolvedValue({ hasAllScope: false, hasOwnerScope: true });
    effectiveAccessMock.mockResolvedValue('view');

    await expect(
      canPerformResourceAction({
        action: 'edit',
        db,
        meta,
        resourceId: 'agent-1',
        resourceType: 'agent',
        userId: 'creator',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(true);
    expect(effectiveAccessMock).not.toHaveBeenCalled();
  });

  it('lets the creator transfer their own agent', async () => {
    permissionMatchesMock.mockResolvedValue({ hasAllScope: false, hasOwnerScope: true });

    await expect(
      canPerformResourceAction({
        action: 'transfer',
        db,
        meta,
        resourceId: 'agent-1',
        resourceType: 'agent',
        userId: 'creator',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(true);
    expect(primaryOwnerMock).not.toHaveBeenCalled();
  });

  it('lets the primary owner transfer a shared agent created by someone else', async () => {
    permissionMatchesMock.mockResolvedValue({ hasAllScope: true, hasOwnerScope: false });
    primaryOwnerMock.mockResolvedValue(true);

    await expect(
      canPerformResourceAction({
        action: 'transfer',
        db,
        meta,
        resourceId: 'agent-1',
        resourceType: 'agent',
        userId: 'primary-owner',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(true);
  });

  it("rejects a co-admin transferring another member's shared agent", async () => {
    permissionMatchesMock.mockResolvedValue({ hasAllScope: true, hasOwnerScope: false });
    primaryOwnerMock.mockResolvedValue(false);

    await expect(
      canPerformResourceAction({
        action: 'transfer',
        db,
        meta,
        resourceId: 'agent-1',
        resourceType: 'agent',
        userId: 'workspace-admin',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(false);
  });

  // Union-scope admission (buildWorkspaceWhere): the caller's own unfiled row
  // is inside their workspace scope — activating a workspace must not lock the
  // owner out of pre-provisioning data. A teammate's unfiled row stays closed.
  it('does not let a personal Agent reference bypass an inactive workspace actor ceiling', async () => {
    activeWorkspaceRoleMock.mockResolvedValue(null);
    await expect(
      canPerformResourceAction({
        action: 'use',
        db,
        meta: { ...meta, workspaceId: null },
        resourceId: 'personal-agent',
        resourceType: 'agent',
        userId: 'creator',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(false);
  });

  it('lets the author keep editing their own unfiled agent inside a workspace', async () => {
    permissionMatchesMock.mockResolvedValue({ hasAllScope: false, hasOwnerScope: true });
    effectiveAccessMock.mockResolvedValue('edit');

    await expect(
      canPerformResourceAction({
        action: 'edit',
        db,
        meta: { ...meta, userId: 'member-1', workspaceId: null },
        resourceId: 'agent-1',
        resourceType: 'agent',
        userId: 'member-1',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(true);
  });

  it('still rejects a teammate unfiled agent inside a workspace', async () => {
    permissionMatchesMock.mockResolvedValue({ hasAllScope: true, hasOwnerScope: false });

    await expect(
      canPerformResourceAction({
        action: 'view',
        db,
        meta: { ...meta, workspaceId: null },
        resourceId: 'agent-1',
        resourceType: 'agent',
        userId: 'member-1',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(false);
    expect(permissionMatchesMock).not.toHaveBeenCalled();
  });

  it("rejects the primary owner transferring another member's private agent", async () => {
    permissionMatchesMock.mockResolvedValue({ hasAllScope: true, hasOwnerScope: false });
    primaryOwnerMock.mockResolvedValue(true);

    await expect(
      canPerformResourceAction({
        action: 'transfer',
        db,
        meta: { ...meta, visibility: 'private' },
        resourceId: 'agent-1',
        resourceType: 'agent',
        userId: 'primary-owner',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(false);
    expect(primaryOwnerMock).not.toHaveBeenCalled();
  });

  it('keeps changeVisibility creator-only even for the primary owner', async () => {
    permissionMatchesMock.mockResolvedValue({ hasAllScope: true, hasOwnerScope: false });
    primaryOwnerMock.mockResolvedValue(true);

    await expect(
      canPerformResourceAction({
        action: 'changeVisibility',
        db,
        meta,
        resourceId: 'agent-1',
        resourceType: 'agent',
        userId: 'primary-owner',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(false);
  });

  it('still applies the resource level when an ordinary member can invoke all agents', async () => {
    permissionMatchesMock
      .mockResolvedValueOnce({ hasAllScope: true, hasOwnerScope: false })
      .mockResolvedValueOnce({ hasAllScope: false, hasOwnerScope: true });
    effectiveAccessMock.mockResolvedValue('view');

    await expect(
      canPerformResourceAction({
        action: 'use',
        db,
        meta,
        resourceId: 'agent-1',
        resourceType: 'agent',
        userId: 'member',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(false);
    expect(permissionMatchesMock.mock.calls.map(([input]) => input.action)).toEqual([
      'AI_MODEL_INVOKE',
    ]);
  });

  it('uses a pre-resolved effective access level without querying it again', async () => {
    permissionMatchesMock
      .mockResolvedValueOnce({ hasAllScope: true, hasOwnerScope: false })
      .mockResolvedValueOnce({ hasAllScope: false, hasOwnerScope: true });

    await expect(
      canPerformResourceAction({
        action: 'view',
        db,
        effectiveAccessLevel: 'view',
        grantedPermissions: ['agent:read:all'],
        meta,
        resourceId: 'agent-1',
        resourceType: 'agent',
        userId: 'member',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(true);
    expect(effectiveAccessMock).not.toHaveBeenCalled();
  });

  it('does not let pre-resolved levels bypass General access for stronger actions', async () => {
    permissionMatchesMock
      .mockResolvedValueOnce({ hasAllScope: true, hasOwnerScope: false })
      .mockResolvedValueOnce({ hasAllScope: false, hasOwnerScope: true });
    effectiveAccessMock.mockResolvedValue('view');

    await expect(
      canPerformResourceAction({
        action: 'use',
        db,
        effectiveAccessLevel: 'edit',
        grantedPermissions: ['ai_model:invoke:all'],
        meta,
        resourceId: 'agent-1',
        resourceType: 'agent',
        userId: 'member',
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(false);
    expect(effectiveAccessMock).not.toHaveBeenCalled();
    expect(grantedLevelMock).toHaveBeenCalledWith('agent', 'agent-1', 'member');
  });

  it('requires only invocation capability before the Agent Use member lookup', async () => {
    permissionMatchesMock
      .mockResolvedValueOnce({ hasAllScope: true, hasOwnerScope: false })
      .mockResolvedValueOnce({ hasAllScope: false, hasOwnerScope: true });
    effectiveAccessMock.mockResolvedValue('view');

    await canPerformResourceAction({
      action: 'use',
      db,
      meta,
      resourceId: 'agent-1',
      resourceType: 'agent',
      userId: 'member',
      workspaceId: 'ws-1',
    });

    expect(permissionMatchesMock).toHaveBeenCalledTimes(1);
    expect(permissionMatchesMock.mock.calls.map(([input]) => input.grantedPermissions)).toEqual([
      undefined,
    ]);
  });

  it.each(['inbox', 'agent-builder', 'group-agent-builder', 'page-agent'])(
    'does not expose shared builtin %s config through a member slug bypass',
    async (slug) => {
      permissionMatchesMock.mockResolvedValue({ hasAllScope: true, hasOwnerScope: false });
      const params = {
        db,
        meta: { ...meta, slug, virtual: true },
        resourceId: 'builtin-1',
        resourceType: 'agent' as const,
        userId: 'member',
        workspaceId: 'ws-1',
      };
      await expect(canPerformResourceAction({ ...params, action: 'view' })).resolves.toBe(true);
      for (const action of ['edit', 'manage', 'delete', 'use'] as const)
        await expect(canPerformResourceAction({ ...params, action })).resolves.toBe(false);
      await expect(isResourceAuthorOrAdmin(params)).resolves.toBe(false);
    },
  );

  it('grants ordinary Agent Manage only to an active writable creator or actual Admin/Owner', async () => {
    permissionMatchesMock.mockResolvedValue({ hasAllScope: true, hasOwnerScope: false });
    const params = {
      db,
      meta,
      resourceId: 'agent-1',
      resourceType: 'agent' as const,
      userId: 'member',
      workspaceId: 'ws-1',
    };
    for (const role of ['member', 'viewer', null]) {
      activeWorkspaceRoleMock.mockResolvedValue(role);
      await expect(canPerformResourceAction({ ...params, action: 'manage' })).resolves.toBe(false);
      await expect(isResourceAuthorOrAdmin(params)).resolves.toBe(false);
    }
    for (const role of ['admin', 'owner']) {
      activeWorkspaceRoleMock.mockResolvedValue(role);
      await expect(canPerformResourceAction({ ...params, action: 'manage' })).resolves.toBe(true);
      await expect(isResourceAuthorOrAdmin(params)).resolves.toBe(true);
      await expect(canPerformResourceAction({ ...params, action: 'use' })).resolves.toBe(false);
    }
    activeWorkspaceRoleMock.mockResolvedValue('viewer');
    await expect(
      canPerformResourceAction({ ...params, action: 'manage', userId: 'creator' }),
    ).resolves.toBe(false);
  });

  it('retains personal Agent owner Use outside the workspace roster', async () => {
    const params = {
      db,
      meta: { ...meta, workspaceId: null },
      resourceId: 'personal-1',
      resourceType: 'agent' as const,
      action: 'use' as const,
      workspaceId: 'ws-1',
    };
    await expect(canPerformResourceAction({ ...params, userId: 'creator' })).resolves.toBe(true);
    await expect(canPerformResourceAction({ ...params, userId: 'member' })).resolves.toBe(false);
  });

  // Knowledge bases invert the usual ordering: browsing the internal file list
  // ('view') is the privileged act and requires the `edit` grade, while `use`
  // keeps the KB mountable for retrieval.
  describe('knowledge bases', () => {
    const kbMeta = {
      userId: 'creator',
      visibility: 'public',
      workspaceId: 'ws-1',
    };

    // Members hold `knowledge_base:read:all` (the capability ceiling for
    // 'view') but only `:owner` on update, so the resource-admin bypass check
    // must not fire for them.
    const memberMatches = ({ action }: { action: string }) =>
      Promise.resolve(
        action === 'KNOWLEDGE_BASE_UPDATE'
          ? { hasAllScope: false, hasOwnerScope: true }
          : { hasAllScope: true, hasOwnerScope: false },
      );

    it('lets a member browse a KB at the default edit level', async () => {
      permissionMatchesMock.mockImplementation(memberMatches as any);
      effectiveAccessMock.mockResolvedValue('edit');

      await expect(
        canPerformResourceAction({
          action: 'view',
          db,
          meta: kbMeta,
          resourceId: 'kb-1',
          resourceType: 'knowledgeBase',
          userId: 'member',
          workspaceId: 'ws-1',
        }),
      ).resolves.toBe(true);
    });

    it('lets a member edit a KB at the default edit level', async () => {
      permissionMatchesMock.mockImplementation(memberMatches as any);
      effectiveAccessMock.mockResolvedValue('edit');

      await expect(
        canPerformResourceAction({
          action: 'edit',
          db,
          meta: kbMeta,
          resourceId: 'kb-1',
          resourceType: 'knowledgeBase',
          userId: 'member',
          workspaceId: 'ws-1',
        }),
      ).resolves.toBe(true);
    });

    it('blocks a member from editing a use-level KB', async () => {
      permissionMatchesMock.mockImplementation(memberMatches as any);
      effectiveAccessMock.mockResolvedValue('use');

      await expect(
        canPerformResourceAction({
          action: 'edit',
          db,
          meta: kbMeta,
          resourceId: 'kb-1',
          resourceType: 'knowledgeBase',
          userId: 'member',
          workspaceId: 'ws-1',
        }),
      ).resolves.toBe(false);
    });

    it('blocks a member from browsing a use-level KB while keeping it usable', async () => {
      permissionMatchesMock.mockImplementation(memberMatches as any);
      effectiveAccessMock.mockResolvedValue('use');

      await expect(
        canPerformResourceAction({
          action: 'view',
          db,
          meta: kbMeta,
          resourceId: 'kb-1',
          resourceType: 'knowledgeBase',
          userId: 'member',
          workspaceId: 'ws-1',
        }),
      ).resolves.toBe(false);

      await expect(
        canPerformResourceAction({
          action: 'use',
          db,
          meta: kbMeta,
          resourceId: 'kb-1',
          resourceType: 'knowledgeBase',
          userId: 'member',
          workspaceId: 'ws-1',
        }),
      ).resolves.toBe(true);
    });

    it('lets a KNOWLEDGE_BASE_UPDATE:all curator browse a use-level KB', async () => {
      permissionMatchesMock.mockResolvedValue({ hasAllScope: true, hasOwnerScope: false });
      effectiveAccessMock.mockResolvedValue('use');

      await expect(
        canPerformResourceAction({
          action: 'view',
          db,
          meta: kbMeta,
          resourceId: 'kb-1',
          resourceType: 'knowledgeBase',
          userId: 'workspace-admin',
          workspaceId: 'ws-1',
        }),
      ).resolves.toBe(true);
      expect(effectiveAccessMock).not.toHaveBeenCalled();
    });

    it('lets a collaborator with an edit grant browse a use-level KB', async () => {
      permissionMatchesMock.mockImplementation(memberMatches as any);
      effectiveAccessMock.mockResolvedValue('use');
      grantedLevelMock.mockResolvedValue('edit');

      await expect(
        canPerformResourceAction({
          action: 'view',
          db,
          meta: kbMeta,
          resourceId: 'kb-1',
          resourceType: 'knowledgeBase',
          userId: 'collaborator',
          workspaceId: 'ws-1',
        }),
      ).resolves.toBe(true);
      expect(grantedLevelMock).toHaveBeenCalledWith('knowledgeBase', 'kb-1', 'collaborator');
    });

    it('skips the collaborator lookup when the workspace level already passes', async () => {
      permissionMatchesMock.mockImplementation(memberMatches as any);
      effectiveAccessMock.mockResolvedValue('edit');

      await expect(
        canPerformResourceAction({
          action: 'view',
          db,
          meta: kbMeta,
          resourceId: 'kb-1',
          resourceType: 'knowledgeBase',
          userId: 'member',
          workspaceId: 'ws-1',
        }),
      ).resolves.toBe(true);
      expect(grantedLevelMock).not.toHaveBeenCalled();
    });

    it('a grant below the required grade does not open browsing', async () => {
      permissionMatchesMock.mockImplementation(memberMatches as any);
      effectiveAccessMock.mockResolvedValue('use');
      grantedLevelMock.mockResolvedValue('use');

      await expect(
        canPerformResourceAction({
          action: 'view',
          db,
          meta: kbMeta,
          resourceId: 'kb-1',
          resourceType: 'knowledgeBase',
          userId: 'collaborator',
          workspaceId: 'ws-1',
        }),
      ).resolves.toBe(false);
    });

    it('a collaborator grant never pierces a private KB', async () => {
      permissionMatchesMock.mockImplementation(memberMatches as any);
      grantedLevelMock.mockResolvedValue('edit');

      await expect(
        canPerformResourceAction({
          action: 'view',
          db,
          meta: { ...kbMeta, visibility: 'private' },
          resourceId: 'kb-1',
          resourceType: 'knowledgeBase',
          userId: 'collaborator',
          workspaceId: 'ws-1',
        }),
      ).resolves.toBe(false);
      expect(grantedLevelMock).not.toHaveBeenCalled();
    });

    it('lets the creator browse their own use-level KB', async () => {
      permissionMatchesMock.mockImplementation(memberMatches as any);
      effectiveAccessMock.mockResolvedValue('use');

      await expect(
        canPerformResourceAction({
          action: 'view',
          db,
          meta: kbMeta,
          resourceId: 'kb-1',
          resourceType: 'knowledgeBase',
          userId: 'creator',
          workspaceId: 'ws-1',
        }),
      ).resolves.toBe(true);
      expect(effectiveAccessMock).not.toHaveBeenCalled();
    });
  });
});
