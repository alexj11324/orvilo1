import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { executeDeviceRpc } from '../dispatch';
import type { DeviceControlDeps } from '../types';

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** Real repo on `main` with one commit — claim registry tests need real git. */
const initRepo = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'device-control-git-'));
  execFileSync('git', ['-c', 'init.defaultBranch=main', 'init'], { cwd: dir });
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  await writeFile(path.join(dir, 'a.txt'), 'hello\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-m', 'init');
  return dir;
};

let root: string;
let deviceHome: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'device-control-'));
  deviceHome = await mkdtemp(path.join(tmpdir(), 'device-control-home-'));
  vi.stubEnv('HOME', deviceHome);

  await mkdir(path.join(root, '.agents', 'skills', 'spa-routes'), { recursive: true });
  await writeFile(
    path.join(root, '.agents', 'skills', 'spa-routes', 'SKILL.md'),
    '---\nname: spa-routes\ndescription: SPA routing\n---\nbody',
  );
  await writeFile(path.join(root, 'AGENTS.md'), '# Agents');
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(root, { force: true, recursive: true });
  await rm(deviceHome, { force: true, recursive: true });
});

const makeDeps = (): DeviceControlDeps => ({
  approveProjectRoot: vi.fn(async () => {}),
  getLocalFilePreview: vi.fn(async () => ({ success: true })),
  getProjectFileIndex: vi.fn(async () => ({
    entries: [],
    indexedAt: '',
    root: '',
    source: 'glob' as const,
  })),
  copyAssetForPublish: vi.fn(async () => ({ success: true })),
  readExternalAssetForPublish: vi.fn(async () => ({
    base64: 'AQID',
    contentType: 'image/png',
    success: true,
  })),
  searchProjectFiles: vi.fn(async () => ({
    entries: [],
    root: '',
    searchedAt: '',
    source: 'glob' as const,
  })),
});

