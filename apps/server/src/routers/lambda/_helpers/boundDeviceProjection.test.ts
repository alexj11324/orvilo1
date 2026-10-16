// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveAgentHostSummary } from '@/server/services/deviceGateway/agentHostSummary';
import { canPerformResourceAction, getResourceMeta } from '@/server/services/resourcePermission';

import { resolveBoundDeviceForUseMember } from './boundDeviceProjection';

vi.mock('@/server/services/deviceGateway/agentHostSummary', () => ({
  resolveAgentHostSummary: vi.fn(),
}));
vi.mock('@/server/services/resourcePermission', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  canPerformResourceAction: vi.fn(),
  getResourceMeta: vi.fn(),
}));

const ctx = { db: {} as any, userId: 'member-1', workspaceId: 'ws-1' };
const agency = { boundDeviceId: 'device-1', executionTarget: 'device' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getResourceMeta).mockResolvedValue({
    userId: 'creator',
    visibility: 'public',
    workspaceId: 'ws-1',
  } as any);
  vi.mocked(canPerformResourceAction).mockResolvedValue(true);
  vi.mocked(resolveAgentHostSummary).mockResolvedValue({
    id: 'device-1',
    name: 'Build box',
    online: true,
  });
});

describe('resolveBoundDeviceForUseMember', () => {
  it('returns { id, name, online } for a caller who can Use the Agent', async () => {
    await expect(resolveBoundDeviceForUseMember(ctx, 'agent-1', agency)).resolves.toEqual({
      id: 'device-1',
      name: 'Build box',
      online: true,
    });
    expect(canPerformResourceAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'use', resourceId: 'agent-1' }),
    );
  });

  it('returns nothing without the Use permission', async () => {
    vi.mocked(canPerformResourceAction).mockResolvedValue(false);

    await expect(resolveBoundDeviceForUseMember(ctx, 'agent-1', agency)).resolves.toBeUndefined();
    expect(resolveAgentHostSummary).not.toHaveBeenCalled();
  });

  it.each([
    ['no workspace', { ...ctx, workspaceId: null }, agency],
    ['a non-device target', ctx, { ...agency, executionTarget: 'cloud' }],
    ['no saved device id', ctx, { executionTarget: 'device' }],
    ['no agency config', ctx, null],
  ])('returns nothing for %s', async (_name, c, a) => {
    await expect(resolveBoundDeviceForUseMember(c, 'agent-1', a)).resolves.toBeUndefined();
    expect(resolveAgentHostSummary).not.toHaveBeenCalled();
  });

  it('returns nothing for an Agent outside the caller workspace', async () => {
    vi.mocked(getResourceMeta).mockResolvedValue({
      userId: 'creator',
      visibility: 'public',
      workspaceId: 'ws-other',
    } as any);

    await expect(resolveBoundDeviceForUseMember(ctx, 'agent-1', agency)).resolves.toBeUndefined();
  });
});
