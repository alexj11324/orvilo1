// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createCallerFactory } from '@/libs/trpc/lambda';
import { createContextInner } from '@/libs/trpc/lambda/context';

import { followUpActionRouter } from './followUpAction';

vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: vi.fn().mockResolvedValue({}) }));

const input = { modelConfig: { model: 'unused', provider: 'unused' }, topicId: 'topic-1' };

describe('retired follow-up suggestions', () => {
  it('returns a stable retirement error for authenticated legacy callers', async () => {
    const caller = createCallerFactory(followUpActionRouter)(
      await createContextInner({ userId: 'user-1' }),
    );
    await expect(caller.extract(input)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: 'FEATURE_RETIRED',
    });
  });

  it('still rejects unauthenticated callers', async () => {
    const caller = createCallerFactory(followUpActionRouter)(await createContextInner({}));
    await expect(caller.extract(input)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
