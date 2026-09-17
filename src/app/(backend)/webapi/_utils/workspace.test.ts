// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LobeChatDatabase } from '@/database/type';

import {
  resolveValidWorkspaceIdFromRequest,
  WORKSPACE_ID_HEADER,
  WorkspaceAccessDeniedError,
} from './workspace';

const { mockGetActiveWorkspaceMembershipRole } = vi.hoisted(() => ({
  mockGetActiveWorkspaceMembershipRole: vi.fn(),
}));

vi.mock('@/database/models/workspace', () => ({
  getActiveWorkspaceMembershipRole: mockGetActiveWorkspaceMembershipRole,
}));

const serverDB = {} as LobeChatDatabase;

const createRequest = (workspaceId?: string | null) => {
  const headers = new Headers();
  if (workspaceId !== undefined && workspaceId !== null)
    headers.set(WORKSPACE_ID_HEADER, workspaceId);

  return new Request('https://app.test/webapi/models/openai', { headers });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveValidWorkspaceIdFromRequest', () => {
  it('returns undefined without querying when the workspace header is missing', async () => {
    await expect(
      resolveValidWorkspaceIdFromRequest({
        req: createRequest(),
        serverDB,
        userId: 'user-1',
      }),
    ).resolves.toBeUndefined();

    expect(mockGetActiveWorkspaceMembershipRole).not.toHaveBeenCalled();
  });

  it('trims blank workspace headers and treats them as absent', async () => {
    await expect(
      resolveValidWorkspaceIdFromRequest({
        req: createRequest('   '),
        serverDB,
        userId: 'user-1',
      }),
    ).resolves.toBeUndefined();

    expect(mockGetActiveWorkspaceMembershipRole).not.toHaveBeenCalled();
  });

  it('rejects when the workspace id does not exist', async () => {
    // The helper inner-joins workspaces: an unknown id resolves no membership.
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce(null);

    await expect(
      resolveValidWorkspaceIdFromRequest({
        req: createRequest(' ws-missing '),
        serverDB,
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(WorkspaceAccessDeniedError);
  });

  it('rejects when the requester is not an active workspace member', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce(null);

    await expect(
      resolveValidWorkspaceIdFromRequest({
        req: createRequest('ws-1'),
        serverDB,
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(WorkspaceAccessDeniedError);

    expect(mockGetActiveWorkspaceMembershipRole).toHaveBeenCalledWith(serverDB, {
      userId: 'user-1',
      workspaceId: 'ws-1',
    });
  });

  it('rejects suspended and removed members identically (helper reports null)', async () => {
    // Contract: suspendedAt / deletedAt members resolve `null` from the helper —
    // the rejection is indistinguishable from "not a member" / "not found".
    mockGetActiveWorkspaceMembershipRole.mockResolvedValue(null);

    await expect(
      resolveValidWorkspaceIdFromRequest({
        req: createRequest('ws-1'),
        serverDB,
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(WorkspaceAccessDeniedError);
  });

  it('returns the trimmed workspace id for an active member', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce('member');

    await expect(
      resolveValidWorkspaceIdFromRequest({
        req: createRequest(' ws-1 '),
        serverDB,
        userId: 'user-1',
      }),
    ).resolves.toBe('ws-1');
  });

  it('returns the workspace id for any active role including viewer', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce('viewer');

    await expect(
      resolveValidWorkspaceIdFromRequest({
        req: createRequest('ws-1'),
        serverDB,
        userId: 'user-1',
      }),
    ).resolves.toBe('ws-1');
  });
});
