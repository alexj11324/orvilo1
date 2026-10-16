import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Ratchet for the antd / @lobehub/ui retirement (docs/development/antd-retirement-plan.md).
 *
 * Counts may only go down. When a migration PR lowers one, lower its baseline
 * here in the same PR so the next PR cannot add the usage back.
 *
 * `@lobehub/editor`, `@lobehub/charts` and `@lobehub/icons` stay in the product
 * and import these packages at runtime; only first-party sources are counted.
 * The one first-party host for them is `src/components/LobeThemeScope`.
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
  antVarReferences: 0,
  importingFiles: {
    '@ant-design/cssinjs': 1,
    '@lobehub/ui': 2,
    'antd': 0,
    'antd-style': 1,
  },
} as const;

/** The only directory allowed to import the retired packages. */
const VENDOR_HOST_DIR = path.join('src', 'components', 'LobeThemeScope');

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

const sourceFiles = SCANNED_ROOTS.flatMap((root) => collectSources(path.join(REPO_ROOT, root)));
const sources = sourceFiles.map((filePath) => readFileSync(filePath, 'utf8'));
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

  it('keeps every remaining import inside the vendor host', () => {
    const importers = sourceFiles
      .filter((_, index) =>
        Object.values(measureRetiredUsage([sources[index]]).importingFiles).some(Boolean),
      )
      .map((filePath) => path.relative(REPO_ROOT, filePath));

    expect(importers.length).toBeGreaterThan(0);

    for (const importer of importers) expect(importer.startsWith(VENDOR_HOST_DIR)).toBe(true);
  });

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
