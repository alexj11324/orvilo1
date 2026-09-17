import type { LobeChatDatabase } from '@orvilo/database';
import { describe, expect, it, vi } from 'vitest';

import { filterMemoryExtractionEnabledUsers, isUserMemoryExtractionEnabled } from '../gate';

/**
 * The gate is pure server-side: it only reads `userSettings.memory.enabled`
 * and never trusts a client-supplied purpose or flag. Missing settings or a
 * null `memory` column mean enabled (opt-out).
 */
const createDbWithMemory = (memory: unknown) =>
  ({
    query: {
      userSettings: {
        findFirst: vi.fn(async () => (memory === undefined ? undefined : { memory })),
      },
    },
  }) as unknown as LobeChatDatabase;

const createDbWithDisabledIds = (disabledIds: string[]) =>
  ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => disabledIds.map((id) => ({ id }))),
      })),
    })),
  }) as unknown as LobeChatDatabase;

describe('isUserMemoryExtractionEnabled', () => {
  it('returns true when the user has no settings row', async () => {
    const db = createDbWithMemory(undefined);

    await expect(isUserMemoryExtractionEnabled('u1', db)).resolves.toBe(true);
  });

  it('returns true when memory settings are missing or enabled', async () => {
    await expect(isUserMemoryExtractionEnabled('u1', createDbWithMemory(null))).resolves.toBe(true);
    await expect(
      isUserMemoryExtractionEnabled('u1', createDbWithMemory({ enabled: true })),
    ).resolves.toBe(true);
    await expect(
      isUserMemoryExtractionEnabled('u1', createDbWithMemory({ effort: 'high' })),
    ).resolves.toBe(true);
  });

  it('returns false only when memory.enabled is explicitly false', async () => {
    await expect(
      isUserMemoryExtractionEnabled('u1', createDbWithMemory({ enabled: false })),
    ).resolves.toBe(false);
  });
});

describe('filterMemoryExtractionEnabledUsers', () => {
  it('returns empty groups for an empty input', async () => {
    const db = createDbWithDisabledIds([]);

    await expect(filterMemoryExtractionEnabledUsers([], db)).resolves.toEqual({
      enabledUserIds: [],
      skippedUserIds: [],
    });
  });

  it('splits explicit targets into enabled and skipped groups', async () => {
    const db = createDbWithDisabledIds(['u2']);

    await expect(filterMemoryExtractionEnabledUsers(['u1', 'u2', 'u3'], db)).resolves.toEqual({
      enabledUserIds: ['u1', 'u3'],
      skippedUserIds: ['u2'],
    });
  });

  it('dedupes and drops blank ids before querying', async () => {
    const db = createDbWithDisabledIds([]);

    const result = await filterMemoryExtractionEnabledUsers(['u1', 'u1', '', 'u2'], db);

    expect(result).toEqual({ enabledUserIds: ['u1', 'u2'], skippedUserIds: [] });
  });
});
