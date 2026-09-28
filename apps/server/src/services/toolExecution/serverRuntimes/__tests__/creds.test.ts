import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OwnCredsService } from '@/server/services/creds';
import { MarketService } from '@/server/services/market';

import { type ToolExecutionContext } from '../../types';
import { credsRuntime, ServerCredsService } from '../creds';

const { getMember, getUserSettings } = vi.hoisted(() => ({
  getMember: vi.fn(),
  getUserSettings: vi.fn(),
}));

vi.mock('@/database/models/workspaceMember', () => ({
  WorkspaceMemberModel: vi.fn().mockImplementation(function () {
    return { getMember };
  }),
}));

vi.mock('@/database/models/user', () => ({
  UserModel: vi.fn().mockImplementation(function () {
    return { getUserSettings };
  }),
}));

vi.mock('@/server/services/market', () => ({
  MarketService: vi.fn(),
}));

vi.mock('@/server/services/creds', () => ({
  OwnCredsService: vi.fn(),
}));

describe('credsRuntime', () => {
  const serverDB = {} as NonNullable<ToolExecutionContext['serverDB']>;

  beforeEach(() => {
    vi.clearAllMocks();
    getMember.mockResolvedValue({ role: 'member' });
    getUserSettings.mockResolvedValue({ market: { accessToken: 'market-token' } });
  });

  it('signs verified workspace context into the Market trusted-client identity', async () => {
    await credsRuntime.factory({
      serverDB,
      toolManifestMap: {},
      topicId: 'topic-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
    });

    expect(getMember).toHaveBeenCalledWith('workspace-1', 'user-1');
    expect(OwnCredsService).toHaveBeenCalledWith(
      expect.objectContaining({
        serverDB,
        userId: 'user-1',
        workspaceId: 'workspace-1',
      }),
    );
    expect(MarketService).toHaveBeenCalledWith({
      accessToken: 'market-token',
      userInfo: { userId: 'user-1', workspaceId: 'workspace-1' },
    });
  });

  it('rejects workspace context without an active membership', async () => {
    getMember.mockResolvedValue(undefined);

    await expect(
      credsRuntime.factory({
        serverDB,
        toolManifestMap: {},
        userId: 'user-1',
        workspaceId: 'workspace-1',
      }),
    ).rejects.toThrow('Workspace membership is required for workspace Creds execution');
    expect(MarketService).not.toHaveBeenCalled();
    expect(OwnCredsService).not.toHaveBeenCalled();
  });

  it('fails closed when the DB is unavailable', async () => {
    await expect(
      credsRuntime.factory({
        toolManifestMap: {},
        userId: 'user-1',
        workspaceId: 'workspace-1',
      }),
    ).rejects.toThrow('serverDB is required for Creds execution');
    expect(getMember).not.toHaveBeenCalled();
    expect(MarketService).not.toHaveBeenCalled();
  });

  it('keeps personal runtime identity outside a workspace', async () => {
    await credsRuntime.factory({
      serverDB,
      toolManifestMap: {},
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(getMember).not.toHaveBeenCalled();
    expect(OwnCredsService).toHaveBeenCalledWith(
      expect.objectContaining({
        serverDB,
        userId: 'user-1',
        workspaceId: undefined,
      }),
    );
  });

  it('rejects runtime creation without a user identity', async () => {
    await expect(credsRuntime.factory({ toolManifestMap: {} })).rejects.toThrow(
      'userId is required for Creds execution',
    );
  });

  // `orvilo-creds` is already absent from `AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS`,
  // so this runtime should never even be constructed for a share visitor —
  // this is the belt-and-braces backstop in case that allowlist gate is ever
  // bypassed: the sandbox write path must refuse on its own too, since
  // `~/.creds/env` must never receive the creator's decrypted credentials
  // inside a sandbox a visitor's model can run arbitrary shell commands in.
  it('refuses to write credentials into the sandbox for a share-visitor run', async () => {
    vi.mocked(OwnCredsService).mockImplementation(function () {
      return {
        inject: vi.fn().mockResolvedValue({
          credentials: { env: { FOO: 'bar' } },
        }),
      } as any;
    });

    const runtime = await credsRuntime.factory({
      agentShareVisitor: { agentId: 'agent-1' } as any,
      serverDB,
      toolManifestMap: {},
      topicId: 'topic-1',
      userId: 'user-1',
    });

    const result = await (runtime as any).injectCredsToSandbox({ keys: ['FOO'] });

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('unavailable in shared conversations');
  });
});

describe('ServerCredsService.injectCreds', () => {
  const buildOwnCredsService = (inject = vi.fn()) => ({ inject }) as unknown as OwnCredsService;
  const marketService = { market: {} } as unknown as MarketService;

  // Regression test: the inject response is already masked for safe display —
  // the real values are written into ~/.creds/env inside the sandbox by the
  // own-creds service's sandbox write — so this layer must only forward the
  // call and its result, never re-write the env map itself (a masked line
  // appended after the real one would shadow it for every later command).
  it('forwards the inject call and returns its result untouched', async () => {
    const injectResult = {
      credentials: { env: { DC_CLI_TOKEN: '8f******vZ' } },
      notFound: [],
      success: true,
    };
    const inject = vi.fn().mockResolvedValue(injectResult);
    const service = new ServerCredsService(
      buildOwnCredsService(inject),
      marketService,
      'workspace-1',
    );

    const result = await service.injectCreds({
      keys: ['dc-cli-token'],
      sandbox: true,
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(inject).toHaveBeenCalledTimes(1);
    expect(inject).toHaveBeenCalledWith({
      keys: ['dc-cli-token'],
      sandbox: true,
      topicId: 'topic-1',
    });
    expect(result).toBe(injectResult);
  });
});
