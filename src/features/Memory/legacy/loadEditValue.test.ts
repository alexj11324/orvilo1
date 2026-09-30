import { afterEach, describe, expect, it, vi } from 'vitest';

import { userMemoryService } from '@/services/userMemory';
import { LayersEnum } from '@/types/userMemory';

import { loadMemoryEditValue } from './loadEditValue';

afterEach(() => vi.restoreAllMocks());
describe('activity edit content', () => {
  it('loads the full narrative instead of the abbreviated list summary', async () => {
    vi.spyOn(userMemoryService, 'getMemoryDetail').mockResolvedValue({
      layer: LayersEnum.Activity,
      activity: { narrative: 'Full original narrative' },
    } as never);
    expect(await loadMemoryEditValue('activity', LayersEnum.Activity, 'Short summary')).toBe(
      'Full original narrative',
    );
  });
  it('does not return the summary when detail loading fails', async () => {
    vi.spyOn(userMemoryService, 'getMemoryDetail').mockRejectedValue(new Error('offline'));
    await expect(
      loadMemoryEditValue('activity', LayersEnum.Activity, 'Short summary'),
    ).rejects.toThrow('offline');
  });
  it('refuses missing detail rather than opening an empty destructive edit', async () => {
    vi.spyOn(userMemoryService, 'getMemoryDetail').mockResolvedValue(null);
    await expect(
      loadMemoryEditValue('activity', LayersEnum.Activity, 'Short summary'),
    ).rejects.toThrow('Activity unavailable');
  });
});
