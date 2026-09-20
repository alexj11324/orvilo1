// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentRuntimeService } from '../AgentRuntimeService';
import { AgentStartError } from '../types';

/**
 * F09/R05 regression: `startExecution` must never report a successful no-op.
 * Under ACP there is no step queue — the durable `agent_operations` row is
 * written already `running` by dispatch itself (`recordStart`) — so this
 * surface is an "ensure started" assertion, not a starter:
 *
 *   running / parked  → idempotent `alreadyStarted` ack (repeat intents do
 *                       NOT mint a second run);
 *   terminal statuses → `terminal` rejection;
 *   `idle` / metadata-only → `never_dispatched` rejection — the intent was
 *                       prepared but no dispatch exists to release;
 *   unknown id        → `not_found`.
 */

const findByIdMock = vi.fn();
vi.mock('@/database/models/agentOperation', () => ({
  AgentOperationModel: vi.fn().mockImplementation(function () {
    return { findById: findByIdMock };
  }),
}));

vi.mock('@/database/models/message', () => ({
  MessageModel: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

const buildStateManager = (state?: { status?: string } | null, metadata?: unknown) => ({
  createOperationMetadata: vi.fn().mockResolvedValue(undefined),
  getOperationMetadata: vi.fn().mockResolvedValue(metadata ?? null),
  loadAgentState: vi.fn().mockResolvedValue(state ?? null),
  markInterrupted: vi.fn().mockResolvedValue(undefined),
  saveAgentState: vi.fn().mockResolvedValue(undefined),
});

const buildService = (stateManager: ReturnType<typeof buildStateManager>) =>
  new AgentRuntimeService({} as any, 'user_1', {
    stateManager: stateManager as any,
    streamEventManager: {} as any,
  });

const operationRow = (status: string) => ({
  id: 'op_1',
  status,
  userId: 'user_1',
});

describe('AgentRuntimeService.startExecution', () => {
  beforeEach(() => {
    findByIdMock.mockReset().mockResolvedValue(null);
  });

  describe('idle / never-dispatched operations', () => {
    it('rejects an idle operation row instead of returning a successful no-op', async () => {
      // The F09 bug: a legal idle op fell through to
      // `{ success: true, scheduled: false }` — a "start" that started nothing.
      findByIdMock.mockResolvedValue(operationRow('idle'));
      const stateManager = buildStateManager(null);
      const service = buildService(stateManager);

      await expect(service.startExecution({ operationId: 'op_1' })).rejects.toMatchObject({
        denial: 'never_dispatched',
        name: 'AgentStartError',
      });
      // No run was started: the service performs no state write whatsoever.
      expect(stateManager.saveAgentState).not.toHaveBeenCalled();
      expect(stateManager.createOperationMetadata).not.toHaveBeenCalled();
    });

    it('rejects an idle state snapshot even without a durable row', async () => {
      const stateManager = buildStateManager({ status: 'idle' }, { userId: 'user_1' });
      const service = buildService(stateManager);

      await expect(service.startExecution({ operationId: 'op_1' })).rejects.toBeInstanceOf(
        AgentStartError,
      );
      await expect(service.startExecution({ operationId: 'op_1' })).rejects.toMatchObject({
        denial: 'never_dispatched',
      });
    });

    it('rejects a stale-generation id — it can never mint a new run', async () => {
      // A prepared-but-never-dispatched row left behind by a superseded
      // generation must fail closed: an accepted start would either lie
      // (success-noop) or fork a generation nobody asked for.
      findByIdMock.mockResolvedValue(operationRow('idle'));
      const stateManager = buildStateManager(null);
      const service = buildService(stateManager);

      await expect(service.startExecution({ operationId: 'op_stale' })).rejects.toMatchObject({
        denial: 'never_dispatched',
      });
      expect(stateManager.saveAgentState).not.toHaveBeenCalled();
      expect(stateManager.createOperationMetadata).not.toHaveBeenCalled();
    });
  });

  describe('already-started operations — idempotent ack', () => {
    it.each(['running', 'waiting_for_human', 'waiting_for_async_tool'])(
      'returns alreadyStarted for %s without re-dispatching',
      async (status) => {
        findByIdMock.mockResolvedValue(operationRow(status));
        const stateManager = buildStateManager(null);
        const service = buildService(stateManager);

        const result = await service.startExecution({ operationId: 'op_1' });

        expect(result).toEqual({
          alreadyStarted: true,
          operationId: 'op_1',
          scheduled: false,
          success: true,
        });
        expect(stateManager.saveAgentState).not.toHaveBeenCalled();
      },
    );

    it('is idempotent: repeated start intents acknowledge the single existing run', async () => {
      findByIdMock.mockResolvedValue(operationRow('running'));
      const stateManager = buildStateManager(null);
      const service = buildService(stateManager);

      const first = await service.startExecution({ operationId: 'op_1' });
      const second = await service.startExecution({ operationId: 'op_1' });

      // Both calls agree the one run exists; neither mints a new generation.
      expect(first).toEqual(second);
      expect(second).toEqual({
        alreadyStarted: true,
        operationId: 'op_1',
        scheduled: false,
        success: true,
      });
      expect(stateManager.saveAgentState).not.toHaveBeenCalled();
      expect(stateManager.createOperationMetadata).not.toHaveBeenCalled();
    });

    it('reads the live state snapshot ahead of a stale row status', async () => {
      findByIdMock.mockResolvedValue(operationRow('idle'));
      const stateManager = buildStateManager({ status: 'running' });
      const service = buildService(stateManager);

      await expect(service.startExecution({ operationId: 'op_1' })).resolves.toEqual({
        alreadyStarted: true,
        operationId: 'op_1',
        scheduled: false,
        success: true,
      });
    });
  });

  describe('terminal operations — defined error semantics', () => {
    it.each(['done', 'error', 'interrupted', 'abandoned'])(
      'rejects a %s operation as terminal',
      async (status) => {
        findByIdMock.mockResolvedValue(operationRow(status));
        const stateManager = buildStateManager(null);
        const service = buildService(stateManager);

        await expect(service.startExecution({ operationId: 'op_1' })).rejects.toMatchObject({
          denial: 'terminal',
          name: 'AgentStartError',
        });
        expect(stateManager.saveAgentState).not.toHaveBeenCalled();
      },
    );

    it('rejects a start request after the run was interrupted', async () => {
      // "停止后的请求": an interrupted operation must not restart nor report success.
      findByIdMock.mockResolvedValue(operationRow('interrupted'));
      const stateManager = buildStateManager(null);

      await expect(
        buildService(stateManager).startExecution({ operationId: 'op_1' }),
      ).rejects.toMatchObject({ denial: 'terminal' });
    });
  });

  describe('unknown operations', () => {
    it('rejects with not_found when neither a row nor metadata exists', async () => {
      const service = buildService(buildStateManager(null));

      await expect(service.startExecution({ operationId: 'op_missing' })).rejects.toMatchObject({
        denial: 'not_found',
      });
    });
  });
});
