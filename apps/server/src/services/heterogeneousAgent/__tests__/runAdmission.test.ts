// @vitest-environment node
import type { LobeChatDatabase } from '@orvilo/database';
import { agentOperations } from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { DeviceTransportErrorCode } from '@orvilo/device-gateway-client';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import {
  classifyRemoteDispatchFailure,
  createRemoteRunAdmission,
  loadRemoteRunRecord,
  markRemoteCancelRequested,
  markRemoteRunRunning,
  patchRemoteRunAdmission,
  type RemoteRunAdmission,
  remoteRunGenerationMatches,
  resolveRemoteCancel,
  resolveRemoteCancelState,
  transitionRemoteAdmission,
  writeRemoteRunAdmission,
} from '../runAdmission';

const serverDB: LobeChatDatabase = await getTestDB();

const createdIds: string[] = [];

const createOperation = async (status: 'running' = 'running') => {
  const operationId = `op-admission-${crypto.randomUUID()}`;
  createdIds.push(operationId);
  await serverDB.insert(agentOperations).values({
    id: operationId,
    status,
    userId: 'test-user',
  });
  return operationId;
};

const admissionOf = async (operationId: string) =>
  (await loadRemoteRunRecord(serverDB, operationId))?.admission;

const cancelOf = async (operationId: string) =>
  (await loadRemoteRunRecord(serverDB, operationId))?.cancel;

const baseAdmission = {
  channel: 'agent_run_request' as const,
  deviceId: 'device-1',
  deviceUserId: 'user-1',
  deviceWorkspaceId: 'ws-1',
  generation: 1,
  idempotencyKey: '',
};

afterEach(async () => {
  for (const id of createdIds.splice(0)) {
    await serverDB.delete(agentOperations).where(eq(agentOperations.id, id));
  }
});

