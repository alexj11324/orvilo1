import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `src/default/*.ts` is the source these namespaces are authored in, and
 * `locales/{en-US,zh-CN}/*.json` are what the app resolves at runtime. The two
 * are mirrored by hand, so nothing but a check like this keeps them aligned.
 *
 * They have drifted before, in a way no test caught: a repo-wide
 * "Lobe" → "Orvilo" rename rewrote key *names* as well as values, producing
 * `storage.actions.copyOrvilo AI.button` in the source — a key holding a space,
 * which no `t()` call can ever spell. The runtime resources kept the original
 * name, so the UI was unaffected and the divergence stayed invisible.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const defaultDir = path.join(here, 'default');
const localesDir = path.resolve(here, '../../../locales');

/** i18next appends the CLDR plural category to a key: `…attempts_one`. */
const PLURAL_SUFFIX = /_(?:few|many|one|other|two|zero)$/;

/** Literal `'key':` entries — the shape these namespace files are authored in. */
const readSourceKeys = (file: string): string[] =>
  [
    ...readFileSync(path.join(defaultDir, file), 'utf8').matchAll(/^ {2}'((?:[^'\\]|\\.)+)':/gm),
  ].map((match) => match[1]);

const readLocaleKeys = (locale: string, namespace: string): Set<string> => {
  const file = path.join(localesDir, locale, `${namespace}.json`);
  return new Set(Object.keys(JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>));
};

const namespaceFiles = readdirSync(defaultDir).filter(
  // `index.ts` is the registry that aggregates the namespaces, not one of them —
  // its only quoted keys are the two shorthand entries in its resources object.
  (file) => file.endsWith('.ts') && file !== 'index.ts',
);
const sources = namespaceFiles
  .map((file) => ({ keys: readSourceKeys(file), namespace: path.basename(file, '.ts') }))
  // Namespaces whose source is not a literal key map (arrays of phrases, or keys
  // generated from `model-bank`) yield nothing here and are covered elsewhere.
  .filter(({ keys }) => keys.length > 0);

describe('default locale sources', () => {
  it('covers namespaces, so a rename cannot hide a whole file from this check', () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it('never names a key with whitespace', () => {
    const offenders = sources.flatMap(({ keys, namespace }) =>
      keys.filter((key) => /\s/.test(key)).map((key) => `${namespace}: ${JSON.stringify(key)}`),
    );

    expect(offenders).toEqual([]);
  });

  it('is mirrored exactly in en-US', () => {
    const missing = sources.flatMap(({ keys, namespace }) => {
      const translated = readLocaleKeys('en-US', namespace);
      return keys.filter((key) => !translated.has(key)).map((key) => `${namespace}: ${key}`);
    });

    expect(missing).toEqual([]);
  });

  /**
   * Other locales are hand-translated, so they are allowed to ship only the plural
   * categories their language uses: i18next's `zh` rule resolves plurals through
   * `_other` alone, which is why `…attempts_one` exists in the source and en-US but
   * not in zh-CN. Any sibling form of the same stem therefore counts as covered.
   */
  it('covers every other shipped locale', () => {
    const missing = sources.flatMap(({ keys, namespace }) => {
      const translated = readLocaleKeys('zh-CN', namespace);
      const hasPluralSibling = (key: string) => {
        const stem = key.replace(PLURAL_SUFFIX, '');
        return (
          stem !== key &&
          [...translated].some((candidate) => candidate !== key && candidate.startsWith(stem))
        );
      };

      return keys
        .filter((key) => !translated.has(key) && !hasPluralSibling(key))
        .map((key) => `${namespace}: ${key}`);
    });

    expect(missing).toEqual([]);
  });
});
