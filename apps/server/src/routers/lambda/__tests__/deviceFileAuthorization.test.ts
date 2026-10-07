// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { inspectGitWorktreePath } from '@orvilo/local-file-shell/git';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as WorkspaceModelModule from '@/database/models/workspace';

import {
  defaultGetProjectFileIndex,
  defaultSearchProjectFiles,
} from '../../../../../../packages/device-control/src/projectFileIndex';
import { deviceRouter } from '../device';

const mocks = vi.hoisted(() => ({
  membershipRole: vi.fn(),
  personal: vi.fn(),
  workspace: vi.fn(),
  write: vi.fn(),
  move: vi.fn(),
  rename: vi.fn(),
  preview: vi.fn(),
  checkout: vi.fn(),
  updateWorkspace: vi.fn(),
  discovery: vi.fn(),
  directoryRpc: vi.fn(),
  inspectRepository: vi.fn(),
  index: vi.fn(),
  search: vi.fn(),
}));
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: () => ({}) }));
vi.mock('@/database/models/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceModelModule>()),
  getActiveWorkspaceMembershipRole: mocks.membershipRole,
}));
vi.mock('@/database/models/device', () => ({
  WorkspaceDevicePrivateConflictError: class extends Error {},
  DeviceModel: class {
    findByDeviceId = mocks.personal;
    findWorkspaceDeviceById = mocks.workspace;
    updateWorkspaceDevice = mocks.updateWorkspace;
  },
}));
vi.mock('@/server/services/deviceGateway', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  deviceGateway: {
    writeProjectFile: mocks.write,
    moveProjectFiles: mocks.move,
    renameProjectFile: mocks.rename,
    getLocalFilePreview: mocks.preview,
    checkoutGitBranch: mocks.checkout,
    inspectGitWorktreePath: mocks.inspectRepository,
    listHeterogeneousAgentModels: mocks.discovery,
    listHeterogeneousAgentPermissions: mocks.discovery,
    ...Object.fromEntries(
      [
        'gitBranch',
        'gitLinkedPullRequest',
        'gitWorkingTreeStatus',
        'gitAheadBehind',
        'listGitWorktrees',
        'listGitBranches',
        'getGitWorkingTreePatches',
        'getGitBranchDiff',
        'listGitRemoteBranches',
        'getGitWorkingTreeFiles',
        'getProjectFileIndex',
        'listProjectDirectory',
        'searchProjectFiles',
        'listProjectSkills',
        'renameGitBranch',
        'deleteGitBranch',
        'removeGitWorktree',
        'addGitWorktree',
        'pullGitBranch',
        'pushGitBranch',
        'revertGitFile',
      ].map((name) => [name, mocks.directoryRpc]),
    ),
    getProjectFileIndex: mocks.index,
    searchProjectFiles: mocks.search,
  },
}));
const caller = (workspaceId?: string) =>
  deviceRouter.createCaller({ userId: 'actor', workspaceId } as never);
