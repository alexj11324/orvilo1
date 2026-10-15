import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Ratchet for the antd / @lobehub/ui retirement (docs/development/antd-retirement-plan.md).
 *
 * Counts may only go down. When a migration PR lowers one, lower its baseline
 * here in the same PR so the next PR cannot add the usage back.
 *
 * `@lobehub/editor` and `@lobehub/icons` stay in the product and import these
 * packages at runtime; only first-party sources are counted.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SCANNED_ROOTS = ['src', 'packages', 'apps'];
const SKIPPED_DIRS = new Set([
  '.next',
  '.react-router',
  '__mocks__',
  '__tests__',
  'build',
  'coverage',
  'dist',
  'es',
  'fixtures',
  'lib',
  'node_modules',
]);

const BASELINE = {
  antVarReferences: 59,
  importingFiles: {
    '@ant-design/cssinjs': 4,
    '@lobehub/ui': 280,
    'antd': 6,
    'antd-style': 3,
  },
} as const;

type RetiredModule = keyof typeof BASELINE.importingFiles;

const RETIRED_IMPORT =
  /(?:from\s+|import\s*\(\s*|import\s+)["']((?:antd|antd-style|@ant-design\/cssinjs|@lobehub\/ui)(?:\/[^"']*)?)["']/g;
const ANT_VAR_REFERENCE = /(?<![\w-])--ant-[a-z]/g;

const collectSources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : collectSources(filePath);
    return /\.(?:css|mts|ts|tsx)$/.test(entry.name) &&
      !/\.(?:spec|test)\.|\.d\.ts$/.test(entry.name)
      ? [filePath]
      : [];
  });

const packageName = (specifier: string) =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/') as RetiredModule;

export const measureRetiredUsage = (texts: string[]) => {
  const importingFiles = Object.fromEntries(
    Object.keys(BASELINE.importingFiles).map((name) => [name, 0]),
  ) as Record<RetiredModule, number>;
  let antVarReferences = 0;

  for (const text of texts) {
    antVarReferences += text.match(ANT_VAR_REFERENCE)?.length ?? 0;
    const modules = new Set(
      [...text.matchAll(RETIRED_IMPORT)].map((match) => packageName(match[1])),
    );
    for (const name of modules) importingFiles[name] += 1;
  }

  return { antVarReferences, importingFiles };
};

const sources = SCANNED_ROOTS.flatMap((root) => collectSources(path.join(REPO_ROOT, root))).map(
  (filePath) => readFileSync(filePath, 'utf8'),
);
const current = measureRetiredUsage(sources);

describe('antd retirement ratchet', () => {
  it('does not add --ant-* references (var() and Tailwind (--x) forms)', () => {
    expect(current.antVarReferences).toBeLessThanOrEqual(BASELINE.antVarReferences);
  });

  it.each(Object.keys(BASELINE.importingFiles) as RetiredModule[])(
    'does not add files importing %s',
    (name) => {
      expect(current.importingFiles[name]).toBeLessThanOrEqual(BASELINE.importingFiles[name]);
    },
  );

  it('counts every import form and subpath once per file', () => {
    const measured = measureRetiredUsage([
      [
        "import { Flexbox } from '@lobehub/ui';",
        "import { Select } from '@lobehub/ui/base-ui';",
        "import type { ThemeConfig } from 'antd';",
        "const Lazy = lazy(() => import('antd-style'));",
        "import '@ant-design/cssinjs';",
        'const css = `color: var(--ant-color-text); border: var(--ant-color-border);`;',
      ].join('\n'),
      "import { Markdown } from '@lobehub/ui/mdx';",
      "import { Editor } from '@lobehub/editor';",
    ]);

    expect(measured).toEqual({
      antVarReferences: 2,
      importingFiles: { '@ant-design/cssinjs': 1, '@lobehub/ui': 2, 'antd': 1, 'antd-style': 1 },
    });
  });
});
