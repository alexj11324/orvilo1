// @vitest-environment node
import { Plans } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getReferralStatus,
  getSubscriptionPlan,
  onUserActivityForBusiness,
} from '@/business/server/user';
import { MessageModel } from '@/database/models/message';
import { SessionModel } from '@/database/models/session';
import { UserModel } from '@/database/models/user';
import { serverDB } from '@/database/server';
import { router } from '@/libs/trpc/lambda';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';

import { userRouter } from '../user';

// mounts userRouter under its production namespace so the apiKeyScopeGuard
// derives the real `user.*` path for API-key-authenticated calls
const namespacedRouter = router({ user: userRouter });

const mockAfterTasks = vi.hoisted((): Promise<void>[] => []);
const mockSetUserPresenceVisibility = vi.hoisted(() => vi.fn());

// Mock modules
vi.mock('@/server/utils/scheduleAfterResponse', () => ({
  after: (callback: () => Promise<void> | void) => {
    mockAfterTasks.push(Promise.resolve(callback()));
  },
}));

vi.mock('@/business/server/user', () => ({
  getReferralStatus: vi.fn(),
  getSubscriptionPlan: vi.fn(),
  onUserActivityForBusiness: vi.fn(),
}));

vi.mock('@/database/server', () => ({
  serverDB: {},
}));

