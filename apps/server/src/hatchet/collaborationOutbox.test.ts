import { describe, expect, it, vi } from 'vitest';

import { createCollaborationHatchetTasks } from './collaborationOutbox';

const mocks = vi.hoisted(() => ({ db: {}, recoverDue: vi.fn().mockResolvedValue(0) }));

vi.mock('@/database/server', () => ({ getServerDB: async () => mocks.db }));
vi.mock('@/server/services/automationResultDelivery', () => ({
  AutomationResultDeliveryService: { recoverDue: mocks.recoverDue },
}));
vi.mock('@/server/services/collaboration', () => ({ CollaborationOutboxProjector: vi.fn() }));

describe('automation result output cron input', () => {
  it.each([null, undefined, {}, { createdByUserId: 'member', workspaceId: 'workspace' }])(
    'accepts scheduled input %j and preserves explicit scopes',
    async (input) => {
      const tasks = createCollaborationHatchetTasks({ task: (config: unknown) => config } as never);
      await (tasks[1] as unknown as { fn: (input: unknown) => Promise<unknown> }).fn(input);
      expect(mocks.recoverDue).toHaveBeenLastCalledWith(mocks.db, input ?? {});
    },
  );
});
