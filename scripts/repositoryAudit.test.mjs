import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { writeAudit } from './repositoryAudit.mjs';

test('inventories immutable additions, deletions, modifications, unchanged files and value-free env references', () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'orvilo-audit-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), content);
  };
  try {
    git('init', '-q');
    git('config', 'user.name', 'Audit test');
    git('config', 'user.email', 'audit@example.invalid');
    write(
      'src/config.ts',
      "process.env.OLD_AUTH; process.env.KEEP; const secret = 'never-export-this';",
    );
    write('removed.md', 'old');
    write('unchanged.md', 'same');
    write('.agents/skills/example/SKILL.md', '# Example');
    git('add', '.');
    git('commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    write(
      'src/config.ts',
      "process.env['NEW_AUTH']; import.meta.env.VITE_PUBLIC; process.env.KEEP;",
    );
    write('src/new.ts', 'export const added = true;');
    write('src/fixture.test.ts', 'process.env.TEST_ONLY;');
    rmSync(path.join(cwd, 'removed.md'));
    git('add', '-A');
    git('commit', '-qm', 'current');
    const head = git('rev-parse', 'HEAD');
    write('src/config.ts', 'process.env.UNCOMMITTED;');
    const output = path.join(cwd, 'output');
    const audit = writeAudit(cwd, base, head, output);
    assert.deepEqual(audit.counts, { '=': 2, 'D': 1, 'M': 1, 'A': 2 });
    assert.equal(audit.skills.length, 1);
    assert.equal(
      audit.environment.find(({ name }) => name === 'OLD_AUTH').status,
      'removed-reference',
    );
    assert.equal(
      audit.environment.find(({ name }) => name === 'NEW_AUTH').status,
      'added-reference',
    );
    assert.equal(
      audit.environment.find(({ name }) => name === 'KEEP').status,
      'retained-reference',
    );
    assert.ok(audit.environment.some(({ name }) => name === 'VITE_PUBLIC'));
    assert.ok(!audit.environment.some(({ name }) => ['TEST_ONLY', 'UNCOMMITTED'].includes(name)));
    assert.doesNotMatch(
      readFileSync(path.join(output, 'environment.json'), 'utf8'),
      /never-export-this/,
    );
    assert.match(readFileSync(path.join(output, 'files.tsv'), 'utf8'), /removed\.md/);
    assert.throws(() => writeAudit(cwd, head, base, output));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