const input = {
  deviceId: 'host',
  workingDirectory: '/approved',
  path: '/approved/file',
  content: 'text',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.membershipRole.mockResolvedValue('member');
  mocks.personal.mockResolvedValue({ userId: 'actor', workspaceId: null, defaultCwd: '/approved' });
  mocks.workspace.mockResolvedValue({
    userId: 'enroller',
    workspaceId: 'ws',
    defaultCwd: '/approved',
  });
  mocks.write.mockResolvedValue({ success: true });
  mocks.directoryRpc.mockResolvedValue({ success: true });
  mocks.checkout.mockResolvedValue({ success: true });
  mocks.inspectRepository.mockReset().mockResolvedValue({ kind: 'listed', repoRoot: '/approved' });
  mocks.index.mockReset();
  mocks.search.mockReset();
});
describe('direct Device file authorization through real RPC procedures', () => {
  it.each(['admin', 'member', 'viewer'])(
    'does not grant %s management over another enroller',
    async (role) => {
      mocks.membershipRole.mockResolvedValue(role);
      await expect(
        caller('ws').updateWorkspaceDevice({ deviceId: 'host', friendlyName: 'renamed' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(mocks.updateWorkspace).not.toHaveBeenCalled();
    },
  );
  it.each(['owner', 'member'])(
    'retains %s management under the existing owner/enroller conditions',
    async (role) => {
      mocks.membershipRole.mockResolvedValue(role);
      if (role === 'member')
        mocks.workspace.mockResolvedValue({ userId: 'actor', workspaceId: 'ws' });
      await expect(
        caller('ws').updateWorkspaceDevice({ deviceId: 'host', friendlyName: 'renamed' }),
      ).resolves.toEqual({ success: true });
    },
  );
  it('allows Viewer read inside an approved shared root', async () => {
    mocks.membershipRole.mockResolvedValue('viewer');
    mocks.personal.mockResolvedValue(undefined);
    mocks.preview.mockResolvedValue({ content: 'readable' });
    await expect(caller('ws').getLocalFilePreview(input)).resolves.toEqual({ content: 'readable' });
  });
  it('permits the personal owner without Agent Use input', async () => {
    await expect(caller().writeProjectFile(input)).resolves.toEqual({ success: true });
  });
  it('permits a writable member on a shared enrollment owned by another member', async () => {
    mocks.personal.mockResolvedValue(undefined);
    await expect(caller('ws').writeProjectFile(input)).resolves.toEqual({ success: true });
  });
  it.each(['writeProjectFile', 'moveProjectFiles', 'renameProjectFile'] as const)(
    'denies Viewer %s before transport',
    async (operation) => {
      mocks.membershipRole.mockResolvedValue('viewer');
      await expect(
        caller('ws')[operation]({ ...input, items: [], newName: 'renamed' } as never),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(mocks.write).not.toHaveBeenCalled();
      expect(mocks.move).not.toHaveBeenCalled();
      expect(mocks.rename).not.toHaveBeenCalled();
    },
  );
  it('denies Viewer Git mutation before transport', async () => {
    mocks.membershipRole.mockResolvedValue('viewer');
    await expect(
      caller('ws').checkoutGitBranch({ deviceId: 'host', path: '/approved', branch: 'branch' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it.each(['private-other', 'other-workspace', 'removed'])(
    'denies invisible enrollment %s',
    async (deviceId) => {
      mocks.workspace.mockResolvedValue(undefined);
      await expect(caller('ws').writeProjectFile({ ...input, deviceId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(mocks.write).not.toHaveBeenCalled();
    },
  );
  it('denies a personal device absent from the actor registry', async () => {
    mocks.personal.mockResolvedValue(undefined);
    await expect(caller().writeProjectFile(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it.each(['/', '/approved-evil', '/approved/../outside'])(
    'denies unapproved workspace root %s',
    async (workingDirectory) => {
      await expect(
        caller('ws').writeProjectFile({ ...input, workingDirectory }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(mocks.write).not.toHaveBeenCalled();
    },
  );
});

describe('reviewed Device discovery and approved-directory boundaries', () => {
  it.each(['listHeterogeneousAgentModels', 'listHeterogeneousAgentPermissions'] as const)(
    'denies Viewer executable %s discovery before transport',
    async (operation) => {
      mocks.membershipRole.mockResolvedValue('viewer');
      await expect(
        caller('ws')[operation]({
          deviceId: 'host',
          type: 'codebuddy',
          command: '/bin/sh',
          args: ['-c', 'probe'],
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(mocks.discovery).not.toHaveBeenCalled();
    },
  );
  const gitMutations = [
    ['checkoutGitBranch', { branch: 'branch' }],
    ['renameGitBranch', { from: 'before', to: 'after' }],
    ['deleteGitBranch', { branch: 'branch' }],
    ['removeGitWorktree', { worktreePath: '/approved/worktree' }],
    ['addGitWorktree', { branch: 'branch' }],
    ['pullGitBranch', {}],
    ['pushGitBranch', {}],
    ['revertGitFile', { filePath: 'file' }],
  ] as const;
  it.each(gitMutations)(
    'denies %s in an unapproved repository before transport',
    async (operation, args) => {
      await expect(
        caller('ws')[operation]({ deviceId: 'host', path: '/outside/repo', ...args } as never),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(mocks.directoryRpc).not.toHaveBeenCalled();
      expect(mocks.checkout).not.toHaveBeenCalled();
    },
  );
  const reads = [
    ['gitBranch', { path: '/outside' }],
    ['gitLinkedPullRequest', { path: '/outside', branch: 'branch' }],
    ['gitWorkingTreeStatus', { path: '/outside' }],
    ['gitAheadBehind', { path: '/outside' }],
    ['listGitWorktrees', { path: '/outside' }],
    ['listGitBranches', { path: '/outside' }],
    ['getGitWorkingTreePatches', { path: '/outside' }],
    ['getGitBranchDiff', { path: '/outside' }],
    ['listGitRemoteBranches', { path: '/outside' }],
    ['getGitWorkingTreeFiles', { path: '/outside' }],
    ['getProjectFileIndex', { scope: '/outside', path: '/approved' }],
    ['listProjectDirectory', { root: '/outside', relativePath: '', path: '/approved' }],
    ['searchProjectFiles', { scope: '/outside', query: 'needle', path: '/approved' }],
    ['listProjectSkills', { scope: '/outside', path: '/approved' }],
  ] as const;
  it.each(reads)(
    'denies Viewer %s outside approved roots before transport',
    async (operation, args) => {
      mocks.membershipRole.mockResolvedValue('viewer');
      await expect(
        caller('ws')[operation]({ deviceId: 'host', ...args } as never),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(mocks.directoryRpc).not.toHaveBeenCalled();
    },
  );
  it('allows shared approved-root Git mutation by a member', async () => {
    mocks.personal.mockResolvedValue(undefined);
    await expect(
      caller('ws').checkoutGitBranch({
        deviceId: 'host',
        path: '/approved/repo',
        branch: 'branch',
      }),
    ).resolves.toEqual({ success: true });
  });
  it('allows Viewer content reads under a shared approved root', async () => {
    mocks.membershipRole.mockResolvedValue('viewer');
    mocks.personal.mockResolvedValue(undefined);
    await expect(
      caller('ws').getGitWorkingTreePatches({ deviceId: 'host', path: '/approved/repo' }),
    ).resolves.toEqual({ success: true });
  });
  it('does not let an approved source repo authorize removing an outside worktree', async () => {
    await expect(
      caller('ws').removeGitWorktree({
        deviceId: 'host',
        path: '/approved/repo',
        worktreePath: '/outside/linked',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.directoryRpc).not.toHaveBeenCalled();
  });
  it('allows removing a listed worktree under another explicitly approved root', async () => {
    mocks.inspectRepository.mockResolvedValue({ kind: 'listed', repoRoot: '/approved/repo' });
    mocks.workspace.mockResolvedValue({
      defaultCwd: '/approved/repo',
      workingDirs: [{ path: '/linked' }],
    });
    await expect(
      caller('ws').removeGitWorktree({
        deviceId: 'host',
        path: '/approved/repo',
        worktreePath: '/linked/task',
      }),
    ).resolves.toEqual({ success: true });
  });
  it('does not let an approved source repo authorize creating an unapproved sibling worktree', async () => {
    mocks.workspace.mockResolvedValue({ defaultCwd: '/approved/repo' });
    await expect(
      caller('ws').addGitWorktree({ deviceId: 'host', path: '/approved/repo', branch: 'branch' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.directoryRpc).not.toHaveBeenCalled();
  });
});

const effectiveRootFixtures: string[] = [];
afterEach(async () => {
  await Promise.all(
    effectiveRootFixtures.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

const createEffectiveRootFixture = async () => {
  const repo = await realpath(await mkdtemp(path.join(tmpdir(), 'device-effective-root-')));
  effectiveRootFixtures.push(repo);
  const child = path.join(repo, 'allowed');
  await promisify(execFile)('git', ['-c', 'init.defaultBranch=main', 'init'], { cwd: repo });
  await mkdir(child);
  await writeFile(path.join(repo, 'parent-secret.txt'), 'outside child');
  await writeFile(path.join(child, 'child.txt'), 'inside child');
  mocks.inspectRepository.mockImplementation(inspectGitWorktreePath);
  mocks.index.mockImplementation(defaultGetProjectFileIndex);
  mocks.search.mockImplementation(defaultSearchProjectFiles);
  return { repo, child };
};

describe('effective native repository root authorization through real RPC procedures', () => {
  it('denies a Git mutation when only its child cwd is approved', async () => {
    const { child } = await createEffectiveRootFixture();
    mocks.workspace.mockResolvedValue({ defaultCwd: child });
    await expect(
      caller('ws').checkoutGitBranch({ deviceId: 'host', path: child, branch: 'other' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it('denies a Viewer repository-wide Git read when only its child cwd is approved', async () => {
    const { child } = await createEffectiveRootFixture();
    mocks.membershipRole.mockResolvedValue('viewer');
    mocks.workspace.mockResolvedValue({ defaultCwd: child });
    await expect(
      caller('ws').getGitWorkingTreePatches({ deviceId: 'host', path: child }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.directoryRpc).not.toHaveBeenCalled();
  });
  it('allows a legitimate child cwd when the full repository is approved', async () => {
    const { repo, child } = await createEffectiveRootFixture();
    mocks.workspace.mockResolvedValue({ defaultCwd: repo });
    await expect(
      caller('ws').checkoutGitBranch({ deviceId: 'host', path: child, branch: 'other' }),
    ).resolves.toEqual({ success: true });
  });
  it('fails honestly before Git transport if the host cannot prove a repository root', async () => {
    mocks.inspectRepository.mockResolvedValue(undefined);
    await expect(
      caller('ws').checkoutGitBranch({ deviceId: 'host', path: '/approved', branch: 'other' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it.each(['getProjectFileIndex', 'searchProjectFiles'] as const)(
    'returns only the requested approved child scope from native %s',
    async (operation) => {
      const { child } = await createEffectiveRootFixture();
      mocks.membershipRole.mockResolvedValue('viewer');
      mocks.workspace.mockResolvedValue({ defaultCwd: child });
      const result = await caller('ws')[operation]({
        deviceId: 'host',
        scope: child,
        query: 'txt',
      } as never);
      expect(result?.root).toBe(child);
      expect(result?.entries.map(({ relativePath }) => relativePath)).toEqual(['child.txt']);
    },
  );
  it.each(['getProjectFileIndex', 'searchProjectFiles'] as const)(
    'refuses unapproved widened result root from an existing host %s',
    async (operation) => {
      const { repo, child } = await createEffectiveRootFixture();
      mocks.workspace.mockResolvedValue({ defaultCwd: child });
      const nativeRpc = operation === 'getProjectFileIndex' ? mocks.index : mocks.search;
      nativeRpc.mockResolvedValue({ root: repo, entries: [{ relativePath: 'parent-secret.txt' }] });
      await expect(
        caller('ws')[operation]({ deviceId: 'host', scope: child, query: 'txt' } as never),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    },
  );
});
