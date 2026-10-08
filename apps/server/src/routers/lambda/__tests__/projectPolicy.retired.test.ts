import { describe, expect, it } from 'vitest';

import { projectRouter } from '../project';

describe('retired Project orchestration policy API', () => {
  it.each(['getOrchestrationPolicy', 'updateOrchestrationPolicy'])(
    'does not expose or resolve %s',
    async (procedure) => {
      expect(projectRouter._def.procedures).not.toHaveProperty(procedure);
      const caller = projectRouter.createCaller({} as never);
      const retiredCaller = caller as unknown as Record<
        string,
        (input: { id: string }) => Promise<unknown>
      >;
      await expect(retiredCaller[procedure]({ id: 'project-1' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    },
  );
});
