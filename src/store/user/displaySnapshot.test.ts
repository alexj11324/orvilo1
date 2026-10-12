import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalStorageQueryProjectionStorage } from '@/libs/queryProjectionStorage';

import {
  clearUserDisplaySnapshot,
  readUserDisplaySnapshot,
  writeUserDisplaySnapshot,
} from './displaySnapshot';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('user display snapshot', () => {
  it('keeps the avatar and preference isolated by exact user id', () => {
    writeUserDisplaySnapshot('user-a', {
      avatar: '',
      preference: { showInCollaboration: false },
    });

    expect(readUserDisplaySnapshot('user-a')).toEqual({
      avatar: '',
      preference: { showInCollaboration: false },
    });
    expect(readUserDisplaySnapshot('user-b')).toBeUndefined();
  });

  it('merges partial writes without dropping the other display field', () => {
    writeUserDisplaySnapshot('user-a', {
      avatar: 'avatar-a',
    });
    writeUserDisplaySnapshot('user-a', {
      preference: { showInCollaboration: false },
    });

    expect(readUserDisplaySnapshot('user-a')).toEqual({
      avatar: 'avatar-a',
      preference: { showInCollaboration: false },
    });
  });

  it('clears only the requested user snapshot', () => {
    writeUserDisplaySnapshot('user-a', { avatar: 'avatar-a' });
    writeUserDisplaySnapshot('user-b', { avatar: 'avatar-b' });

    clearUserDisplaySnapshot('user-a');

    expect(readUserDisplaySnapshot('user-a')).toBeUndefined();
    expect(readUserDisplaySnapshot('user-b')).toEqual({ avatar: 'avatar-b' });
  });

  it('reads legacy Labs data without restoring retired preference fields', async () => {
    const legacyStorage = new LocalStorageQueryProjectionStorage<unknown>({
      namespace: 'orvilo:user-display-snapshot:v1',
    });
    await legacyStorage.set(
      { queryKey: 'display', scope: 'user-a' },
      {
        data: {
          avatar: 'legacy-avatar',
          preference: { lab: { enableProjects: true }, showInCollaboration: false },
        },
        updatedAt: 1,
      },
    );

    expect(readUserDisplaySnapshot('user-a')).toEqual({
      avatar: 'legacy-avatar',
      preference: { showInCollaboration: false },
    });
    expect(readUserDisplaySnapshot('user-b')).toBeUndefined();
  });

  it('ignores malformed persisted data', () => {
    vi.spyOn(localStorage, 'getItem').mockReturnValue('{malformed');

    expect(readUserDisplaySnapshot('user-a')).toBeUndefined();
  });

  it('does not throw when localStorage is unavailable', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(() =>
      writeUserDisplaySnapshot('user-a', {
        avatar: 'avatar-a',
      }),
    ).not.toThrow();
  });
});
