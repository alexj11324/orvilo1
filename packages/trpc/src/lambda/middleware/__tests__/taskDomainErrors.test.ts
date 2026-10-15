import { TaskDomainError } from '@orvilo/database/errors/task';
import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';

import { trpc } from '../../init';
import { taskDomainErrors } from '../taskDomainErrors';

const callFailingProcedure = (error: Error) => {
  const router = trpc.router({
    fail: trpc.procedure.use(taskDomainErrors).query(() => {
      throw error;
    }),
  });
  return router.createCaller({} as never).fail();
};

describe('task domain RPC boundary', () => {
  it('preserves permission failures as forbidden', async () => {
    await expect(
      callFailingProcedure(
        new TaskDomainError({
          code: 'FORBIDDEN',
          message: 'Workspace Issue access required',
        }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'Workspace Issue access required' });
  });

  it('unwraps internal service wrappers and retains relation rejection metadata', async () => {
    await expect(
      callFailingProcedure(
        new TRPCError({
          cause: new TaskDomainError({
            cause: { data: { code: 'CYCLE' } },
            code: 'BAD_REQUEST',
            message: 'Cycle',
          }),
          code: 'INTERNAL_SERVER_ERROR',
        }),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', cause: { data: { code: 'CYCLE' } } });
  });

  it('preserves explicit transport decisions', async () => {
    await expect(
      callFailingProcedure(
        new TRPCError({
          cause: new TaskDomainError({ code: 'FORBIDDEN', message: 'Private detail' }),
          code: 'NOT_FOUND',
          message: 'Task not found',
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Task not found' });
  });

  it('leaves unexpected failures as internal errors', async () => {
    await expect(callFailingProcedure(new Error('database unavailable'))).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });
});
