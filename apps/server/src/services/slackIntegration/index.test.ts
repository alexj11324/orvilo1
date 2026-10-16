import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSlackIntegrationService } from './index';
import { SLACK_BOT_SCOPES } from './oauth';

const mocks = vi.hoisted(() => ({
  membership: vi.fn(),
  admin: vi.fn(),
  installation: vi.fn(),
  connect: vi.fn(),
  upsert: vi.fn(),
  lock: vi.fn(),
  exchange: vi.fn(),
  api: vi.fn(),
  state: vi.fn(),
  memberLock: vi.fn(),
  agentUse: vi.fn(),
  encrypt: vi.fn(),
  saveBinding: vi.fn(),
  bindingWrite: vi.fn(),
}));
vi.mock('@/database/models/workspace', () => ({
  hasActiveWorkspaceMembership: mocks.membership,
  hasWorkspaceAdminAccess: mocks.admin,
}));
vi.mock('@/database/models/workspaceMember', () => ({
  WorkspaceMemberModel: class {
    getMemberForUpdate = mocks.memberLock;
  },
}));
vi.mock('@/database/models/slackIntegration', () => ({
  SlackIntegrationModel: class {
    installation = mocks.installation;
    connectUser = mocks.connect;
    upsertInstallation = mocks.upsert;
    lockInstallation = mocks.lock;
    saveBinding = mocks.saveBinding;
  },
}));
vi.mock('@/server/modules/KeyVaultsEncrypt', () => ({
  KeyVaultsGateKeeper: {
    initWithEnvKey: async () => ({ encrypt: mocks.encrypt }),
  },
}));
vi.mock('@/server/routers/lambda/_helpers/workspaceAgentGuard', () => ({
  assertCanUseWorkspaceAgent: mocks.agentUse,
}));
vi.mock('./oauthState', () => ({ saveState: mocks.state }));
vi.mock('./oauth', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  exchangeCode: mocks.exchange,
  slackApi: mocks.api,
  getOAuthConfig: () => ({
    clientId: 'client',
    redirectUri: 'https://orvilo.test/oauth/slack/callback',
  }),
}));
const transaction = {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 'agent' }] }) }) }),
};
const service = createSlackIntegrationService({
  ...transaction,
  transaction: async (callback: (tx: unknown) => unknown) => callback(transaction),
} as never);
const payload = {
  attempt: 'attempt1234567890',
  clientId: 'client',
  redirectUri: 'https://orvilo.test/oauth/slack/callback',
  userId: 'user',
  workspaceId: 'workspace',
  mode: 'workspace' as const,
};
const grant = {
  team: { id: 'T1', name: 'Acme' },
  authed_user: { id: 'U1', access_token: 'user-token' },
  access_token: 'bot-token',
  token_type: 'bot',
  bot_user_id: 'B1',
  scope: SLACK_BOT_SCOPES.join(','),
};
beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  mocks.memberLock.mockResolvedValue({ role: 'admin' });
  mocks.encrypt.mockImplementation(async (token: string) => `cipher:${token}`);
  mocks.saveBinding.mockImplementation(async (input, _expected, authorize) => {
    await authorize?.(transaction);
    return mocks.bindingWrite(input);
  });
  mocks.membership.mockResolvedValue(true);
  mocks.admin.mockResolvedValue(true);
  mocks.installation.mockResolvedValue(undefined);
  mocks.upsert.mockResolvedValue({ id: 'install' });
  mocks.exchange.mockResolvedValue(grant);
  mocks.api.mockImplementation(async (method, token) =>
    method === 'users.info'
      ? { user: { id: 'U1', team_id: 'T1' } }
      : { team_id: 'T1', user_id: token === 'bot-token' ? 'B1' : 'U1' },
  );
});
describe('Slack OAuth trust boundaries', () => {
  it('rejects member workspace installation before contacting Slack', async () => {
    mocks.admin.mockResolvedValue(false);
    await expect(service.startOAuth({ ...payload })).rejects.toThrow('access denied');
    expect(mocks.state).not.toHaveBeenCalled();
  });
  it('encrypts workspace token and links only OAuth authenticated user', async () => {
    await service.completeOAuth(payload, 'code');
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ botTokenCiphertext: 'cipher:bot-token', slackTeamId: 'T1' }),
      null,
    );
    expect(mocks.connect).toHaveBeenCalledWith('install', 'user', 'U1', undefined);
  });
  it('rejects personal authorization for another team', async () => {
    await expect(
      service.completeOAuth(
        { ...payload, mode: 'personal', teamId: 'T2', installationId: 'install' },
        'code',
      ),
    ).rejects.toThrow('slack_team_mismatch');
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it('rejects removed membership before persisting tokens', async () => {
    mocks.admin.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(service.completeOAuth(payload, 'code')).rejects.toThrow('access denied');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('rejects identity mismatch and missing bot scopes', async () => {
    mocks.api.mockResolvedValue({ team_id: 'T1', user_id: 'other' });
    await expect(service.completeOAuth(payload, 'code')).rejects.toThrow('slack_user_mismatch');
    mocks.api.mockImplementation(async (method) =>
      method === 'users.info'
        ? { user: { id: 'U1', team_id: 'T1' } }
        : { team_id: 'T1', user_id: 'U1' },
    );
    mocks.exchange.mockResolvedValue({ ...grant, scope: 'chat:write' });
    await expect(service.completeOAuth(payload, 'code')).rejects.toThrow('slack_scopes_missing');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

it('does not resolve an unknown Slack sender or a removed workspace member', async () => {
  let rows: { userId: string; workspaceId: string }[] = [];
  const runtimeService = createSlackIntegrationService({
    select: () => ({
      from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => rows }) }) }),
    }),
  } as never);
  expect(
    await runtimeService.resolveSlackUser({ installationId: 'install', slackUserId: 'unknown' }),
  ).toBeNull();
  rows = [{ userId: 'user', workspaceId: 'workspace' }];
  mocks.membership.mockResolvedValue(false);
  expect(
    await runtimeService.resolveSlackUser({ installationId: 'install', slackUserId: 'U1' }),
  ).toBeNull();
  mocks.membership.mockResolvedValue(true);
  expect(
    await runtimeService.resolveSlackUser({ installationId: 'install', slackUserId: 'U1' }),
  ).toEqual(rows[0]);
});