describe('executeDeviceRpc', () => {
  it('throws on an unknown method', async () => {
    await expect(executeDeviceRpc('nope', {}, makeDeps())).rejects.toThrow(
      'Unknown device RPC method: nope',
    );
  });

  it('routes initWorkspace through the shared workspace scan and approves the root', async () => {
    const deps = makeDeps();
    const result = (await executeDeviceRpc('initWorkspace', { scope: root }, deps)) as {
      instructions: { content: string; source: string }[];
      skills: { name: string }[];
    };

    expect(result.skills.map((s) => s.name)).toEqual(['spa-routes']);
    expect(result.instructions).toEqual([{ content: '# Agents', source: 'AGENTS.md' }]);
    expect(deps.approveProjectRoot).toHaveBeenCalledWith(root);
  });

  it('routes listProjectSkills to the .agents/skills source', async () => {
    const result = (await executeDeviceRpc('listProjectSkills', { scope: root }, makeDeps())) as {
      source: string | null;
    };
    expect(result.source).toBe('.agents/skills');
  });

  it('merges project and device skills with project taking name precedence', async () => {
    const deviceSkillRoot = path.join(deviceHome, '.agents', 'skills');

    await mkdir(path.join(deviceSkillRoot, 'device-writer'), { recursive: true });
    await writeFile(
      path.join(deviceSkillRoot, 'device-writer', 'SKILL.md'),
      '---\nname: device-writer\ndescription: Device writer\n---\nbody',
    );
    await mkdir(path.join(deviceSkillRoot, 'spa-routes'), { recursive: true });
    await writeFile(
      path.join(deviceSkillRoot, 'spa-routes', 'SKILL.md'),
      '---\nname: spa-routes\ndescription: Device duplicate\n---\nbody',
    );

    try {
      const deps = makeDeps();
      const result = (await executeDeviceRpc('listProjectSkills', { scope: root }, deps)) as {
        skills: { name: string; previewRoot: string; scope: 'device' | 'project' }[];
      };

      expect(result.skills.map((skill) => `${skill.name}:${skill.scope}`)).toEqual([
        'device-writer:device',
        'spa-routes:project',
      ]);
      expect(result.skills.find((skill) => skill.name === 'device-writer')?.previewRoot).toBe(
        deviceSkillRoot,
      );
      expect(deps.approveProjectRoot).toHaveBeenCalledWith(root);
      expect(deps.approveProjectRoot).toHaveBeenCalledWith(deviceSkillRoot);
    } finally {
      await rm(path.join(deviceSkillRoot, 'device-writer'), { force: true, recursive: true });
      await rm(path.join(deviceSkillRoot, 'spa-routes'), { force: true, recursive: true });
    }
  });

  it('parses folded skill descriptions from frontmatter', async () => {
    await mkdir(path.join(root, '.agents', 'skills', 'agent-testing'), { recursive: true });
    await writeFile(
      path.join(root, '.agents', 'skills', 'agent-testing', 'SKILL.md'),
      [
        '---',
        'name: agent-testing',
        'description: >',
        '  Agentic end-to-end testing for Orvilo: backend verification via the CLI,',
        '  frontend verification via agent-browser (Electron).',
        '---',
        'body',
      ].join('\n'),
    );

    const result = (await executeDeviceRpc('listProjectSkills', { scope: root }, makeDeps())) as {
      skills: { description?: string; name: string }[];
    };

    expect(result.skills.find((skill) => skill.name === 'agent-testing')?.description).toBe(
      'Agentic end-to-end testing for Orvilo: backend verification via the CLI, frontend verification via agent-browser (Electron).',
    );
  });

  it('routes statPath and reports a directory + repo type', async () => {
    const result = (await executeDeviceRpc('statPath', { path: root }, makeDeps())) as {
      exists: boolean;
      isDirectory: boolean;
    };
    expect(result.exists).toBe(true);
    expect(result.isDirectory).toBe(true);
  });

  it('browses one directory level with pagination and excludes files and hidden folders', async () => {
    const browseRoot = await mkdtemp(path.join(tmpdir(), 'device-control-browse-'));
    try {
      await mkdir(path.join(browseRoot, '.hidden'));
      await mkdir(path.join(browseRoot, 'alpha'));
      await mkdir(path.join(browseRoot, 'beta'));
      await writeFile(path.join(browseRoot, 'notes.txt'), 'not a directory');

      const first = (await executeDeviceRpc(
        'browseDirectory',
        { limit: 1, path: browseRoot },
        makeDeps(),
      )) as { entries: { name: string }[]; nextCursor?: string; truncated: boolean };
      expect(first.entries.map((entry) => entry.name)).toEqual(['alpha']);
      expect(first.truncated).toBe(true);

      const second = (await executeDeviceRpc(
        'browseDirectory',
        { cursor: first.nextCursor, limit: 1, path: browseRoot },
        makeDeps(),
      )) as { entries: { name: string }[]; truncated: boolean };
      expect(second.entries.map((entry) => entry.name)).toEqual(['beta']);
      expect(second.truncated).toBe(false);
    } finally {
      await rm(browseRoot, { force: true, recursive: true });
    }
  });

  it('routes heterogeneous agent model discovery to the execution host', async () => {
    const deps = makeDeps();
    deps.listHeterogeneousAgentModels = vi.fn(async () => ({
      models: [{ id: 'openai/gpt-5.6', modelId: 'gpt-5.6', providerId: 'openai' }],
      status: 'success' as const,
      updatedAt: 1,
    }));
    const params = {
      args: ['--feature=test'],
      command: '/custom/traecli',
      cwd: root,
      type: 'trae' as const,
    };

    const result = await executeDeviceRpc('listHeterogeneousAgentModels', params, deps);

    expect(deps.listHeterogeneousAgentModels).toHaveBeenCalledWith(params);
    expect(result).toMatchObject({ status: 'success' });
  });

  it('reports model discovery as unsupported when the device client is too old', async () => {
    await expect(
      executeDeviceRpc('listHeterogeneousAgentModels', { type: 'opencode' }, makeDeps()),
    ).rejects.toThrow('does not support heterogeneous agent model discovery');
  });

  it('delegates project file and preview methods to injected deps', async () => {
    const deps = makeDeps();
    await executeDeviceRpc('getProjectFileIndex', { scope: root }, deps);
    expect(deps.getProjectFileIndex).toHaveBeenCalledWith({ scope: root });

    await executeDeviceRpc('searchProjectFiles', { query: 'agent', scope: root }, deps);
    expect(deps.searchProjectFiles).toHaveBeenCalledWith({ query: 'agent', scope: root });

    const previewParams = { path: path.join(root, 'AGENTS.md'), workingDirectory: root };
    await executeDeviceRpc('getLocalFilePreview', previewParams, deps);
    expect(deps.getLocalFilePreview).toHaveBeenCalledWith(previewParams);

    await executeDeviceRpc('readExternalAssetForPublish', previewParams, deps);
    expect(deps.readExternalAssetForPublish).toHaveBeenCalledWith(previewParams);

    const copyParams = {
      from: previewParams.path,
      to: path.join(root, 'copy.md'),
      workingDirectory: root,
    };
    await executeDeviceRpc('copyAssetForPublish', copyParams, deps);
    expect(deps.copyAssetForPublish).toHaveBeenCalledWith(copyParams);
  });

  it('routes a git method (listGitBranches) without touching deps', async () => {
    // Not a git repo → the shared local-file-shell impl returns an empty list.
    const result = await executeDeviceRpc('listGitBranches', { path: root }, makeDeps());
    expect(Array.isArray(result)).toBe(true);
  });

  it('routes moveLocalFiles to the shared local-file-shell impl', async () => {
    const oldPath = path.join(root, 'move-src.txt');
    const newPath = path.join(root, 'move-dst.txt');
    await writeFile(oldPath, 'hello');

    const result = (await executeDeviceRpc(
      'moveLocalFiles',
      { items: [{ newPath, oldPath }] },
      makeDeps(),
    )) as { newPath?: string; success: boolean }[];

    expect(result).toHaveLength(1);
    expect(result[0].success).toBe(true);
    expect(result[0].newPath).toBe(newPath);
  });

  it('routes renameLocalFile to the shared local-file-shell impl', async () => {
    const filePath = path.join(root, 'rename-src.txt');
    await writeFile(filePath, 'hello');

    const result = (await executeDeviceRpc(
      'renameLocalFile',
      { newName: 'rename-dst.txt', path: filePath },
      makeDeps(),
    )) as { newPath: string; success: boolean };

    expect(result.success).toBe(true);
    expect(result.newPath).toBe(path.join(root, 'rename-dst.txt'));
  });

  it('routes writeLocalFile to the shared local-file-shell impl', async () => {
    const filePath = path.join(root, 'write-target.txt');

    const result = (await executeDeviceRpc(
      'writeLocalFile',
      { content: 'remote edit', path: filePath },
      makeDeps(),
    )) as { success: boolean };

    expect(result.success).toBe(true);
    expect(await readFile(filePath, 'utf8')).toBe('remote edit');
  });

  it('routes listGitWorktrees through the shared git dispatcher', async () => {
    // Not a git repo → the shared local-file-shell impl returns an empty list.
    const result = await executeDeviceRpc('listGitWorktrees', { path: root }, makeDeps());
    expect(Array.isArray(result)).toBe(true);
  });

  it('routes removeGitWorktree through the shared git dispatcher', async () => {
    const result = (await executeDeviceRpc(
      'removeGitWorktree',
      { path: root, worktreePath: root },
      makeDeps(),
    )) as { success: boolean };
    expect(result.success).toBe(false);
  });

  it('SA01-A: refuses a claimToken remove when the host has no run registry', async () => {
    const result = (await executeDeviceRpc(
      'removeGitWorktree',
      { claimToken: 'tok-1', path: root, worktreePath: root },
      makeDeps(),
    )) as { claimTokenVerified?: boolean; error?: string; success: boolean };

    expect(result.success).toBe(false);
    expect(result.claimTokenVerified).toBe(false);
    expect(result.error).toContain('run registry');
  });

  it('SB01: a claimToken remove is never verified without a registered claim', async () => {
    // The old contract returned claimTokenVerified after a mere writer check —
    // any token on any path. Now a non-repo path carries no claims registry at
    // all, and verification cannot even be attempted.
    const deps = {
      ...makeDeps(),
      getActiveWorktreeWriter: vi.fn(async () => null),
    };
    const result = (await executeDeviceRpc(
      'removeGitWorktree',
      { claimToken: 'tok-1', path: root, worktreePath: root },
      deps,
    )) as { claimTokenVerified?: boolean; error?: string; success: boolean };

    expect(result.success).toBe(false);
    expect(result.claimTokenVerified).toBe(false);
    expect(result.error).toContain('claim');
  });

  it('SB01: add registers the claim, a matching token removes verified, a stale token cannot', async () => {
    const repo = await initRepo();
    const parent = await mkdtemp(path.join(tmpdir(), 'device-control-wt-'));
    const linked = path.join(parent, 'linked');
    const deps = {
      ...makeDeps(),
      getActiveWorktreeWriter: vi.fn(async () => null),
    };
    try {
      const added = (await executeDeviceRpc(
        'addGitWorktree',
        { branch: 'task/T-1', claimToken: 'tok-secret', path: repo, worktreePath: linked },
        deps,
      )) as { claimRegistered?: boolean; success: boolean };
      expect(added).toMatchObject({ claimRegistered: true, success: true });
      expect(existsSync(linked)).toBe(true);

      // A token that was never registered must not touch the directory.
      const stale = (await executeDeviceRpc(
        'removeGitWorktree',
        { claimToken: 'tok-stale', path: repo, worktreePath: linked },
        deps,
      )) as { claimTokenVerified?: boolean; error?: string; success: boolean };
      expect(stale).toMatchObject({ claimTokenVerified: false, success: false });
      expect(existsSync(linked)).toBe(true);

      const removed = (await executeDeviceRpc(
        'removeGitWorktree',
        { claimToken: 'tok-secret', path: repo, worktreePath: linked },
        deps,
      )) as { claimTokenVerified?: boolean; success: boolean };
      expect(removed).toMatchObject({ claimTokenVerified: true, success: true });
      expect(existsSync(linked)).toBe(false);
    } finally {
      await rm(parent, { force: true, recursive: true });
      await rm(repo, { force: true, recursive: true });
    }
  });

  it('SB01: refuses a verified remove while a live writer owns the registered path', async () => {
    const repo = await initRepo();
    const parent = await mkdtemp(path.join(tmpdir(), 'device-control-wt-'));
    const linked = path.join(parent, 'linked');
    const deps = {
      ...makeDeps(),
      getActiveWorktreeWriter: vi.fn(async () => ({ operationId: 'op-live', pid: 42 })),
    };
    try {
      await executeDeviceRpc(
        'addGitWorktree',
        { branch: 'task/T-1', claimToken: 'tok-secret', path: repo, worktreePath: linked },
        deps,
      );

      const result = (await executeDeviceRpc(
        'removeGitWorktree',
        { claimToken: 'tok-secret', path: repo, worktreePath: linked },
        deps,
      )) as { claimTokenVerified?: boolean; error?: string; success: boolean };

      expect(result).toMatchObject({ claimTokenVerified: false, success: false });
      expect(result.error).toContain('live writer');
      expect(existsSync(linked)).toBe(true);
      expect(deps.getActiveWorktreeWriter).toHaveBeenCalledWith(linked);
    } finally {
      await rm(parent, { force: true, recursive: true });
      await rm(repo, { force: true, recursive: true });
    }
  });

  it('SB01: addGitWorktree without a claim token omits the capability flag', async () => {
    const repo = await initRepo();
    const parent = await mkdtemp(path.join(tmpdir(), 'device-control-wt-'));
    const linked = path.join(parent, 'linked');
    try {
      const added = (await executeDeviceRpc(
        'addGitWorktree',
        { branch: 'task/T-1', path: repo, worktreePath: linked },
        makeDeps(),
      )) as { claimRegistered?: boolean; success: boolean };
      expect(added.success).toBe(true);
      expect(added.claimRegistered).toBeUndefined();
    } finally {
      await rm(parent, { force: true, recursive: true });
      await rm(repo, { force: true, recursive: true });
    }
  });
});
