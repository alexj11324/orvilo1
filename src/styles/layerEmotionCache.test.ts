// @vitest-environment node
import { createInstance } from 'antd-style';
import { describe, expect, it } from 'vitest';

import { layerEmotionCache, toLayeredInsertArgs } from './layerEmotionCache';

// In node emotion returns the compiled CSS of each insert and keeps it in `inserted`.
const insertedCss = (cache: { inserted: object }) =>
  Object.values(cache.inserted)
    .filter((v): v is string => typeof v === 'string')
    .join('');

describe('toLayeredInsertArgs', () => {
  it('wraps a class rule, including nested at-rules, in the layer', () => {
    const [selector, wrapped] = toLayeredInsertArgs('antd-style', '.acss-abc', {
      name: 'abc',
      styles: 'color:red;@media (min-width:1px){color:blue;}',
    });

    expect(selector).toBe('');
    expect(wrapped.name).toBe('abc');
    expect(wrapped.styles).toBe(
      '@layer antd-style{.acss-abc{color:red;@media (min-width:1px){color:blue;}}}',
    );
  });

  it('prefixes a class rule with the zero-specificity vendor scope', () => {
    const [, wrapped] = toLayeredInsertArgs(
      'antd-style',
      '.acss-abc',
      { name: 'abc', styles: 'color:red;' },
      '.orvilo-editor-scope',
    );

    expect(wrapped.styles).toBe(
      '@layer antd-style{:where(.orvilo-editor-scope) .acss-abc{color:red;}}',
    );
  });

  it('layers selector-less fragments (keyframes, global sheets) without scoping them', () => {
    const keyframes = { name: 'k', styles: '@keyframes animation-k{from{opacity:0}to{opacity:1}}' };

    expect(toLayeredInsertArgs('antd-style', '', keyframes, '.orvilo-editor-scope')).toEqual([
      '',
      { ...keyframes, styles: `@layer antd-style{${keyframes.styles}}` },
    ]);
  });
});

describe('layerEmotionCache on a real antd-style instance', () => {
  // antd-style keeps one cache per key, so every test needs its own key.
  let counter = 0;
  const setup = (scope?: string) => {
    const instance = createInstance({ key: `lt-${'abcdefgh'[counter++]}` });
    const result = layerEmotionCache(instance.styleManager.cache, { scope });
    return { ...instance, result };
  };

  it('emits class rules, media queries and pseudo selectors inside one layer block each', () => {
    const { createStaticStyles, styleManager, result } = setup();
    expect(result).toBe('patched');

    const styles = createStaticStyles(({ css }) => ({
      box: css`
        color: red;

        &:hover {
          color: blue;
        }

        @media (width >= 600px) {
          color: green;
        }
      `,
    }));

    const out = insertedCss(styleManager.cache);

    expect(styles.box).toMatch(/^lt-[a-z]-/);
    expect(out).toContain(`@layer antd-style{.${styles.box}`);
    expect(out).toContain(`.${styles.box}:hover{color:blue;}`);
    expect(out).toMatch(/@media \(width\s*>=\s*600px\)\{\.lt-[a-z]-\w+\{color:green;\}/);
    // Every top-level rule starts a layer block.
    expect(out.startsWith('@layer antd-style{')).toBe(true);
    expect(out.match(/@layer antd-style\{/g)).toHaveLength(1);
  });

  it('layers @keyframes as a separate fragment', () => {
    const { createStaticStyles, keyframes, styleManager } = setup();
    const fade = keyframes`from{opacity:0}to{opacity:1}`;

    createStaticStyles(({ css }) => ({
      anim: css`
        animation: ${fade} 1s;
      `,
    }));

    const entries = Object.values(styleManager.cache.inserted).filter(
      (v): v is string => typeof v === 'string',
    );
    const keyframeEntry = entries.find((css) => css.includes('@keyframes animation-'));
    const classEntry = entries.find((css) => /\.lt-[a-z]-/.test(css));

    expect(keyframeEntry).toBeDefined();
    expect(keyframeEntry).toMatch(
      /^@layer antd-style\{(@-webkit-keyframes[^]*)?@keyframes animation-/,
    );
    expect(classEntry).toMatch(/^@layer antd-style\{\.lt-[a-z]-\w+\{.*animation:animation-/);
  });

  it('keeps a literal @keyframes written inside a class rule valid (nested in the layer block)', () => {
    const { createStaticStyles, styleManager } = setup();

    createStaticStyles(({ css }) => ({
      spin: css`
        @keyframes spin-inner {
          to {
            transform: rotate(360deg);
          }
        }

        animation: spin-inner 1s;
      `,
    }));

    expect(insertedCss(styleManager.cache)).toMatch(
      /^@layer antd-style\{\.lt-[a-z]-\w+\{[^}]*\}(@-webkit-keyframes[^]*)?@keyframes spin-inner\{[^]*\}\}$/,
    );
  });

  it('is idempotent and reports late patching', () => {
    const { styleManager } = setup();
    expect(layerEmotionCache(styleManager.cache)).toBe('already-patched');

    const late = createInstance({ key: 'latetest' });
    late.createStaticStyles(({ css }) => ({
      a: css`
        color: red;
      `,
    }));
    expect(layerEmotionCache(late.styleManager.cache)).toBe('late');
  });
});

describe('vendor scope on a real antd-style instance', () => {
  it('keeps class, pseudo, descendant and media rules inside the layer and the scope', () => {
    const instance = createInstance({ key: 'scoped' });
    expect(layerEmotionCache(instance.styleManager.cache, { scope: '.orvilo-editor-scope' })).toBe(
      'patched',
    );

    const styles = instance.createStaticStyles(({ css }) => ({
      root: css`
        color: red;

        &:hover {
          color: blue;
        }

        hr {
          display: none;
        }

        @media (width >= 600px) {
          color: green;
        }
      `,
    }));
    const out = insertedCss(instance.styleManager.cache);
    const scoped = `:where(.orvilo-editor-scope) .${styles.root}`;

    expect(out.startsWith('@layer antd-style{')).toBe(true);
    expect(out).toContain(`${scoped}{color:red;}`);
    expect(out).toContain(`${scoped}:hover{color:blue;}`);
    // A nested element selector such as the Markdown `hr` rule cannot leave the scope.
    expect(out).toContain(`${scoped} hr{display:none;}`);
    expect(out).toMatch(
      /@media \(width\s*>=\s*600px\)\{:where\(\.orvilo-editor-scope\) \.scoped-\w+\{color:green;\}/,
    );
    // No selector in the output escapes the scope.
    const selectors = out.match(/[^{}]+(?=\{)/g)!.filter((s) => !s.startsWith('@'));
    for (const selector of selectors) expect(selector).toContain(':where(.orvilo-editor-scope) ');
  });

  it('layers createGlobalStyle sheets so they sit below Tailwind utilities', () => {
    const instance = createInstance({ key: 'scopedglobal' });
    layerEmotionCache(instance.styleManager.cache, { scope: '.orvilo-editor-scope' });
    const cache = instance.styleManager.cache;

    cache.insert('', { name: 'g', styles: ':root{--lobe-ring:0 0 0 1px red;}' }, cache.sheet, true);

    expect(insertedCss(cache)).toBe('@layer antd-style{:root{--lobe-ring:0 0 0 1px red;}}');
  });
});