it('does not persist a reconnect if disconnect wins after provider validation', async () => {
  mocks.installation.mockResolvedValue({
    id: 'install',
    tokenRevision: 'revision-a',
    slackTeamId: 'T1',
  });
  mocks.lock.mockRejectedValue(new Error('Slack installation changed'));
  await expect(
    service.completeOAuth(
      { ...payload, installationId: 'install', tokenRevision: 'revision-a', teamId: 'T1' },
      'code',
    ),
  ).rejects.toThrow('Slack installation changed');
  expect(mocks.upsert).not.toHaveBeenCalled();
  expect(mocks.connect).not.toHaveBeenCalled();
});

it('rejects an initial OAuth attempt after another grant is installed', async () => {
  mocks.lock.mockRejectedValue(new Error('Slack installation changed'));
  await expect(service.completeOAuth(payload, 'code')).rejects.toThrow(
    'Slack installation changed',
  );
  expect(mocks.upsert).not.toHaveBeenCalled();
});

describe('Slack final write authorization', () => {
  it.each(['bot authentication', 'vault encryption'])(
    'rejects admin demotion during %s',
    async (stage) => {
      if (stage === 'bot authentication') {
        mocks.api.mockImplementation(async (method, token) => {
          if (method === 'users.info') return { user: { id: 'U1', team_id: 'T1' } };
          if (token === 'bot-token') mocks.admin.mockResolvedValue(false);
          return { team_id: 'T1', user_id: token === 'bot-token' ? 'B1' : 'U1' };
        });
      } else {
        mocks.encrypt.mockImplementation(async (token) => {
          mocks.admin.mockResolvedValue(false);
          return `cipher:${token}`;
        });
      }
      await expect(service.completeOAuth(payload, 'code')).rejects.toThrow('access denied');
      expect(mocks.upsert).not.toHaveBeenCalled();
      expect(mocks.connect).not.toHaveBeenCalled();
    },
  );

  it('rejects personal membership removal while acquiring the installation lock', async () => {
    mocks.installation.mockResolvedValue({
      id: 'install',
      tokenRevision: 'revision-a',
      slackTeamId: 'T1',
    });
    mocks.lock.mockImplementation(async () => {
      mocks.membership.mockResolvedValue(false);
      return { id: 'install' };
    });
    await expect(
      service.completeOAuth(
        {
          ...payload,
          mode: 'personal',
          teamId: 'T1',
          installationId: 'install',
          tokenRevision: 'revision-a',
        },
        'code',
      ),
    ).rejects.toThrow('access denied');
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it.each(
    ['C1', 'D1'].flatMap((channelId) =>
      ['admin', 'agent use', 'membership'].map((revoked) => ({ channelId, revoked })),
    ),
  )('rejects late $revoked revocation before saving $channelId', async ({ channelId, revoked }) => {
    mocks.installation.mockResolvedValue({ id: 'install', tokenRevision: 'revision-a' });
    vi.spyOn(service, 'getBotToken').mockResolvedValueOnce('bot-token');
    mocks.api.mockImplementation(async () => {
      if (revoked === 'admin') mocks.admin.mockResolvedValue(false);
      if (revoked === 'agent use') mocks.agentUse.mockRejectedValue(new Error('Agent use denied'));
      if (revoked === 'membership') mocks.memberLock.mockResolvedValue(undefined);
      return { channel: { id: channelId, name: 'general', is_im: channelId.startsWith('D') } };
    });
    await expect(
      service.saveBinding({
        workspaceId: 'workspace',
        userId: 'user',
        agentId: 'agent',
        slackChannelId: channelId,
      }),
    ).rejects.toThrow(revoked === 'agent use' ? 'Agent use denied' : 'access denied');
    expect(mocks.bindingWrite).not.toHaveBeenCalled();
  });
});

describe('Slack DM binding setup', () => {
  beforeEach(() => {
    mocks.installation.mockResolvedValue({ id: 'install', tokenRevision: 'revision-a' });
    vi.spyOn(service, 'getBotToken').mockResolvedValue('bot-token');
  });
  it('lists DMs alongside channels with stable labels and cursor paging', async () => {
    mocks.api.mockImplementation(async (_method, _token, params) => ({
      channels: params.types.includes('im')
        ? [
            { id: 'C1', name: 'general', is_private: false },
            { id: 'D1', is_im: true, user: 'U1' },
            { id: 'D2', is_im: true },
          ]
        : [{ id: 'C1', name: 'general', is_private: false }],
      response_metadata: { next_cursor: 'next' },
    }));
    await expect(service.channels('workspace', 'cursor')).resolves.toEqual({
      channels: [
        { id: 'C1', name: 'general', isPrivate: false },
        { id: 'D1', name: 'U1', isPrivate: false },
        { id: 'D2', name: 'D2', isPrivate: false },
      ],
      nextCursor: 'next',
    });
  });
  it('requests the DM permissions used for conversation listing and thread history', async () => {
    const url = new URL(await service.startOAuth(payload));
    expect(url.searchParams.get('scope')?.split(',')).toEqual(
      expect.arrayContaining(['im:read', 'im:history']),
    );
  });
  it('saves a provider-verified DM with a stable label', async () => {
    mocks.api.mockResolvedValue({ channel: { id: 'D1', is_im: true, user: 'U1' } });
    mocks.bindingWrite.mockImplementation(async (input) => ({ id: 'binding', ...input }));
    await expect(
      service.saveBinding({
        workspaceId: 'workspace',
        userId: 'user',
        slackChannelId: 'D1',
        agentId: 'agent',
      }),
    ).resolves.toMatchObject({
      id: 'binding',
      slackChannelId: 'D1',
      slackChannelName: 'U1',
      agentId: 'agent',
    });
  });
  it.each([
    { id: 'D1', is_mpim: true },
    { id: 'D1', is_im: true, is_archived: true },
    { id: 'D2', is_im: true },
  ])('rejects unsupported or mismatched provider conversation $id', async (channel) => {
    mocks.api.mockResolvedValue({ channel });
    await expect(
      service.saveBinding({
        workspaceId: 'workspace',
        userId: 'user',
        slackChannelId: 'D1',
        agentId: 'agent',
      }),
    ).rejects.toThrow('slack_channel_invalid');
    expect(mocks.bindingWrite).not.toHaveBeenCalled();
  });
});
