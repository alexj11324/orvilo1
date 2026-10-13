import type { WorkQuery } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { lambdaClient } from '@/libs/trpc/client';

import { workAttentionService } from './workAttention';

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    workAttention: {
      myWork: { query: vi.fn().mockResolvedValue({ data: [] }) },
      query: { query: vi.fn().mockResolvedValue({ data: [] }) },
    },
  },
}));

describe('workAttentionService lane contracts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('omits reviewer lanes from myWork while preserving its other query fields', async () => {
    await workAttentionService.myWork({
      afterId: 'task-1',
      groupBy: 'reviewer',
      mode: 'assigned',
      subGroupBy: 'reviewer',
    });
    expect(lambdaClient.workAttention.myWork.query).toHaveBeenCalledWith({
      afterId: 'task-1',
      groupBy: 'reviewer',
      mode: 'assigned',
    });
  });

  it('preserves supported myWork lanes', async () => {
    await workAttentionService.myWork({ mode: 'assigned', subGroupBy: 'priority' });
    expect(lambdaClient.workAttention.myWork.query).toHaveBeenCalledWith({
      mode: 'assigned',
      subGroupBy: 'priority',
    });
  });

  it('preserves reviewer lanes on the generic work query', async () => {
    const query: WorkQuery = {
      entityType: 'task',
      groupBy: 'status',
      schemaVersion: 2,
      subGroupBy: 'reviewer',
    };
    await workAttentionService.query({ query });
    expect(lambdaClient.workAttention.query.query).toHaveBeenCalledWith({ query });
  });
});
