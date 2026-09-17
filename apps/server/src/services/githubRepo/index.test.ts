// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UserModel } from '@/database/models/user';
import { MarketService } from '@/server/services/market';

import {
  createPullRequestForBranch,
  findBranchPr,
  getPullRequestReviewSnapshot,
  getRemoteBranchSha,
  getRepoDefaultBranch,
  isBranchMergedInto,
  mergePullRequest,
  parseGithubRepo,
  resolveGithubAccessToken,
} from './index';

vi.mock('@/database/models/user', () => ({ UserModel: vi.fn() }));
vi.mock('@/server/services/market', () => ({ MarketService: vi.fn() }));

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const openPr = () => ({
  base: { ref: 'main', sha: 'base1' },
  draft: false,
  head: { sha: 'head1' },
  html_url: 'https://github.com/acme/widgets/pull/9',
  merge_commit_sha: null,
  mergeable: true,
  mergeable_state: 'clean',
  merged: false,
  number: 9,
  requested_reviewers: [],
  requested_teams: [],
  state: 'open',
});

const emptyThreads = () =>
  jsonResponse({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } });

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

  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('returns the repo default branch', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ default_branch: 'main' }));
    await expect(getRepoDefaultBranch('acme/widgets', 'tok')).resolves.toBe('main');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/acme/widgets',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
    );
  });

  describe('isBranchMergedInto', () => {
    it.each([
      ['ahead', 'unknown'],
      ['identical', 'unknown'],
      ['behind', 'unknown'],
      ['diverged', 'unknown'],
      ['anything-else', 'unknown'],
    ] as const)('does not accept compare status %s as PR merge proof', async (status, expected) => {
      fetchMock.mockResolvedValue(jsonResponse({ status }));
      await expect(
        isBranchMergedInto({ base: 'main', head: 'task/T-1', repo: 'acme/widgets' }),
      ).resolves.toBe(expected);
    });

    it('reports unknown when compare fails', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'Not Found' }, 404));
      await expect(
        isBranchMergedInto({ base: 'main', head: 'task/T-1', repo: 'acme/widgets' }),
      ).resolves.toBe('unknown');
    });
  });

  describe('findBranchPr', () => {
    it('returns PR identity and merge sha', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse([
          {
            base: { ref: 'main' },
            html_url: 'https://github.com/acme/widgets/pull/7',
            head: { sha: 'head123' },
            merge_commit_sha: 'abc999',
            merged_at: '2026-01-01T00:00:00Z',
            number: 7,
          },
        ]),
      );
      await expect(findBranchPr('acme/widgets', 'task/T-1', 'main', 'tok')).resolves.toEqual({
        baseBranch: 'main',
        headSha: 'head123',
        merged: true,
        number: 7,
        sha: 'abc999',
        url: 'https://github.com/acme/widgets/pull/7',
      });
    });

    it('returns undefined when no PR exists', async () => {
      fetchMock.mockResolvedValue(jsonResponse([]));
      await expect(findBranchPr('acme/widgets', 'task/T-1', 'main')).resolves.toBeUndefined();
    });
  });

  it('reads a branch head sha', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ commit: { sha: 'head123' } }));
    await expect(getRemoteBranchSha('acme/widgets', 'task/T-1')).resolves.toBe('head123');
  });

  it('creates the PR with a stable delivery head/base', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ html_url: 'https://github.com/acme/widgets/pull/8', number: 8 }, 201),
    );
    await expect(
      createPullRequestForBranch({
        baseBranch: 'main',
        headBranch: 'task/T-2',
        repo: 'acme/widgets',
        title: 'T-2: fix it',
        token: 'tok',
      }),
    ).resolves.toEqual({ number: 8, url: 'https://github.com/acme/widgets/pull/8' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/acme/widgets/pulls',
      expect.objectContaining({ body: expect.stringContaining('task/T-2'), method: 'POST' }),
    );
  });

  it('reads CI, human feedback and unresolved review threads for one head revision', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr()))
      .mockResolvedValueOnce(
        jsonResponse({
          check_runs: [
            { conclusion: 'success', name: 'Typecheck', status: 'completed' },
            { conclusion: 'failure', name: 'E2E', status: 'completed' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([{ id: 31, state: 'CHANGES_REQUESTED', user: { login: 'r', type: 'User' } }]),
      )
      .mockResolvedValueOnce(
        jsonResponse([{ id: 41, user: { login: 'r', type: 'User' } }]),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { id: 51, user: { login: 'alex', type: 'User' } },
          { id: 52, user: { login: 'ci[bot]', type: 'Bot' } },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            repository: {
              pullRequest: {
                reviewThreads: { nodes: [{ id: 'THREAD_1', isResolved: false }] },
              },
            },
          },
        }),
      );

    const snapshot = await getPullRequestReviewSnapshot('acme/widgets', 9, 'tok');
    expect(snapshot).toMatchObject({
      baseSha: 'base1',
      headSha: 'head1',
      humanCommentIds: ['review-comment:41', 'issue-comment:51'],
      requestedChangeReviewIds: ['review:31'],
      unresolvedThreadIds: ['THREAD_1'],
    });
    expect(snapshot?.checks).toEqual({
      failed: ['E2E'],
      pending: [],
      skipped: [],
      successful: ['Typecheck'],
    });
  });

  it('uses the latest decisive review per actor', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr()))
      .mockResolvedValueOnce(
        jsonResponse({ check_runs: [{ conclusion: 'success', name: 'Typecheck', status: 'completed' }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { id: 31, state: 'CHANGES_REQUESTED', user: { login: 'r', type: 'User' } },
          { id: 32, state: 'COMMENTED', user: { login: 'r', type: 'User' } },
          { id: 33, state: 'APPROVED', user: { login: 'r', type: 'User' } },
          { id: 34, state: 'CHANGES_REQUESTED', user: { login: 'other', type: 'User' } },
          { id: 35, state: 'DISMISSED', user: { login: 'other', type: 'User' } },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(emptyThreads());

    const snapshot = await getPullRequestReviewSnapshot('acme/widgets', 9);
    expect(snapshot?.requestedChangeReviewIds).toEqual([]);
  });

  it('does not treat the duplicate-run guard as delivery CI evidence', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr()))
      .mockResolvedValueOnce(
        jsonResponse({
          check_runs: [
            { conclusion: 'success', name: 'Check Duplicate Run', status: 'completed' },
            { conclusion: 'skipped', name: 'Test Database', status: 'completed' },
            { conclusion: 'skipped', name: 'Typecheck', status: 'completed' },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(emptyThreads());

    const snapshot = await getPullRequestReviewSnapshot('acme/widgets', 9);
    expect(snapshot?.checks).toEqual({
      failed: [],
      pending: ['No delivery CI check executed successfully for this revision'],
      skipped: ['Check Duplicate Run', 'Test Database', 'Typecheck'],
      successful: [],
    });
  });

  it('merges only the expected reviewed head sha', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ merged: true, sha: 'merge123' }));
    await expect(
      mergePullRequest({
        expectedHeadSha: 'head123',
        prNumber: 9,
        repo: 'acme/widgets',
        token: 'tok',
      }),
    ).resolves.toEqual({ merged: true, message: undefined, sha: 'merge123' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/acme/widgets/pulls/9/merge',
      expect.objectContaining({ body: expect.stringContaining('head123'), method: 'PUT' }),
    );
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
        market: { creds: { get, list }, organizations: { creds: orgCreds } },
      };
    });
    orgCreds.mockReturnValue({ get, list });
  });

  it('returns the access_token of the matching cred', async () => {
    list.mockResolvedValue({ data: [{ id: 'cred_1', key: 'github' }] });
    get.mockResolvedValue({ plaintext: { access_token: 'gho_123' } });
    await expect(resolveGithubAccessToken({ db: {} as any, userId: 'user-1' })).resolves.toBe(
      'gho_123',
    );
  });

  it('reads shared organization credentials in a workspace', async () => {
    list.mockResolvedValue({ data: [{ id: 'cred_1', key: 'github' }] });
    get.mockResolvedValue({ plaintext: { access_token: 'gho_ws' } });
    await resolveGithubAccessToken({ db: {} as any, userId: 'u', workspaceId: 'ws-1' });
    expect(orgCreds).toHaveBeenCalledWith({ workspaceId: 'ws-1' });
  });

  it('honours a custom cred key and token fallback', async () => {
    list.mockResolvedValue({ data: [{ id: 'cred_9', key: 'gh-custom' }] });
    get.mockResolvedValue({ values: { token: 'fallback-tok' } });
    await expect(
      resolveGithubAccessToken({ credKey: 'gh-custom', db: {} as any, userId: 'u' }),
    ).resolves.toBe('fallback-tok');
  });

  it('returns undefined when credential lookup fails', async () => {
    list.mockRejectedValue(new Error('market down'));
    await expect(resolveGithubAccessToken({ db: {} as any, userId: 'u' })).resolves.toBeUndefined();
  });
});