describe('runAdmission ledger', () => {
  describe('createRemoteRunAdmission', () => {
    it('writes a pending record with the pinned identities', async () => {
      const op = await createOperation();

      const created = await createRemoteRunAdmission(serverDB, op, {
        ...baseAdmission,
        idempotencyKey: op,
      });

      expect(created).toBe(true);
      const admission = await admissionOf(op);
      expect(admission).toMatchObject({
        channel: 'agent_run_request',
        deviceId: 'device-1',
        deviceUserId: 'user-1',
        deviceWorkspaceId: 'ws-1',
        generation: 1,
        idempotencyKey: op,
        state: 'pending',
      });
    });

    it('is idempotent — a duplicate create cannot overwrite or bump the record', async () => {
      const op = await createOperation();
      await createRemoteRunAdmission(serverDB, op, { ...baseAdmission, idempotencyKey: op });
      await writeRemoteRunAdmission(serverDB, op, { state: 'acknowledged' });

      const second = await createRemoteRunAdmission(serverDB, op, {
        ...baseAdmission,
        deviceId: 'other-device',
        generation: 2,
        idempotencyKey: op,
      });

      expect(second).toBe(false);
      const admission = await admissionOf(op);
      // Still the first admission: same device, same generation, state intact.
      expect(admission).toMatchObject({
        deviceId: 'device-1',
        generation: 1,
        state: 'acknowledged',
      });
    });
  });

  describe('writeRemoteRunAdmission transitions', () => {
    it('drives pending → acknowledged → running', async () => {
      const op = await createOperation();
      await createRemoteRunAdmission(serverDB, op, { ...baseAdmission, idempotencyKey: op });

      expect(await writeRemoteRunAdmission(serverDB, op, { state: 'acknowledged' })).toBe(true);
      expect(await markRemoteRunRunning(serverDB, op)).toBe(true);
      expect((await admissionOf(op))?.state).toBe('running');
    });

    it('never lets a late failure signal demote a running admission', async () => {
      const op = await createOperation();
      await createRemoteRunAdmission(serverDB, op, { ...baseAdmission, idempotencyKey: op });
      await writeRemoteRunAdmission(serverDB, op, { state: 'acknowledged' });
      await markRemoteRunRunning(serverDB, op);

      // A lost-ack retry that now sees a classified failure must NOT regress.
      expect(
        await writeRemoteRunAdmission(serverDB, op, {
          errorCode: DeviceTransportErrorCode.GatewayRejected,
          state: 'rejected',
        }),
      ).toBe(false);
      expect(
        await writeRemoteRunAdmission(serverDB, op, {
          errorCode: DeviceTransportErrorCode.DeviceNotFound,
          state: 'offline',
        }),
      ).toBe(false);
      expect((await admissionOf(op))?.state).toBe('running');
    });

    it('resolves unknown → running when the liveness probe finds evidence', async () => {
      const op = await createOperation();
      await createRemoteRunAdmission(serverDB, op, { ...baseAdmission, idempotencyKey: op });
      await writeRemoteRunAdmission(serverDB, op, {
        errorCode: DeviceTransportErrorCode.DeviceResponseTimeout,
        state: 'unknown',
      });

      expect(await markRemoteRunRunning(serverDB, op)).toBe(true);
      expect((await admissionOf(op))?.state).toBe('running');
    });
  });

  describe('patchRemoteRunAdmission', () => {
    it('merges acpSessionId without touching the state', async () => {
      const op = await createOperation();
      await createRemoteRunAdmission(serverDB, op, { ...baseAdmission, idempotencyKey: op });

      expect(await patchRemoteRunAdmission(serverDB, op, { acpSessionId: 'cli-session-42' })).toBe(
        true,
      );

      const admission = await admissionOf(op);
      expect(admission?.acpSessionId).toBe('cli-session-42');
      expect(admission?.state).toBe('pending');
    });

    it('is a no-op when no admission record exists', async () => {
      const op = await createOperation();
      expect(await patchRemoteRunAdmission(serverDB, op, { acpSessionId: 'x' })).toBe(false);
    });
  });

  describe('cancel ledger', () => {
    it('records requested → confirmed and ignores a stale re-resolve', async () => {
      const op = await createOperation();
      await createRemoteRunAdmission(serverDB, op, { ...baseAdmission, idempotencyKey: op });

      expect(await markRemoteCancelRequested(serverDB, op, 'interruptTask')).toBe(true);
      expect((await cancelOf(op))?.state).toBe('requested');

      expect(await resolveRemoteCancel(serverDB, op, 'confirmed', 'host exited')).toBe(true);
      expect((await cancelOf(op))?.state).toBe('confirmed');

      // confirmed is terminal: neither a re-request nor a re-resolve rewrites it.
      expect(await markRemoteCancelRequested(serverDB, op, 'retry')).toBe(false);
      expect(await resolveRemoteCancel(serverDB, op, 'unknown', 'late')).toBe(false);
      expect((await cancelOf(op))?.state).toBe('confirmed');
    });

    it('lets a terminal callback upgrade unknown → confirmed', async () => {
      const op = await createOperation();
      await createRemoteRunAdmission(serverDB, op, { ...baseAdmission, idempotencyKey: op });

      await markRemoteCancelRequested(serverDB, op);
      expect(await resolveRemoteCancel(serverDB, op, 'unknown', 'ack lost')).toBe(true);
      expect((await cancelOf(op))?.state).toBe('unknown');

      // The device's terminal callback later proves the process stopped.
      expect(await resolveRemoteCancel(serverDB, op, 'confirmed', 'host reported')).toBe(true);
      expect((await cancelOf(op))?.state).toBe('confirmed');
    });

    it('re-arms requested after an unknown resolution (retry)', async () => {
      const op = await createOperation();
      await createRemoteRunAdmission(serverDB, op, { ...baseAdmission, idempotencyKey: op });

      await markRemoteCancelRequested(serverDB, op);
      await resolveRemoteCancel(serverDB, op, 'unknown');

      expect(await markRemoteCancelRequested(serverDB, op, 'retry')).toBe(true);
      const cancel = await cancelOf(op);
      expect(cancel?.state).toBe('requested');
      // The stale resolution timestamp is cleared by the re-arm.
      expect(cancel?.resolvedAt).toBeNull();
    });

    it('is a no-op for operations without an admission record', async () => {
      const op = await createOperation();
      expect(await markRemoteCancelRequested(serverDB, op)).toBe(false);
      expect(await cancelOf(op)).toBeUndefined();
    });
  });

  describe('remoteRunGenerationMatches', () => {
    it('fences a producer that asserts a foreign generation', async () => {
      const op = await createOperation();
      await createRemoteRunAdmission(serverDB, op, { ...baseAdmission, idempotencyKey: op });

      expect(await remoteRunGenerationMatches(serverDB, op, 1)).toBe(true);
      expect(await remoteRunGenerationMatches(serverDB, op, 2)).toBe(false);
      // Callers that omit the generation are grandfathered.
      expect(await remoteRunGenerationMatches(serverDB, op, undefined)).toBe(true);
    });

    it('grandfathers operations without an admission record', async () => {
      const op = await createOperation();
      expect(await remoteRunGenerationMatches(serverDB, op, 7)).toBe(true);
    });
  });
});

