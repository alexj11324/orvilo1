import type { Context } from 'hono';

import { invokeHonoHandler } from './workflowTasks';

describe('invokeHonoHandler', () => {
  it('adapts a stored workflow payload to the Hono request contract', async () => {
    const result = await invokeHonoHandler(
      async (context: Context) => {
        const body = await context.req.json();
        return context.json({ body });
      },
      {
        body: { operationId: 'op-1' },
        dispatchId: '00000000-0000-4000-8000-000000000001',
        headers: { 'X-Trace': 'trace-1' },
        workflowRunId: 'run-1',
      },
    );

    expect(result).toEqual({ body: { operationId: 'op-1' } });
  });

  it('surfaces non-success responses for Hatchet retry handling', async () => {
    await expect(
      invokeHonoHandler(async (context: Context) => context.json({ error: 'temporary' }, 503), {
        body: {},
        dispatchId: '00000000-0000-4000-8000-000000000002',
        workflowRunId: 'run-2',
      }),
    ).rejects.toThrow('temporary');
  });
});
