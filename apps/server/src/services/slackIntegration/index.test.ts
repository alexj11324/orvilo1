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
}));
vi.mock('@/database/models/workspace', () => ({
  hasActiveWorkspaceMembership: mocks.membership,
  hasWorkspaceAdminAccess: mocks.admin,
}));
vi.mock('@/database/models/slackIntegration', () => ({
  SlackIntegrationModel: class {
    installation = mocks.installation;
    connectUser = mocks.connect;
    upsertInstallation = mocks.upsert;
    lockInstallation = mocks.lock;
  },
}));
vi.mock('@/server/modules/KeyVaultsEncrypt', () => ({
  KeyVaultsGateKeeper: {
    initWithEnvKey: async () => ({ encrypt: async (token: string) => `cipher:${token}` }),
  },
}));
vi.mock('@/server/routers/lambda/_helpers/workspaceAgentGuard', () => ({
  assertCanUseWorkspaceAgent: vi.fn(),
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
const service = createSlackIntegrationService({
  transaction: async (callback: (tx: unknown) => unknown) => callback({}),
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
  vi.resetAllMocks();
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
