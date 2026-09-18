import type { VersionedDecision } from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentInterventionItem } from '@/database/schemas/agentIntervention';
import type { WorkspaceOwnershipTransferItem } from '@/database/schemas/workspace';
import type { OrviloDatabase } from '@/database/type';

import { ActionSourceRegistry } from '../actionSources';

const { cancelOwnershipTransfer, resolveAgentInterventionBySource, respondOwnershipTransfer } =
  vi.hoisted(() => ({
    cancelOwnershipTransfer: vi.fn(),
    resolveAgentInterventionBySource: vi.fn(),
    respondOwnershipTransfer: vi.fn(),
  }));

vi.mock('@/business/server/membershipLifecycle/ownershipTransfer', () => ({
  cancelOwnershipTransfer,
  respondOwnershipTransfer,
}));

vi.mock('@/business/server/agent-run/agentInterventionReview', () => ({
  resolveAgentInterventionBySource,
}));

const pending = (
  overrides: Partial<WorkspaceOwnershipTransferItem> = {},
): WorkspaceOwnershipTransferItem =>
  ({
    createdAt: new Date('2026-09-18T00:00:00Z'),
    decidedAt: null,
    expiresAt: new Date('2099-01-01T00:00:00Z'),
    fromUserId: 'owner-1',
    id: 'tr_1',
    status: 'pending',
    toUserId: 'admin-1',
    workspaceId: 'ws1',
    ...overrides,
  }) as WorkspaceOwnershipTransferItem;

const dbFor = (row: unknown | undefined) =>
  ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (row ? [row] : []),
        }),
      }),
    }),
  }) as unknown as OrviloDatabase;

const command = (overrides: Partial<VersionedDecision> = {}): VersionedDecision => ({
  actionRef: { kind: 'workspace_ownership_transfer', requestId: 'tr_1' },
  decision: 'approve',
  idempotencyKey: 'idem-1',
  ...overrides,
});

const intervention = (overrides: Partial<AgentInterventionItem> = {}): AgentInterventionItem =>
  ({
    batchId: 'batch_1',
    deadline: new Date('2099-01-01T00:00:00Z'),
    id: '11111111-1111-1111-1111-111111111111',
    operationId: 'op_1',
    requestRevisionHash: 'ab'.repeat(32),
    reviewContext: { title: 'Review tool' },
    sanitizedRequest: { apiName: 'bash' },
    status: 'pending',
    toolCallId: 'call_1',
    toolMessageId: 'msg_1',
    userId: 'admin-1',
    version: 1,
    workspaceId: 'ws1',
    ...overrides,
  }) as AgentInterventionItem;

describe('ActionSourceRegistry workspace ownership transfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    respondOwnershipTransfer.mockResolvedValue({ accepted: true });
    cancelOwnershipTransfer.mockResolvedValue({ cancelled: true });
  });

  it('accepts through the original ownership-transfer service', async () => {
    const registry = new ActionSourceRegistry(dbFor(pending()), 'admin-1', 'ws1', false);
    const receipt = await registry.decide(command());

    expect(respondOwnershipTransfer).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accept: true, userId: 'admin-1', workspaceId: 'ws1' }),
    );
    expect(receipt).toEqual({
      executionStarted: false,
      sourceState: 'accepted',
      status: 'source_accepted',
    });
  });

  it('does not re-consume an already decided transfer', async () => {
    const registry = new ActionSourceRegistry(
      dbFor(pending({ status: 'accepted' })),
      'admin-1',
      'ws1',
      false,
    );
    const receipt = await registry.decide(command());

    expect(respondOwnershipTransfer).not.toHaveBeenCalled();
    expect(receipt.status).toBe('already_decided');
  });

  it('maps a concurrent second accept onto already_decided', async () => {
    respondOwnershipTransfer.mockRejectedValueOnce(
      new TRPCError({ code: 'NOT_FOUND', message: 'No pending ownership transfer' }),
    );
    const registry = new ActionSourceRegistry(dbFor(pending()), 'admin-1', 'ws1', false);
    const receipt = await registry.decide(command());

    expect(receipt.status).toBe('already_decided');
  });

  it('lets the initiator cancel through the original service', async () => {
    const registry = new ActionSourceRegistry(dbFor(pending()), 'owner-1', 'ws1', false);
    const receipt = await registry.decide(command({ decision: 'cancel' }));

    expect(cancelOwnershipTransfer).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'owner-1', workspaceId: 'ws1' }),
    );
    expect(receipt.status).toBe('source_rejected');
  });

  it('forbids a bystander from deciding', async () => {
    const registry = new ActionSourceRegistry(dbFor(pending()), 'stranger', 'ws1', true);
    await expect(registry.decide(command())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(respondOwnershipTransfer).not.toHaveBeenCalled();
  });
});

