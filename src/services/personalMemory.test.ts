import superjson from 'superjson';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { experienceMemoryService } from '@/services/experienceMemory';
import { memoryCRUDService, userMemoryService } from '@/services/userMemory';
import { LayersEnum } from '@/types/userMemory';

const workspaceHeaders = vi.hoisted(() => ({ activeId: null as string | null }));

vi.mock('@/const/version', () => ({ isDesktop: false }));
vi.mock('@/services/_auth', () => ({ createHeaderWithAuth: async () => ({}) }));
vi.mock('@/business/client/trpc-headers', () => ({
  getBusinessTrpcHeaders: async () =>
    workspaceHeaders.activeId ? { 'X-Workspace-Id': workspaceHeaders.activeId } : {},
}));
vi.mock('@/store/user/store', () => ({ getUserStoreState: () => ({ isSignedIn: false }) }));
vi.mock('i18next', () => ({ t: (key: string) => key }));

const okTrpcResponse = (data: unknown) =>
  new Response(JSON.stringify({ result: { data: superjson.serialize(data) } }), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });

describe('personal Memory transport', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', new URL('http://localhost/memory/prime'));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    workspaceHeaders.activeId = null;
  });
  it('keeps personal Memory reads and writes out of the active workspace', async () => {
    workspaceHeaders.activeId = 'ws-active';
    fetchMock.mockImplementation(async () => okTrpcResponse({ success: true }));

    await experienceMemoryService.list(0);
    await experienceMemoryService.create('An advisory experience');
    await userMemoryService.createManual(LayersEnum.Identity, 'A personal identity');
    await memoryCRUDService.deleteAll();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [, init] of fetchMock.mock.calls as [RequestInfo | URL, RequestInit][]) {
      expect(new Headers(init.headers).has('X-Workspace-Id')).toBe(false);
    }

    await userMemoryService.retrieveMemoryForTopic('topic-workspace');
    const [, topicInit] = fetchMock.mock.calls[4] as [RequestInfo | URL, RequestInit];
    expect(new Headers(topicInit.headers).get('X-Workspace-Id')).toBe('ws-active');
  });
});
