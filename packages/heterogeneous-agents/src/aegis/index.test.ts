// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { AEGIS_PACK_REVISION, collectAegisArtifacts, materializeAegisPack } from './index';

const { join } = path;

let dirs: string[] = [];

afterEach(async () => {
  for (const dir of dirs) await rm(dir, { force: true, recursive: true });
  dirs = [];
});

const workspace = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aegis-test-'));
  dirs.push(dir);
  return dir;
};

describe('materializeAegisPack', () => {
  it('writes the pack into the generic skills dir for an unknown host', async () => {
    const cwd = await workspace();
    const { dirs: written, packRevision } = await materializeAegisPack({
      agentType: 'some-future-cli',
      cwd,
    });
    expect(written).toEqual([join('.agents', 'skills', 'aegis')]);
    expect(packRevision).toBe(AEGIS_PACK_REVISION);
    // Spot-check a real skill file and the LICENSE landed.
    const license = await readFile(join(cwd, '.agents', 'skills', 'aegis', 'LICENSE'), 'utf8');
    expect(license).toContain('MIT');
    const skill = await readFile(
      join(cwd, '.agents', 'skills', 'aegis', 'verification-before-completion', 'SKILL.md'),
      'utf8',
    );
    expect(skill.length).toBeGreaterThan(0);
  });

  it('additionally mirrors into the host-native skills dir for claude-code', async () => {
    const cwd = await workspace();
    const { dirs: written } = await materializeAegisPack({ agentType: 'claude-code', cwd });
    expect(written).toEqual([
      join('.agents', 'skills', 'aegis'),
      join('.claude', 'skills', 'aegis'),
    ]);
    const hostSkill = await readFile(
      join(cwd, '.claude', 'skills', 'aegis', 'verification-before-completion', 'SKILL.md'),
      'utf8',
    );
    expect(hostSkill.length).toBeGreaterThan(0);
  });
});

describe('collectAegisArtifacts', () => {
  it('returns [] when no artifact dirs exist', async () => {
    expect(await collectAegisArtifacts(await workspace())).toEqual([]);
  });

  it('collects .aegis/** recursively plus docs/aegis JSON only', async () => {
    const cwd = await workspace();
    await mkdir(join(cwd, '.aegis', 'reports'), { recursive: true });
    await writeFile(join(cwd, '.aegis', 'closeout.json'), '{"confidence":"A"}');
    await writeFile(join(cwd, '.aegis', 'reports', 'drift.json'), '{}');
    await writeFile(join(cwd, '.aegis', 'notes.md'), 'human notes'); // still collected
    await mkdir(join(cwd, 'docs', 'aegis'), { recursive: true });
    await writeFile(join(cwd, 'docs', 'aegis', 'retirement.json'), '{}');
    await writeFile(join(cwd, 'docs', 'aegis', 'draft.md'), 'not json — skipped');

    const files = await collectAegisArtifacts(cwd);
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual([
      '.aegis/closeout.json',
      '.aegis/notes.md',
      '.aegis/reports/drift.json',
      'docs/aegis/retirement.json',
    ]);
    expect(files.find((f) => f.path === '.aegis/closeout.json')?.content).toBe(
      '{"confidence":"A"}',
    );
  });

  it('skips binary-looking files and oversized files', async () => {
    const cwd = await workspace();
    await mkdir(join(cwd, '.aegis'), { recursive: true });
    await writeFile(join(cwd, '.aegis', 'ok.json'), '{}');
    await writeFile(join(cwd, '.aegis', 'bin.dat'), Buffer.from([0, 1, 2]));
    await writeFile(join(cwd, '.aegis', 'big.json'), 'x'.repeat(200 * 1024));

    const files = await collectAegisArtifacts(cwd);
    expect(files.map((f) => f.path)).toEqual(['.aegis/ok.json']);
  });
});
