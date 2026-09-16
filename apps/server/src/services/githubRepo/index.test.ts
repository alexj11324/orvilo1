// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UserModel } from '@/database/models/user';
import { MarketService } from '@/server/services/market';

import {
  findBranchPr,
  getRemoteBranchSha,
  getRepoDefaultBranch,
  isBranchMergedInto,
  parseGithubRepo,
  resolveGithubAccessToken,
} from './index';

vi.mock('@/database/models/user', () => ({
  UserModel: vi.fn(),
}));

vi.mock('@/server/services/market', () => ({
  MarketService: vi.fn(),
}));

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('parseGithubRepo', () => {
  it.each([
    ['acme/widgets', { name: 'widgets', owner: 'acme' }],
    ['acme/widgets.git', { name: 'widgets', owner: 'acme' }],
    ['https://github.com/acme/widgets', { name: 'widgets', owner: 'acme' }],
    ['https://github.com/acme/widgets.git', { name: 'widgets', owner: 'acme' }],
    ['  acme/widgets  ', { name: 'widgets', owner: 'acme' }],
    ['acme/widgets/', { name: 'widgets', owner: 'acme' }],
  ])('parses %s', (input, expected) => {
    expect(parseGithubRepo(input)).toEqual(expected);
  });

  it.each([
    'not-a-repo',
    'acme/widgets/extra',
    'https://gitlab.com/acme/widgets',
    'git@github.com:acme/widgets.git',
    '',
  ])('rejects %s', (input) => {
    expect(parseGithubRepo(input)).toBeUndefined();
  });
});

describe('github api helpers', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('getRepoDefaultBranch', () => {
    it('returns the repo default_branch', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ default_branch: 'canary' }));
      expect(await getRepoDefaultBranch('acme/widgets', 'tok')).toBe('canary');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.github.com/repos/acme/widgets',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        }),
      );
    });

    it('returns undefined for an unparseable coordinate or missing field', async () => {
      expect(await getRepoDefaultBranch('nope')).toBeUndefined();
      fetchMock.mockResolvedValue(jsonResponse({}));
      expect(await getRepoDefaultBranch('acme/widgets')).toBeUndefined();
    });
  });

  describe('isBranchMergedInto', () => {
    it.each([
      ['ahead', 'merged'],
      ['identical', 'merged'],
      ['behind', 'unmerged'],
      ['diverged', 'unmerged'],
      ['anything-else', 'unknown'],
    ] as const)('maps compare status %s → %s', async (status, expected) => {
      fetchMock.mockResolvedValue(jsonResponse({ status }));
      expect(
        await isBranchMergedInto({ base: 'main', head: 'task/T-1', repo: 'acme/widgets' }),
      ).toBe(expected);
    });

    it('reports unknown when the compare call fails', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'Not Found' }, 404));
      expect(
        await isBranchMergedInto({ base: 'main', head: 'task/T-1', repo: 'acme/widgets' }),
      ).toBe('unknown');
    });
  });

  describe('findBranchPr', () => {
    it('returns merge state and merge sha for the branch head PR', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse([
          {
            base: { ref: 'main' },
            head: { sha: 'head123' },
            html_url: 'https://github.com/acme/widgets/pull/7',
            merge_commit_sha: 'abc999',
            merged_at: '2026-01-01T00:00:00Z',
            number: 7,
          },
        ]),
      );

      expect(await findBranchPr('acme/widgets', 'task/T-1', 'main', 'tok')).toEqual({
        baseBranch: 'main',
        headSha: 'head123',
        merged: true,
        number: 7,
        sha: 'abc999',
        url: 'https://github.com/acme/widgets/pull/7',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('head=acme%3Atask%2FT-1'),
        expect.anything(),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('base=main'),
        expect.anything(),
      );
    });

    it('reports an open PR as unmerged', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse([
          {
            base: { ref: 'main' },
            head: { sha: 'head123' },
            html_url: 'https://github.com/acme/widgets/pull/7',
            merge_commit_sha: null,
            merged_at: null,
            number: 7,
          },
        ]),
      );
      expect(await findBranchPr('acme/widgets', 'task/T-1', 'main')).toEqual({
        baseBranch: 'main',
        headSha: 'head123',
        merged: false,
        number: 7,
        sha: undefined,
        url: 'https://github.com/acme/widgets/pull/7',
      });
    });

    it('returns undefined when no PR exists for the branch', async () => {
      fetchMock.mockResolvedValue(jsonResponse([]));
      expect(await findBranchPr('acme/widgets', 'task/T-1', 'main')).toBeUndefined();
    });
  });

  describe('getRemoteBranchSha', () => {
    it('returns the current branch commit', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ commit: { sha: 'head123' } }));
      await expect(getRemoteBranchSha('acme/widgets', 'task/T-1')).resolves.toBe('head123');
    });

    it('returns undefined when the branch cannot be read', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'Not Found' }, 404));
      await expect(getRemoteBranchSha('acme/widgets', 'task/T-1')).resolves.toBeUndefined();
    });
  });
});