describe('ActionSourceRegistry ACP intervention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAgentInterventionBySource.mockResolvedValue({ handled: false });
  });

  it('maps the OSS store miss onto outcome_unknown without inventing a second machine', async () => {
    const registry = new ActionSourceRegistry(dbFor(intervention()), 'admin-1', 'ws1', false);
    const receipt = await registry.decide(
      command({
        actionRef: {
          kind: 'acp_intervention',
          requestId: '11111111-1111-1111-1111-111111111111',
        },
        idempotencyKey: '22222222-2222-2222-2222-222222222222',
      }),
    );

    expect(resolveAgentInterventionBySource).toHaveBeenCalledWith(
      expect.objectContaining({
        action: { scope: 'once', type: 'approve_tool' },
        actorUserId: 'admin-1',
        batchId: 'batch_1',
        operationId: 'op_1',
        workspaceId: 'ws1',
      }),
    );
    expect(receipt).toEqual({
      executionStarted: false,
      sourceState: 'unavailable',
      status: 'outcome_unknown',
    });
  });

  it('does not re-consume an already resolved intervention', async () => {
    const registry = new ActionSourceRegistry(
      dbFor(intervention({ status: 'resolved' })),
      'admin-1',
      'ws1',
      false,
    );
    const receipt = await registry.decide(
      command({
        actionRef: {
          kind: 'acp_intervention',
          requestId: '11111111-1111-1111-1111-111111111111',
        },
      }),
    );

    expect(resolveAgentInterventionBySource).not.toHaveBeenCalled();
    expect(receipt.status).toBe('already_decided');
  });

  it('returns stale when the displayed revision no longer matches', async () => {
    const registry = new ActionSourceRegistry(
      dbFor(intervention({ version: 3 })),
      'admin-1',
      'ws1',
      false,
    );
    const receipt = await registry.decide(
      command({
        actionRef: {
          kind: 'acp_intervention',
          requestId: '11111111-1111-1111-1111-111111111111',
        },
        expectedSourceRevision: 2,
      }),
    );

    expect(resolveAgentInterventionBySource).not.toHaveBeenCalled();
    expect(receipt.status).toBe('stale');
  });

  it('forbids a bystander from deciding', async () => {
    const registry = new ActionSourceRegistry(dbFor(intervention()), 'stranger', 'ws1', true);
    await expect(
      registry.decide(
        command({
          actionRef: {
            kind: 'acp_intervention',
            requestId: '11111111-1111-1111-1111-111111111111',
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(resolveAgentInterventionBySource).not.toHaveBeenCalled();
  });

  it('lists a pending intervention so a missing projection can be repaired', async () => {
    const row = intervention();
    const registry = new ActionSourceRegistry(dbFor(row), 'admin-1', undefined, false);
    await expect(registry.listPendingForActor()).resolves.toEqual([
      expect.objectContaining({
        actionKind: 'acp_intervention',
        requestId: row.id,
        title: 'Review tool',
      }),
    ]);
  });
});
