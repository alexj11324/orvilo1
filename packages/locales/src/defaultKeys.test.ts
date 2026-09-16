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
 *
 * Both directions are checked. Source → JSON catches a key the runtime cannot
 * resolve; JSON → source catches a key left behind in the runtime after the
 * source dropped it, which is the more dangerous direction because it looks fine
 * until something reads it.
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
  // Namespaces whose source is not a literal key map (arrays of phrases, keys
  // generated from `model-bank`, or the `.vite` variants) yield nothing here.
  .filter(({ keys }) => keys.length > 0);

describe('default locale sources', () => {
  // A floor on the keys actually read, not on the number of files seen: if the
  // extraction regex stops matching — a namespace reformatted to four-space
  // indentation or double quotes — every assertion below would pass vacuously on
  // an empty set, and a file-count check would not notice.
  it('reads the keys it claims to read', () => {
    const total = sources.reduce((sum, { keys }) => sum + keys.length, 0);

    expect(sources.length).toBeGreaterThan(20);
    expect(total).toBeGreaterThan(10_000);
  });

  it.each(['en-US', 'zh-CN'])('never names a key with whitespace in %s', (locale) => {
    const sourceOffenders = sources.flatMap(({ keys, namespace }) =>
      keys.filter((key) => /\s/.test(key)).map((key) => `${namespace}: ${JSON.stringify(key)}`),
    );
    // A malformed name in the runtime resources is the one that actually reaches
    // `t()`; scanning only the source would miss it.
    const localeOffenders = sources.flatMap(({ namespace }) =>
      [...readLocaleKeys(locale, namespace)]
        .filter((key) => /\s/.test(key))
        .map((key) => `${namespace}: ${JSON.stringify(key)}`),
    );

    expect([...sourceOffenders, ...localeOffenders]).toEqual([]);
  });

  it('is mirrored exactly in en-US', () => {
    const missing = sources.flatMap(({ keys, namespace }) => {
      const translated = readLocaleKeys('en-US', namespace);
      return keys.filter((key) => !translated.has(key)).map((key) => `${namespace}: ${key}`);
    });
    const orphaned = sources.flatMap(({ keys, namespace }) => {
      const inSource = new Set(keys);
      return [...readLocaleKeys('en-US', namespace)]
        .filter((key) => !inSource.has(key))
        .map((key) => `${namespace}: ${key}`);
    });

    expect({ orphaned, missing }).toEqual({ orphaned: [], missing: [] });
  });

  /**
   * zh-CN is the other hand-maintained locale. It is allowed to ship only the
   * plural categories its language uses: i18next's `zh` rule resolves plurals
   * through `_other` alone, which is why `…attempts_one` exists in the source and
   * en-US but not here. Any sibling form of the same stem therefore counts.
   *
   * The ~30 machine-translated locales are not checked — they lag by design and
   * fall back to English until the daily workflow catches up.
   */
  it('covers the other hand-maintained locale', () => {
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
