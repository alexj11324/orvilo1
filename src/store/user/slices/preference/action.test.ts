import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { userService } from '@/services/user';
import { useUserStore } from '@/store/user';
import { readUserDisplaySnapshot, writeUserDisplaySnapshot } from '@/store/user/displaySnapshot';
import { type UserGuide } from '@/types/user';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // The actions under test persist through the real userService; stub the
  // network boundary so optimistic-update tests never hit a live backend.
  vi.spyOn(userService, 'updatePreference').mockResolvedValue(undefined as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createPreferenceSlice', () => {
  describe('updateGuideState', () => {
    it('should update guide state', () => {
      const { result } = renderHook(() => useUserStore());
      const guide: UserGuide = { topic: true };

      act(() => {
        result.current.updateGuideState(guide);
      });

      expect(result.current.preference.guide!.topic).toBeTruthy();
    });
  });

  describe('updatePreference', () => {
    it('should update preference', () => {
      const { result } = renderHook(() => useUserStore());

      act(() => {
        result.current.updatePreference({ hideSyncAlert: true });
      });

      expect(result.current.preference.hideSyncAlert).toEqual(true);
    });

    it('persists the preference after the server update succeeds', async () => {
      const updatePreferenceSpy = vi
        .spyOn(userService, 'updatePreference')
        .mockResolvedValue(undefined as any);

      act(() => {
        useUserStore.setState({ user: { avatar: 'avatar-a', id: 'user-a' } as any });
      });

      await act(async () => {
        await useUserStore.getState().updatePreference({
          lab: { enableProjects: true },
        });
      });

      expect(updatePreferenceSpy).toHaveBeenCalled();
      expect(readUserDisplaySnapshot('user-a')).toEqual({
        preference: expect.objectContaining({
          lab: expect.objectContaining({ enableProjects: true }),
        }),
      });
    });

    it('sends only the requested patch when the local preference cache is stale', async () => {
      const updatePreferenceSpy = vi
        .spyOn(userService, 'updatePreference')
        .mockResolvedValue(undefined as any);

      act(() => {
        useUserStore.setState({
          preference: {
            fontFamily: 'Inter',
            showInCollaboration: true,
          },
        });
      });

      await act(async () => {
        await useUserStore.getState().updatePreference({ fontFamily: 'Geist' });
      });

      expect(updatePreferenceSpy).toHaveBeenCalledWith({ fontFamily: 'Geist' });
      expect(useUserStore.getState().preference).toMatchObject({
        fontFamily: 'Geist',
        showInCollaboration: true,
      });
    });

    it('rolls back and does not persist a failed preference update', async () => {
      let rejectUpdate: ((error: Error) => void) | undefined;
      vi.spyOn(userService, 'updatePreference').mockImplementation(
        () =>
          new Promise((_, reject) => {
            rejectUpdate = reject;
          }),
      );

      act(() => {
        useUserStore.setState({
          preference: { showInCollaboration: true },
          user: { avatar: 'avatar-a', id: 'user-a' } as any,
        });
      });

      const update = useUserStore.getState().updatePreference({ showInCollaboration: false });
      expect(useUserStore.getState().preference.showInCollaboration).toBe(false);

      rejectUpdate?.(new Error('update failed'));
      await expect(update).rejects.toThrow('update failed');
      expect(useUserStore.getState().preference.showInCollaboration).toBe(true);
      expect(readUserDisplaySnapshot('user-a')).toBeUndefined();
    });

    it('does not roll back a newer preference update when an older request fails', async () => {
      let rejectFirstUpdate: ((error: Error) => void) | undefined;
      vi.spyOn(userService, 'updatePreference')
        .mockImplementationOnce(
          () =>
            new Promise((_, reject) => {
              rejectFirstUpdate = reject;
            }),
        )
        .mockResolvedValueOnce(undefined as any);

      act(() => {
        useUserStore.setState({ preference: { showInCollaboration: true } });
      });

      const firstUpdate = useUserStore.getState().updatePreference({ showInCollaboration: false });
      await useUserStore.getState().updatePreference({ hideSyncAlert: true });

      rejectFirstUpdate?.(new Error('first update failed'));
      await expect(firstUpdate).rejects.toThrow('first update failed');
      expect(useUserStore.getState().preference).toMatchObject({
        hideSyncAlert: true,
        showInCollaboration: false,
      });
    });

    it('persists under the user id captured before an update can switch accounts', async () => {
      let resolveUpdate: (() => void) | undefined;
      const updatePreferenceSpy = vi.spyOn(userService, 'updatePreference').mockImplementation(
        () =>
          new Promise<Awaited<ReturnType<typeof userService.updatePreference>>>((resolve) => {
            resolveUpdate = () => resolve(undefined);
          }),
      );

      act(() => {
        useUserStore.setState({ user: { avatar: 'avatar-a', id: 'user-a' } });
      });

      let updatePromise: Promise<void> | undefined;
      act(() => {
        updatePromise = useUserStore.getState().updatePreference({ lab: { enableProjects: true } });
      });
      writeUserDisplaySnapshot('user-a', { avatar: 'updated-avatar' });

      act(() => {
        useUserStore.setState({ user: { avatar: 'avatar-b', id: 'user-b' } });
      });

      expect(resolveUpdate).toBeDefined();
      await act(async () => {
        resolveUpdate?.();
        await updatePromise;
      });

      expect(updatePreferenceSpy).toHaveBeenCalled();
      expect(readUserDisplaySnapshot('user-a')).toEqual({
        avatar: 'updated-avatar',
        preference: expect.objectContaining({
          lab: expect.objectContaining({ enableProjects: true }),
        }),
      });
      expect(readUserDisplaySnapshot('user-b')).toBeUndefined();
    });
  });
});
