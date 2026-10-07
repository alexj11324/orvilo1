import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveDescriptionReference } from './descriptionReference';

const mocks = vi.hoisted(() => ({ find: vi.fn(), pullRequest: vi.fn() }));
vi.mock('./task', () => ({ taskService: { find: mocks.find } }));
vi.mock('./pullRequest', () => ({ pullRequestService: { detail: mocks.pullRequest } }));

const origin = 'https://orvilo.example';
const issue = { id: 'T-7', kind: 'issue', url: `${origin}/task/T-7` };
const pr = {
  id: 'gh:github.com:acme:widgets:7',
  kind: 'pull-request',
  url: 'https://github.com/acme/widgets/pull/7',
};

beforeEach(() => vi.clearAllMocks());

describe('description reference authorized metadata', () => {
  it('resolves Issues through the existing scoped task reader', async () => {
    mocks.find.mockResolvedValue({
      data: { identifier: 'ISS-7', name: 'Synthetic Issue', workflowCategory: 'in_progress' },
    });
    await expect(resolveDescriptionReference(issue, origin)).resolves.toEqual({
      identifier: 'ISS-7',
      kind: 'issue',
      title: 'Synthetic Issue',
      workflowCategory: 'in_progress',
    });
    expect(mocks.find).toHaveBeenCalledWith('T-7');
    expect(mocks.pullRequest).not.toHaveBeenCalled();
  });

  it('resolves PR title/status through the existing caller OAuth reader', async () => {
    mocks.pullRequest.mockResolvedValue({
      data: { isDraft: false, state: 'MERGED', title: 'Synthetic pull request' },
    });
    await expect(resolveDescriptionReference(pr, origin)).resolves.toEqual({
      isDraft: false,
      kind: 'pull-request',
      state: 'MERGED',
      title: 'Synthetic pull request',
    });
    expect(mocks.pullRequest).toHaveBeenCalledWith(pr.id);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('retains access failures instead of trusting a saved private preview', async () => {
    const denied = new Error('not readable');
    mocks.pullRequest.mockRejectedValue(denied);
    await expect(
      resolveDescriptionReference({ ...pr, title: 'Private snapshot' }, origin),
    ).rejects.toBe(denied);
  });

  it.each([
    { ...pr, url: 'https://evil.example/pull/7' },
    { ...pr, id: 'gh:github.com:private:elsewhere:1' },
    { ...issue, url: 'javascript:alert(1)' },
    { ...issue, kind: 'pull-request' },
    null,
  ])('does not call a reader for malformed imported identity %j', async (value) => {
    await expect(resolveDescriptionReference(value, origin)).rejects.toThrow('Invalid reference');
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.pullRequest).not.toHaveBeenCalled();
  });

  it('never resolves a foreign workspace identifier against the current tenant', async () => {
    const foreign = { ...issue, url: `${origin}/workspace-b/task/T-7` };
    await expect(resolveDescriptionReference(foreign, origin, 'workspace-a')).rejects.toThrow();
    expect(mocks.find).not.toHaveBeenCalled();
    mocks.find.mockResolvedValue({ data: { identifier: 'T-7', name: 'Workspace B Issue' } });
    await expect(
      resolveDescriptionReference(foreign, origin, 'workspace-b'),
    ).resolves.toMatchObject({
      title: 'Workspace B Issue',
    });
  });
});
