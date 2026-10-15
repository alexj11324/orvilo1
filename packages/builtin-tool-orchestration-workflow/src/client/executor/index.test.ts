import { describe, expect, it, vi } from 'vitest';

const onAfterCall = vi.hoisted(() => vi.fn());

vi.mock('@orvilo/builtin-tool-task/client/executor', () => ({ taskExecutor: { onAfterCall } }));

const { goalExecutor } = await import('./index');
const { OrchestrationWorkflowManifest } = await import('../../manifest');
const { OrchestrationWorkflowApiName } = await import('../../types');

describe('orchestration workflow client executor', () => {
  it('is declared server-only in the manifest', () => {
    expect(OrchestrationWorkflowManifest.executors).toEqual(['server']);
  });

  it.each(Object.values(OrchestrationWorkflowApiName))(
    '%s is rejected explicitly instead of running a retired client path',
    async (apiName) => {
      // The ID-only `start` payload used to be read as an empty `criteria` array.
      const result = await (
        goalExecutor as unknown as Record<string, (p: unknown, c: unknown) => Promise<any>>
      )[apiName]({ orchestrationWorkflowId: 'wf_1' }, { agentId: 'agt_1' });

      expect(result.success).toBe(false);
      expect(result.error.type).toBe('ServerRuntimeOnly');
    },
  );

  it('still forwards the after-call hook to the task executor', async () => {
    const context = { apiName: 'x' } as never;
    await goalExecutor.onAfterCall(context);
    expect(onAfterCall).toHaveBeenCalledWith(context);
  });
});