describe('runAdmission pure helpers', () => {
  it('classifies transport failures by delivery certainty', () => {
    // Definite "nothing ran".
    expect(classifyRemoteDispatchFailure(DeviceTransportErrorCode.DeviceNotFound)).toBe('offline');
    expect(classifyRemoteDispatchFailure(DeviceTransportErrorCode.DeviceChannelUnavailable)).toBe(
      'offline',
    );
    expect(classifyRemoteDispatchFailure('GATEWAY_NOT_CONFIGURED')).toBe('offline');

    // Well-formed refusal.
    expect(classifyRemoteDispatchFailure(DeviceTransportErrorCode.GatewayRejected)).toBe(
      'rejected',
    );
    expect(classifyRemoteDispatchFailure(DeviceTransportErrorCode.Unauthorized)).toBe('rejected');
    expect(classifyRemoteDispatchFailure(DeviceTransportErrorCode.RateLimited)).toBe('rejected');

    // Provably pre-connect — the request never left this process.
    expect(classifyRemoteDispatchFailure(DeviceTransportErrorCode.GatewayUnreachable)).toBe(
      'offline',
    );

    // Ambiguous — the request may have been delivered before the failure.
    expect(classifyRemoteDispatchFailure(DeviceTransportErrorCode.DeviceResponseTimeout)).toBe(
      'unknown',
    );
    expect(classifyRemoteDispatchFailure(DeviceTransportErrorCode.GatewayError)).toBe('unknown');
    expect(classifyRemoteDispatchFailure(undefined)).toBe('unknown');
    expect(classifyRemoteDispatchFailure('SOME_FUTURE_CODE')).toBe('unknown');
  });

  it('transitionRemoteAdmission rejects illegal moves', () => {
    const pending: RemoteRunAdmission = {
      channel: 'tool_call',
      generation: 1,
      idempotencyKey: 'op',
      state: 'pending',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(transitionRemoteAdmission(pending, { state: 'acknowledged' })).not.toBeNull();
    // 'running' can leave acknowledged/pending/unknown but not rejected.
    expect(
      transitionRemoteAdmission({ ...pending, state: 'rejected' }, { state: 'running' }),
    ).toBeNull();
    expect(transitionRemoteAdmission(pending, { state: 'pending' })).toBeNull();
  });

  it('resolveRemoteCancelState never collapses unconfirmed outcomes to success', () => {
    expect(resolveRemoteCancelState({ deviceCancellationConfirmed: true, success: true })).toBe(
      'confirmed',
    );
    expect(resolveRemoteCancelState({ deviceCancellationConfirmed: false, success: true })).toBe(
      'unknown',
    );
    expect(resolveRemoteCancelState({ success: true })).toBe('confirmed');
    expect(resolveRemoteCancelState({ success: false })).toBe('unknown');
  });
});