describe('resolveGithubAccessToken', () => {
  const list = vi.fn();
  const get = vi.fn();
  const orgCreds = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (UserModel as any).mockImplementation(function () {
      return { getUserSettings: vi.fn().mockResolvedValue({ market: {} }) };
    });
    (MarketService as any).mockImplementation(function () {
      return {
        market: {
          creds: { get, list },
          organizations: { creds: orgCreds },
        },
      };
    });
    orgCreds.mockReturnValue({ get, list });
  });

  it('returns the access_token of the matching cred', async () => {
    list.mockResolvedValue({ data: [{ id: 'cred_1', key: 'github' }] });
    get.mockResolvedValue({ plaintext: { access_token: 'gho_123' } });

    expect(await resolveGithubAccessToken({ db: {} as any, userId: 'user-1' })).toBe('gho_123');
    expect(get).toHaveBeenCalledWith('cred_1', { decrypt: true });
  });

  it('reads creds from the shared organization inside a workspace', async () => {
    list.mockResolvedValue({ data: [{ id: 'cred_1', key: 'github' }] });
    get.mockResolvedValue({ plaintext: { access_token: 'gho_ws' } });

    await resolveGithubAccessToken({ db: {} as any, userId: 'u', workspaceId: 'ws-1' });

    expect(orgCreds).toHaveBeenCalledWith({ workspaceId: 'ws-1' });
  });

  it('honours a custom cred key and the token fallback field', async () => {
    list.mockResolvedValue({ data: [{ id: 'cred_9', key: 'gh-custom' }] });
    get.mockResolvedValue({ values: { token: 'fallback-tok' } });

    expect(
      await resolveGithubAccessToken({ credKey: 'gh-custom', db: {} as any, userId: 'u' }),
    ).toBe('fallback-tok');
  });

  it('returns undefined when no matching cred exists or the lookup throws', async () => {
    list.mockResolvedValue({ data: [{ id: 'cred_1', key: 'slack' }] });
    expect(await resolveGithubAccessToken({ db: {} as any, userId: 'u' })).toBeUndefined();

    list.mockRejectedValue(new Error('market down'));
    expect(await resolveGithubAccessToken({ db: {} as any, userId: 'u' })).toBeUndefined();
  });

  it('reuses a caller-provided MarketService instead of building one', async () => {
    const marketService = {
      market: { creds: { get, list }, organizations: { creds: orgCreds } },
    } as any;
    list.mockResolvedValue({ data: [{ id: 'cred_1', key: 'github' }] });
    get.mockResolvedValue({ plaintext: { access_token: 'gho_reuse' } });

    const token = await resolveGithubAccessToken({
      db: {} as any,
      marketService,
      userId: 'u',
    });

    expect(token).toBe('gho_reuse');
    expect(MarketService).not.toHaveBeenCalled();
  });
});
