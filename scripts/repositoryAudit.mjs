#!/usr/bin/env node
/** Immutable, value-free repository inventory; semantic findings live in the accompanying report. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const git = (cwd, args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });

const resolveCommit = (cwd, ref) =>
  git(cwd, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();

const tree = (cwd, ref) =>
  new Map(
    git(cwd, ['ls-tree', '-rz', '--full-tree', ref])
      .split('\0')
      .filter(Boolean)
      .map((entry) => {
        const tab = entry.indexOf('\t');
        const [mode, type, oid] = entry.slice(0, tab).split(' ');
        return [entry.slice(tab + 1), { mode, type, oid }];
      }),
  );

export const category = (file) => {
  if (
    file.includes('/skills/') ||
    file.includes('/builtin-skills/') ||
    /(?:^|\/)SKILL\.md$/.test(file)
  )
    return 'skills';
  if (/(?:test|spec)\.[cm]?[jt]sx?$/.test(file) || /^(?:tests|e2e)\//.test(file)) return 'tests';
  if (file.startsWith('docs/') || /\.(?:md|mdx)$/.test(file)) return 'documentation';
  if (file.startsWith('locales/') || file.startsWith('packages/locales/')) return 'localization';
  if (file.startsWith('packages/database/')) return 'database';
  if (file.startsWith('apps/server/')) return 'backend';
  if (file.startsWith('apps/desktop/')) return 'desktop';
  if (file.startsWith('apps/cli/')) return 'cli';
  if (file.startsWith('src/')) return 'web';
  if (file.startsWith('packages/')) return 'shared-packages';
  if (
    /^(?:docker-compose|scripts|\.github)\//.test(file) ||
    /(?:^|\/)(?:Dockerfile|.*\.env.*|.*config.*|package\.json)$/.test(file)
  )
    return 'configuration-tooling';
  return 'other';
};

export const environmentReferences = (cwd, ref) => {
  let lines;
  try {
    lines = git(cwd, [
      'grep',
      '-n',
      '-I',
      '-E',
      'process[.]env|import[.]meta[.]env',
      ref,
      '--',
      '*.ts',
      '*.tsx',
      '*.mts',
      '*.cts',
      '*.js',
      '*.jsx',
      '*.mjs',
      '*.cjs',
    ]);
  } catch (error) {
    if (error.status === 1) return {};
    throw error;
  }
  const refs = {};
  for (const line of lines.split('\n')) {
    const match = /^[^:]+:(.*?):(\d+):(.*)$/.exec(line);
    if (!match) continue;
    const [, file, lineNumber, source] = match;
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) || /^(?:tests|e2e|vendor)\//.test(file))
      continue;
    for (const name of source.matchAll(
      /(?:process\.env|import\.meta\.env)(?:\.([A-Z][A-Z0-9_]*)|\[['"]([A-Z][A-Z0-9_]*)['"]\])/g,
    )) {
      const key = name[1] || name[2];
      const location = `${file}:${lineNumber}`;
      refs[key] ??= [];
      if (!refs[key].includes(location)) refs[key].push(location);
    }
  }
  return Object.fromEntries(Object.entries(refs).sort(([a], [b]) => a.localeCompare(b)));
};

export const collectAudit = (cwd, baseRef, headRef) => {
  const base = resolveCommit(cwd, baseRef);
  const head = resolveCommit(cwd, headRef);
  git(cwd, ['merge-base', '--is-ancestor', base, head]);
  const before = tree(cwd, base);
  const after = tree(cwd, head);
  const files = [...new Set([...before.keys(), ...after.keys()])].sort().map((file) => {
    const old = before.get(file);
    const current = after.get(file);
    const status = !old
      ? 'A'
      : !current
        ? 'D'
        : old.oid !== current.oid || old.mode !== current.mode
          ? 'M'
          : '=';
    return { file, status, category: category(file), before: old ?? null, after: current ?? null };
  });
  const oldEnv = environmentReferences(cwd, base);
  const newEnv = environmentReferences(cwd, head);
  const environment = [...new Set([...Object.keys(oldEnv), ...Object.keys(newEnv)])]
    .sort()
    .map((name) => ({
      name,
      status: !oldEnv[name]
        ? 'added-reference'
        : !newEnv[name]
          ? 'removed-reference'
          : 'retained-reference',
      before: oldEnv[name] ?? [],
      after: newEnv[name] ?? [],
    }));
  const counts = {};
  const areas = {};
  for (const file of files) {
    counts[file.status] = (counts[file.status] ?? 0) + 1;
    const area = (areas[file.category] ??= {});
    area[file.status] = (area[file.status] ?? 0) + 1;
  }
  const skills = files.filter(
    ({ file }) => file.startsWith('.agents/skills/') && file.endsWith('/SKILL.md'),
  );
  return { base, head, counts, areas, files, environment, skills };
};

export const writeAudit = (cwd, base, head, output) => {
  const audit = collectAudit(cwd, base, head);
  mkdirSync(output, { recursive: true });
  const tsv = (rows) =>
    rows
      .map((row) =>
        row
          .map((value) => String(value).replaceAll('\t', '\\t').replaceAll('\n', '\\n'))
          .join('\t'),
      )
      .join('\n') + '\n';
  writeFileSync(
    path.join(output, 'files.tsv'),
    tsv([
      ['status', 'category', 'path', 'before_mode', 'before_blob', 'after_mode', 'after_blob'],
      ...audit.files.map((file) => [
        file.status,
        file.category,
        file.file,
        file.before?.mode ?? '-',
        file.before?.oid ?? '-',
        file.after?.mode ?? '-',
        file.after?.oid ?? '-',
      ]),
    ]),
  );
  writeFileSync(
    path.join(output, 'environment.json'),
    JSON.stringify(audit.environment, null, 2) + '\n',
  );
  writeFileSync(
    path.join(output, 'skills.tsv'),
    tsv([['status', 'path'], ...audit.skills.map(({ status, file }) => [status, file])]),
  );
  writeFileSync(
    path.join(output, 'commits.tsv'),
    'commit\tsubject\n' +
      git(cwd, ['log', '--reverse', '--format=%H%x09%s', `${audit.base}..${audit.head}`]),
  );
  writeFileSync(
    path.join(output, 'summary.json'),
    JSON.stringify(
      {
        base: audit.base,
        head: audit.head,
        counts: audit.counts,
        areas: audit.areas,
        environmentNames: audit.environment.length,
        currentSkills: audit.skills.filter(({ after }) => after).length,
        scope:
          'Immutable tracked trees, including unchanged paths. Renames are A+D. Environment inventory covers literal process.env/import.meta.env references in JS/TS, excluding test files and tests/e2e/vendor roots; comments may match. Dynamic names, destructuring, shell variables and semantic correctness require manual review. Values are never exported. Working-tree fixes are not part of this historical snapshot.',
      },
      null,
      2,
    ) + '\n',
  );
  return audit;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [base, head, output] = process.argv.slice(2);
  if (!base || !head || !output) {
    console.error(
      'Usage: node scripts/repositoryAudit.mjs <base-commit> <head-commit> <output-directory>',
    );
    process.exitCode = 1;
  } else {
    const audit = writeAudit(process.cwd(), base, head, path.resolve(output));
    console.log(
      JSON.stringify({
        base: audit.base,
        head: audit.head,
        counts: audit.counts,
        environmentNames: audit.environment.length,
      }),
    );
  }
}
