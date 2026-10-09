import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runSlackIntegrationEvent } from './workflow';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), runtime: vi.fn(), dispatch: vi.fn() }));
vi.mock('@/database/server', () => ({ getServerDB: async () => ({}) }));
vi.mock('.', () => ({
  createSlackIntegrationService: () => ({
    getInstallationByTeamId: mocks.lookup,
    getBotToken: async () => 'test-token',
  }),
}));
vi.mock('./channelsRuntime', () => ({ getSlackChannelsRuntime: mocks.runtime }));
vi.mock('./store', () => ({ createSlackChannelsStore: () => ({}) }));

const input = {
  body: { team_id: 'T1' },
  conversationKey: 'thread',
  installationId: 'install',
  teamId: 'T1',
  tokenRevision: 'original',
};
describe('queued Slack installation ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runtime.mockResolvedValue({ dispatch: mocks.dispatch });
  });
  it.each([
    null,
    { id: 'install', tokenRevision: 'replacement' },
    { id: 'new-install', tokenRevision: 'original' },
  ])(
    'does not execute a delivery after its installation was disconnected or replaced',
    async (installation) => {
      mocks.lookup.mockResolvedValue(installation);
      expect(await runSlackIntegrationEvent(input)).toEqual({ skipped: true });
      expect(mocks.runtime).not.toHaveBeenCalled();
    },
  );
  it('dispatches through Channels only while the original grant exists', async () => {
    mocks.lookup.mockResolvedValue({ id: 'install', slackTeamId: 'T1', tokenRevision: 'original' });
    expect(await runSlackIntegrationEvent(input)).toEqual({ success: true });
    expect(mocks.dispatch).toHaveBeenCalledWith(input.body);
  });
});