vi.mock('@/database/models/message');
vi.mock('@/database/models/rbac');
vi.mock('@/database/models/session');
vi.mock('@/database/models/user');
vi.mock('@/server/modules/KeyVaultsEncrypt');
vi.mock('@/server/modules/S3');
vi.mock('@/server/services/user');
vi.mock('@/server/services/collaboration', () => ({
  getRoomPublisher: () => ({ setUserPresenceVisibility: mockSetUserPresenceVisibility }),
}));
describe('userRouter', () => {
  const mockUserId = 'test-user-id';
  const mockCtx = {
    userId: mockUserId,
  };

  const flushAfterTasks = async () => {
    await Promise.all(mockAfterTasks.splice(0));
  };

  beforeEach(() => {
    mockAfterTasks.length = 0;
    vi.clearAllMocks();
    mockSetUserPresenceVisibility.mockReset();
    mockSetUserPresenceVisibility.mockResolvedValue(undefined);
    vi.mocked(getReferralStatus).mockResolvedValue(undefined);
    vi.mocked(getSubscriptionPlan).mockResolvedValue(Plans.Free);
    vi.mocked(onUserActivityForBusiness).mockResolvedValue(undefined);
  });

  describe('getUserActivitySummary', () => {
    it('returns the user-level activity summary', async () => {
      const summary = {
        lastUserMessageAt: new Date('2026-06-01T00:00:00.000Z'),
        userCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      vi.mocked(UserModel).mockImplementation(function () {
        return {
          getUserActivitySummary: vi.fn().mockResolvedValue(summary),
        } as any;
      });

      const result = await userRouter.createCaller({ ...mockCtx }).getUserActivitySummary();

      expect(result).toEqual(summary);
      expect(UserModel).toHaveBeenCalledWith(serverDB, mockUserId);
    });
  });

  describe('getUserRegistrationDuration', () => {
    it('should return registration duration', async () => {
      const mockDuration = { duration: 100, createdAt: '2023-01-01', updatedAt: '2023-01-02' };
      vi.mocked(UserModel).mockImplementation(function () {
        return {
          getUserRegistrationDuration: vi.fn().mockResolvedValue(mockDuration),
        } as any;
      });

      const result = await userRouter.createCaller({ ...mockCtx }).getUserRegistrationDuration();

      expect(result).toEqual(mockDuration);
      expect(UserModel).toHaveBeenCalledWith(serverDB, mockUserId);
    });
  });

  describe('getUserSSOProviders', () => {
    it('should return SSO providers', async () => {
      const mockProviders = [
        {
          provider: 'google',
          providerAccountId: '123',
          userId: 'user-1',
          type: 'oauth',
        },
      ];
      vi.mocked(UserModel).mockImplementation(function () {
        return {
          getUserSSOProviders: vi.fn().mockResolvedValue(mockProviders),
        } as any;
      });

      const result = await userRouter.createCaller({ ...mockCtx }).getUserSSOProviders();

      expect(result).toEqual(mockProviders);
      expect(UserModel).toHaveBeenCalledWith(serverDB, mockUserId);
    });
  });

  describe('getUserState', () => {
    it('should return user state', async () => {
      const mockState = {
        isOnboarded: true,
        preference: { telemetry: true },
        settings: {},
        userId: mockUserId,
      };

      vi.mocked(UserModel).mockImplementation(function () {
        return {
          advanceLastActiveAt: vi.fn().mockResolvedValue(undefined),
          getUserState: vi.fn().mockResolvedValue(mockState),
          updateUser: vi.fn().mockResolvedValue({ rowCount: 1 }),
        } as any;
      });

      vi.mocked(MessageModel).mockImplementation(function () {
        return {
          countUpTo: vi.fn().mockResolvedValue(5),
        } as any;
      });

      vi.mocked(SessionModel).mockImplementation(function () {
        return {
          hasMoreThanN: vi.fn().mockResolvedValue(true),
        } as any;
      });

      const result = await userRouter.createCaller({ ...mockCtx }).getUserState();

      expect(result).toMatchObject({
        isOnboard: true,
        preference: { telemetry: true },
        settings: {},
        hasConversation: true,
        canEnablePWAGuide: true,
        canEnableTrace: true,
        userId: mockUserId,
      });
    });

    it('should invoke the user activity hook after winning the lastActiveAt update', async () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const previousLastActiveAt = new Date('2026-03-01T00:00:00.000Z');
      const advanceLastActiveAt = vi.fn().mockResolvedValue({
        previousLastActiveAt,
        userCreatedAt: createdAt,
      });
      const mockState = {
        isOnboarded: true,
        preference: {},
        settings: {},
        userId: mockUserId,
      };

      vi.mocked(UserModel).mockImplementation(function () {
        return {
          advanceLastActiveAt,
          getUserState: vi.fn().mockResolvedValue(mockState),
        } as any;
      });
      vi.mocked(MessageModel).mockImplementation(function () {
        return {
          countUpTo: vi.fn().mockResolvedValue(0),
        } as any;
      });
      vi.mocked(SessionModel).mockImplementation(function () {
        return {
          hasMoreThanN: vi.fn().mockResolvedValue(false),
        } as any;
      });

      await userRouter.createCaller({ ...mockCtx }).getUserState();
      await flushAfterTasks();

      expect(advanceLastActiveAt).toHaveBeenCalledWith(expect.any(Date));
      expect(onUserActivityForBusiness).toHaveBeenCalledWith({
        currentTime: expect.any(Date),
        previousLastActiveAt,
        userCreatedAt: createdAt,
        userId: mockUserId,
      });
    });

    it('should skip the user activity hook when a concurrent request already updated lastActiveAt', async () => {
      const advanceLastActiveAt = vi.fn().mockResolvedValue(undefined);
      const mockState = {
        isOnboarded: true,
        preference: {},
        settings: {},
        userId: mockUserId,
      };

      vi.mocked(UserModel).mockImplementation(function () {
        return {
          advanceLastActiveAt,
          getUserState: vi.fn().mockResolvedValue(mockState),
        } as any;
      });
      vi.mocked(MessageModel).mockImplementation(function () {
        return {
          countUpTo: vi.fn().mockResolvedValue(0),
        } as any;
      });
      vi.mocked(SessionModel).mockImplementation(function () {
        return {
          hasMoreThanN: vi.fn().mockResolvedValue(false),
        } as any;
      });

      await userRouter.createCaller({ ...mockCtx }).getUserState();
      await flushAfterTasks();

      expect(advanceLastActiveAt).toHaveBeenCalledWith(expect.any(Date));
      expect(onUserActivityForBusiness).not.toHaveBeenCalled();
    });
  });

  describe('makeUserOnboarded', () => {
    it('should update user onboarded status', async () => {
      vi.mocked(UserModel).mockImplementation(function () {
        return {
          updateUser: vi.fn().mockResolvedValue({ rowCount: 1 }),
        } as any;
      });

      await userRouter.createCaller({ ...mockCtx }).makeUserOnboarded();

      expect(UserModel).toHaveBeenCalledWith(serverDB, mockUserId);
    });
  });

  describe('updatePreference', () => {
    it('conceals all live presence before persisting a personal opt-out', async () => {
      const getUserPreference = vi.fn().mockResolvedValue({ showInCollaboration: true });
      const updatePreference = vi.fn().mockResolvedValue({ rowCount: 1 });
      vi.mocked(UserModel).mockImplementation(function () {
        return { getUserPreference, updatePreference } as any;
      });

      await userRouter
        .createCaller({ ...mockCtx })
        .updatePreference({ showInCollaboration: false });

      expect(updatePreference).toHaveBeenCalledWith(
        expect.objectContaining({
          collaborationVisibilityEpoch: expect.any(String),
          showInCollaboration: false,
        }),
      );
      expect(mockSetUserPresenceVisibility).toHaveBeenCalledWith(
        mockUserId,
        false,
        expect.any(String),
      );
      expect(mockSetUserPresenceVisibility.mock.invocationCallOrder[0]).toBeLessThan(
        updatePreference.mock.invocationCallOrder[0],
      );
    });

    it('does not send a control when visibility is already enabled', async () => {
      const getUserPreference = vi.fn().mockResolvedValue({ showInCollaboration: true });
      const updatePreference = vi.fn().mockResolvedValue({ rowCount: 1 });
      vi.mocked(UserModel).mockImplementation(function () {
        return { getUserPreference, updatePreference } as any;
      });

      await userRouter.createCaller({ ...mockCtx }).updatePreference({ showInCollaboration: true });

      expect(mockSetUserPresenceVisibility).not.toHaveBeenCalled();
    });

    it('reveals only after persisting the visibility preference', async () => {
      const getUserPreference = vi.fn().mockResolvedValue({ showInCollaboration: false });
      const updatePreference = vi.fn().mockResolvedValue({ rowCount: 1 });
      vi.mocked(UserModel).mockImplementation(function () {
        return { getUserPreference, updatePreference } as any;
      });

      await userRouter.createCaller({ ...mockCtx }).updatePreference({ showInCollaboration: true });

      expect(mockSetUserPresenceVisibility).toHaveBeenCalledWith(
        mockUserId,
        true,
        expect.any(String),
      );
      expect(updatePreference.mock.invocationCallOrder[0]).toBeLessThan(
        mockSetUserPresenceVisibility.mock.invocationCallOrder[0],
      );
    });

    it('rolls the preference back to hidden when reveal control fails', async () => {
      const getUserPreference = vi.fn().mockResolvedValue({ showInCollaboration: false });
      const updatePreference = vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });
      vi.mocked(UserModel).mockImplementation(function () {
        return { getUserPreference, updatePreference } as any;
      });
      mockSetUserPresenceVisibility.mockRejectedValueOnce(new Error('gateway unavailable'));

      await expect(
        userRouter.createCaller({ ...mockCtx }).updatePreference({ showInCollaboration: true }),
      ).rejects.toThrow('gateway unavailable');
      expect(updatePreference.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          collaborationVisibilityEpoch: expect.any(String),
          showInCollaboration: true,
        }),
      );
      expect(updatePreference.mock.calls.at(-1)?.[0]).toEqual(
        expect.objectContaining({
          collaborationVisibilityEpoch: expect.any(String),
          showInCollaboration: false,
        }),
      );
    });

    it('does not persist the opt-out when stale sockets cannot be concealed', async () => {
      const getUserPreference = vi.fn().mockResolvedValue({ showInCollaboration: true });
      const updatePreference = vi.fn().mockResolvedValue({ rowCount: 1 });
      vi.mocked(UserModel).mockImplementation(function () {
        return { getUserPreference, updatePreference } as any;
      });
      mockSetUserPresenceVisibility.mockRejectedValueOnce(new Error('gateway unavailable'));

      await expect(
        userRouter.createCaller({ ...mockCtx }).updatePreference({ showInCollaboration: false }),
      ).rejects.toThrow('gateway unavailable');
      expect(updatePreference).not.toHaveBeenCalled();
    });

    it('compensates concealment if preference persistence fails afterward', async () => {
      const getUserPreference = vi.fn().mockResolvedValue({ showInCollaboration: true });
      const updatePreference = vi.fn().mockRejectedValue(new Error('database unavailable'));
      vi.mocked(UserModel).mockImplementation(function () {
        return { getUserPreference, updatePreference } as any;
      });

      await expect(
        userRouter.createCaller({ ...mockCtx }).updatePreference({ showInCollaboration: false }),
      ).rejects.toThrow('database unavailable');
      expect(mockSetUserPresenceVisibility.mock.calls).toEqual([
        [mockUserId, false, expect.any(String)],
        [mockUserId, true, undefined],
      ]);
    });

    it('does not re-conceal on unrelated saves when the stored preference is already false', async () => {
      const getUserPreference = vi.fn().mockResolvedValue({ showInCollaboration: false });
      const updatePreference = vi.fn().mockResolvedValue({ rowCount: 1 });
      vi.mocked(UserModel).mockImplementation(function () {
        return { getUserPreference, updatePreference } as any;
      });

      await userRouter.createCaller({ ...mockCtx }).updatePreference({
        hideSyncAlert: true,
        showInCollaboration: false,
      });

      expect(mockSetUserPresenceVisibility).not.toHaveBeenCalled();
      expect(updatePreference).toHaveBeenCalledWith({
        hideSyncAlert: true,
        showInCollaboration: false,
      });
    });
  });

  describe('updateSettings', () => {
    it('ignores keyVaults writes and never persists credentials', async () => {
      const updateSetting = vi.fn().mockResolvedValue({ rowCount: 1 });
      vi.mocked(UserModel).mockImplementation(function () {
        return { updateSetting } as any;
      });

      await userRouter.createCaller({ ...mockCtx }).updateSettings({
        keyVaults: { openai: { key: 'test-key' } },
        general: { language: 'en-US' },
      });

      expect(KeyVaultsGateKeeper.initWithEnvKey).not.toHaveBeenCalled();
      expect(updateSetting).toHaveBeenCalledWith({ general: { language: 'en-US' } });
    });

    it('accepts but ignores keyVaults writes from restricted keys', async () => {
      const updateSetting = vi.fn().mockResolvedValue({ rowCount: 1 });
      vi.mocked(UserModel).mockImplementation(function () {
        return { updateSetting } as any;
      });

      await namespacedRouter
        .createCaller({ ...mockCtx, apiKeyScopes: ['user:write'] })
        .user.updateSettings({ keyVaults: { openai: { key: 'stolen' } } });

      expect(updateSetting).toHaveBeenCalledWith({});
    });

    it('rejects market token updates from restricted keys without model:write', async () => {
      await expect(
        namespacedRouter
          .createCaller({ ...mockCtx, apiKeyScopes: ['user:write'] })
          .user.updateSettings({ market: { accessToken: 'x' } } as any),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('model:write'),
      });
    });

    it('does not touch stored keyVaults when the field is omitted', async () => {
      const updateSetting = vi.fn().mockResolvedValue({ rowCount: 1 });
      vi.mocked(UserModel).mockImplementation(function () {
        return { updateSetting } as any;
      });

      await userRouter.createCaller({ ...mockCtx }).updateSettings({
        general: { language: 'en-US' },
      } as any);

      expect(updateSetting.mock.calls[0][0]).not.toHaveProperty('keyVaults');
    });

    it('should update settings without key vaults', async () => {
      const mockSettings = {
        general: { language: 'en-US' },
      };

      vi.mocked(UserModel).mockImplementation(function () {
        return {
          updateSetting: vi.fn().mockResolvedValue({ rowCount: 1 }),
        } as any;
      });

      await userRouter.createCaller({ ...mockCtx }).updateSettings(mockSettings);

      expect(UserModel).toHaveBeenCalledWith(serverDB, mockUserId);
    });

    it('should allow legacy system agent model-only fields', async () => {
      const updateSetting = vi.fn().mockResolvedValue({ rowCount: 1 });

      vi.mocked(UserModel).mockImplementation(function () {
        return {
          updateSetting,
        } as any;
      });

      await userRouter.createCaller({ ...mockCtx }).updateSettings({
        systemAgent: {
          queryRewrite: { model: 'ag/gemini-3.1-pro-high' },
          topic: { model: 'ag/gemini-3.1-pro-high' },
        },
      });

      expect(updateSetting).toHaveBeenCalledWith(
        expect.objectContaining({
          systemAgent: {
            queryRewrite: { model: 'ag/gemini-3.1-pro-high' },
            topic: { model: 'ag/gemini-3.1-pro-high' },
          },
        }),
      );
    });

    it('should allow legacy scalar system agent fields', async () => {
      const updateSetting = vi.fn().mockResolvedValue({ rowCount: 1 });

      vi.mocked(UserModel).mockImplementation(function () {
        return {
          updateSetting,
        } as any;
      });

      await userRouter.createCaller({ ...mockCtx }).updateSettings({
        systemAgent: {
          enableAutoReply: true,
          replyMessage: 'Custom auto reply',
        },
      });

      expect(updateSetting).toHaveBeenCalledWith(
        expect.objectContaining({
          systemAgent: {
            enableAutoReply: true,
            replyMessage: 'Custom auto reply',
          },
        }),
      );
    });
  });

  describe('updateToolIntervention', () => {
    it('delegates to the atomic model merge with the raw input', async () => {
      const mergeToolInterventionSetting = vi.fn().mockResolvedValue({ rowCount: 1 });
      vi.mocked(UserModel).mockImplementation(function () {
        return { mergeToolInterventionSetting } as any;
      });

      await userRouter.createCaller({ ...mockCtx }).updateToolIntervention({
        appendAllowList: ['bash/bash'],
        approvalMode: 'auto-run',
      });

      // Merge semantics (sibling-key preservation, allowList union, concurrency)
      // are covered by the UserModel integration tests against a real database.
      expect(mergeToolInterventionSetting).toHaveBeenCalledWith({
        appendAllowList: ['bash/bash'],
        approvalMode: 'auto-run',
      });
    });

    it('rejects workspace members without content permission', async () => {
      const { RbacModel } = await import('@/database/models/rbac');
      vi.mocked(RbacModel).mockImplementation(function () {
        return { hasAnyPermission: vi.fn().mockResolvedValue(false) } as any;
      });

      await expect(
        userRouter
          .createCaller({ ...mockCtx, workspaceId: 'ws_1' } as any)
          .updateToolIntervention({ approvalMode: 'auto-run' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('allows workspace members holding content permission', async () => {
      const { RbacModel } = await import('@/database/models/rbac');
      vi.mocked(RbacModel).mockImplementation(function () {
        return { hasAnyPermission: vi.fn().mockResolvedValue(true) } as any;
      });

      const mergeToolInterventionSetting = vi.fn().mockResolvedValue({ rowCount: 1 });
      vi.mocked(UserModel).mockImplementation(function () {
        return { mergeToolInterventionSetting } as any;
      });

      await userRouter
        .createCaller({ ...mockCtx, workspaceId: 'ws_1' } as any)
        .updateToolIntervention({ approvalMode: 'auto-run' });

      expect(mergeToolInterventionSetting).toHaveBeenCalledWith({ approvalMode: 'auto-run' });
    });
  });

  describe('updateUninstalledBuiltinTools', () => {
    it('patches the slot pinned by the input workspace, gated on that workspace', async () => {
      const { RbacModel } = await import('@/database/models/rbac');
      const hasAnyPermission = vi.fn().mockResolvedValue(true);
      vi.mocked(RbacModel).mockImplementation(function () {
        return { hasAnyPermission } as any;
      });

      const replaceUninstalledBuiltinToolsSetting = vi.fn().mockResolvedValue({ rowCount: 1 });
      vi.mocked(UserModel).mockImplementation(function () {
        return { replaceUninstalledBuiltinToolsSetting } as any;
      });

      // ctx carries a DIFFERENT workspace than the pinned target — the write and
      // the RBAC check must both follow the pinned input scope, not the header.
      await userRouter
        .createCaller({ ...mockCtx, workspaceId: 'ws_other' } as any)
        .updateUninstalledBuiltinTools({ uninstalledBuiltinTools: ['dalle'], workspaceId: 'ws_1' });

      expect(hasAnyPermission).toHaveBeenCalledWith(expect.anything(), { workspaceId: 'ws_1' });
      expect(replaceUninstalledBuiltinToolsSetting).toHaveBeenCalledWith({
        uninstalledBuiltinTools: ['dalle'],
        workspaceId: 'ws_1',
      });
    });

    it('targets the personal scope when the pinned workspace is null', async () => {
      const replaceUninstalledBuiltinToolsSetting = vi.fn().mockResolvedValue({ rowCount: 1 });
      vi.mocked(UserModel).mockImplementation(function () {
        return { replaceUninstalledBuiltinToolsSetting } as any;
      });

      await userRouter
        .createCaller({ ...mockCtx })
        .updateUninstalledBuiltinTools({ uninstalledBuiltinTools: [], workspaceId: null });

      expect(replaceUninstalledBuiltinToolsSetting).toHaveBeenCalledWith({
        uninstalledBuiltinTools: [],
        workspaceId: null,
      });
    });

    it('rejects members without content permission on the target workspace', async () => {
      const { RbacModel } = await import('@/database/models/rbac');
      vi.mocked(RbacModel).mockImplementation(function () {
        return { hasAnyPermission: vi.fn().mockResolvedValue(false) } as any;
      });

      await expect(
        userRouter
          .createCaller({ ...mockCtx, workspaceId: 'ws_1' } as any)
          .updateUninstalledBuiltinTools({
            uninstalledBuiltinTools: ['dalle'],
            workspaceId: 'ws_1',
          }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
