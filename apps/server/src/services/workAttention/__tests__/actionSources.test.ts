import type { VersionedDecision } from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceOwnershipTransferItem } from '@/database/schemas/workspace';
import type { OrviloDatabase } from '@/database/type';

import { ActionSourceRegistry } from '../actionSources';

const { cancelOwnershipTransfer, respondOwnershipTransfer } = vi.hoisted(() => ({
  cancelOwnershipTransfer: vi.fn(),
  respondOwnershipTransfer: vi.fn(),
}));

vi.mock('@/business/server/membershipLifecycle/ownershipTransfer', () => ({
  cancelOwnershipTransfer,
  respondOwnershipTransfer,
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

const dbFor = (row: WorkspaceOwnershipTransferItem | undefined) =>
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
