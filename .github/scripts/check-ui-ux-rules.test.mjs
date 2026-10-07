import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { checkUIUXRules, POLICY_FILES } from './check-ui-ux-rules.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

async function fixture(t) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'orvilo-ui-rules-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const files = new Set([...POLICY_FILES, 'skills-lock.json']);
  for (const file of POLICY_FILES) {
    const text = await readFile(path.join(root, file), 'utf8');
    for (const match of text.matchAll(/\[[^\]\n]*\]\(([^)\s]+)\)/g)) {
      if (/^(?:[a-z]+:|#|\/)/i.test(match[1])) continue;
      const target = path.normalize(path.join(path.dirname(file), match[1].split('#')[0]));
      if (/DESIGN(?:\.dark)?\.md$|^\.agents\/skills\/(?:react|ux|design-system)\//.test(target))
        files.add(target);
    }
  }
  for (const file of files) {
    await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await cp(path.join(root, file), path.join(directory, file));
  }
  return directory;
}

async function append(directory, file, text) {
  const target = path.join(directory, file);
  await writeFile(target, `${await readFile(target, 'utf8')}\n${text}\n`);
}

test('the reconciled real policy passes', async () => {
  assert.deepEqual(await checkUIUXRules(root), []);
});

for (const [file, mandate, condition] of [
  [
    'DESIGN.md',
    '1. `@lobehub/ui/base-ui` — headless primitives, first choice for new code.',
    'legacy component priority',
  ],
  ['DESIGN.md', 'There is no 13px token; round to 12 or 14.', 'categorical 13px ban'],
  [
    'DESIGN.md',
    'Off-scale spacing values (6, 10, 13…) are drift — round to the nearest scale step.',
    'categorical off-scale rounding',
  ],
  [
    '.agents/skills/linear-design/SKILL.md',
    'Do not invent greys — map to the nearest Linear token.',
    'Linear reference promoted to token owner',
  ],
  [
    '.agents/skills/linear-ui-parity/SKILL.md',
    '`linear-design` owns the token values (surfaces, type scale, radius, spacing).',
    'Linear reference promoted to token owner',
  ],
  [
    '.agents/skills/ux/references/read.md',
    "- [ ] Active row uses `Block variant='filled'`.",
    'legacy UX layout mandate',
  ],
  [
    '.agents/skills/ux/references/read.md',
    '- [ ] Spacing/padding expressed as `Flexbox` / `Block` props.',
    'legacy UX layout mandate',
  ],
]) {
  test(`rejects a restored ${condition}: ${mandate}`, async (t) => {
    const directory = await fixture(t);
    await append(directory, file, mandate);
    const failures = await checkUIUXRules(directory);
    assert.ok(
      failures.some(
        (failure) => failure.file === file && failure.condition === condition && failure.line > 1,
      ),
    );
  });
}

test('dark companion cannot redefine shared geometry or theme selection', async (t) => {
  const directory = await fixture(t);
  const file = path.join(directory, 'DESIGN.dark.md');
  const text = await readFile(file, 'utf8');
  await writeFile(
    file,
    text.replace(
      'colors:',
      'themeable:\n  primaryColor: blue\ntypography:\n  fontSize: 14\nspacing:\n  XS: 8\nradius:\n  borderRadius: 8\ncontrols:\n  controlHeight: 36\nelevation:\n  boxShadow: none\ncolors:',
    ),
  );
  const failures = await checkUIUXRules(directory);
  assert.equal(
    failures.filter(({ condition }) => condition.startsWith('duplicate shared table:')).length,
    6,
  );
});

test('routing needs the correct owner, not a same-label link to another skill', async (t) => {
  const directory = await fixture(t);
  const file = path.join(directory, 'DESIGN.md');
  await writeFile(
    file,
    (await readFile(file, 'utf8')).replaceAll(
      '.agents/skills/react/SKILL.md',
      '.agents/skills/ux/SKILL.md',
    ),
  );
  assert.ok(
    (await checkUIUXRules(directory)).some(
      ({ condition }) =>
        condition === 'missing owner routing link to .agents/skills/react/SKILL.md',
    ),
  );
});

test('reports a dangling relative owner link at its source line', async (t) => {
  const directory = await fixture(t);
  await append(directory, 'AGENTS.md', '[React owner](.agents/skills/react/missing.md)');
  assert.ok(
    (await checkUIUXRules(directory)).some(
      ({ file, line, condition }) =>
        file === 'AGENTS.md' && line > 1 && condition.startsWith('broken owner link:'),
    ),
  );
});

test('upstream examples, archives, historical quotations and actual Base UI mentions are not mandates', async (t) => {
  const directory = await fixture(t);
  await append(
    directory,
    'DESIGN.md',
    'Base UI is a retained primitive dependency.\n> Historical: reach for `@lobehub/ui/base-ui` first, then root.\n```tsx\n// there is no 13px token\n```',
  );
  await append(directory, '.agents/skills/design-system/SKILL.md', 'There is no 13px token.');
  await mkdir(path.join(directory, 'docs/historical'), { recursive: true });
  await writeFile(
    path.join(directory, 'docs/historical/audit.md'),
    'map to the nearest Linear token',
  );
  assert.deepEqual(await checkUIUXRules(directory), []);
});

test('rejects silently switching the installed skill source', async (t) => {
  const directory = await fixture(t);
  const file = path.join(directory, 'skills-lock.json');
  const lock = JSON.parse(await readFile(file, 'utf8'));
  lock.skills['design-system'].source = 'other/design-system';
  await writeFile(file, JSON.stringify(lock));
  assert.ok(
    (await checkUIUXRules(directory)).some(
      ({ file: source, condition }) =>
        source === 'skills-lock.json' && condition.includes('nextlevelbuilder'),
    ),
  );
});

test('CLI fails with file and line diagnostics on a conflicting policy', async (t) => {
  const directory = await fixture(t);
  await append(directory, 'DESIGN.md', 'When base-ui has the component, use it.');
  await assert.rejects(
    promisify(execFile)(process.execPath, [
      path.join(root, '.github/scripts/check-ui-ux-rules.mjs'),
      directory,
    ]),
    (error) => error.code === 1 && /DESIGN\.md:\d+: legacy component priority/.test(error.stderr),
  );
});

test('local formatter gate preserves upstream and frozen packet bytes for absolute staged paths', async (t) => {
  const directory = await fixture(t);
  const targets = [
    '.agents/skills/design-system/SKILL.md',
    'vendor/example.md',
    'docs/implementation/navigation-attention-v4/example.md',
  ];
  for (const file of targets) {
    await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await writeFile(path.join(directory, file), '# Unformatted upstream\n\n|one|two|\n');
  }
  await promisify(execFile)(
    process.execPath,
    [
      path.join(root, 'scripts/lint-staged-skip-packet.mjs'),
      'md',
      ...targets.map((file) => path.join(directory, file)),
    ],
    { cwd: directory, env: { ...process.env, PATH: '' } },
  );
  for (const file of targets) {
    assert.equal(
      await readFile(path.join(directory, file), 'utf8'),
      '# Unformatted upstream\n\n|one|two|\n',
    );
  }
});

test('absolute first-party staged policy paths run the rule guard before formatting', async (t) => {
  const directory = await fixture(t);
  await mkdir(path.join(directory, '.github/scripts'), { recursive: true });
  await cp(
    path.join(root, '.github/scripts/check-ui-ux-rules.mjs'),
    path.join(directory, '.github/scripts/check-ui-ux-rules.mjs'),
  );
  await append(directory, 'DESIGN.md', 'When base-ui has the component, use it.');
  await assert.rejects(
    promisify(execFile)(
      process.execPath,
      [
        path.join(root, 'scripts/lint-staged-skip-packet.mjs'),
        'md',
        path.join(directory, 'DESIGN.md'),
      ],
      { cwd: directory, env: { ...process.env, PATH: path.dirname(process.execPath) } },
    ),
    (error) => error.code === 1 && /DESIGN\.md:\d+: legacy component priority/.test(error.stderr),
  );
});
